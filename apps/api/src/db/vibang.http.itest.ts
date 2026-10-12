import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { FailClosedResolver, SyntheticHeaderResolver } from '../http/actor';

// Cần PostgreSQL tạm. HTTP thật (fetch tới Nest) + DB thật + vai legal_app có RLS. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_http_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const PDF = 'application/pdf';

describe.skipIf(!ADMIN_URL)('Vi bằng HTTP API over PostgreSQL (synthetic)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let closedPool: pg.Pool;
  let server: INestApplication;
  let closed: INestApplication;
  let base = '';
  let closedBase = '';
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const BR1 = id();
  const BR2 = id();
  const U = {
    admin: id(),
    thv: id(),
    acc: id(),
    accOther: id(),
    clerk: id(),
    clerkOther: id(),
    head: id(),
    thv2: id(),
    otherTenant: id(),
  };
  const CUST = id();

  const api = async (
    method: string,
    path: string,
    user: string | null,
    body?: unknown,
    tenant: string = T,
    root: string = base,
  ) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (user) {
      headers['x-synthetic-user'] = user;
      headers['x-synthetic-tenant'] = tenant;
    }
    const res = await fetch(`${root}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  };
  const newAssignedCase = async (): Promise<string> => {
    const cid = id();
    await owner.query(
      `INSERT INTO vibang_cases (id, tenant_id, office_id, branch_id, customer_id, title) VALUES ($1,$2,$3,$4,$5,'Hồ sơ giả lập')`,
      [cid, T, OFF, BR1, CUST],
    );
    await owner.query(
      `UPDATE vibang_cases SET status = 'ASSIGNED', responsible_thv_user_id = $2, version = 2 WHERE id = $1`,
      [cid, U.thv],
    );
    return cid;
  };
  const statusOf = async (c: string) =>
    (await owner.query(`SELECT status FROM vibang_cases WHERE id = $1`, [c])).rows[0]
      .status as string;

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${DB}`);
    await admin.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legal_app') THEN CREATE ROLE legal_app LOGIN; END IF; END $$`,
    );
    owner = new pg.Pool({ connectionString: withDb(ADMIN_URL!, DB), max: 2 });
    await owner.query(MIGRATION);
    await owner.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO legal_app');
    await owner.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO legal_app');
    const appUrl = new URL(withDb(ADMIN_URL!, DB));
    appUrl.username = 'legal_app';
    appUrl.password = '';
    appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 8 });
    closedPool = new pg.Pool({ connectionString: appUrl.toString(), max: 2 });

    server = await NestFactory.create(
      AppModule.register({ pool: appPool, resolver: new SyntheticHeaderResolver() }),
      { logger: false },
    );
    await server.listen(0);
    base = (await server.getUrl()).replace('[::1]', 'localhost');
    closed = await NestFactory.create(
      AppModule.register({ pool: closedPool, resolver: new FailClosedResolver() }),
      { logger: false },
    );
    await closed.listen(0);
    closedBase = (await closed.getUrl()).replace('[::1]', 'localhost');

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [OFF, T]);
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN1'),($4,$2,$3,'CN2')`,
      [BR1, T, OFF, BR2],
    );
    const people: [string, string, string | null][] = [
      [U.admin, 'ADMIN', null],
      [U.thv, 'THV', null],
      [U.acc, 'KE_TOAN', BR1],
      [U.accOther, 'KE_TOAN', BR2],
      [U.clerk, 'VAN_THU', BR1],
      [U.clerkOther, 'VAN_THU', BR2],
      [U.head, 'TRUONG_VP', null],
      [U.thv2, 'THV', null],
    ];
    for (const [uid, role, branch] of people) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        role,
      ]);
      const m = await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4) RETURNING id`,
        [T, uid, OFF, role],
      );
      if (branch) {
        await owner.query(
          `INSERT INTO branch_grants (tenant_id, membership_id, branch_id) VALUES ($1,$2,$3)`,
          [T, m.rows[0].id, branch],
        );
      }
    }
    await owner.query(`UPDATE memberships SET legal_signer = true WHERE user_id IN ($1,$2)`, [
      U.admin,
      U.head,
    ]);
    await owner.query(
      `INSERT INTO customers (id, tenant_id, kind, external_ref) VALUES ($1,$2,'PERSON','c')`,
      [CUST, T],
    );
  });

  afterAll(async () => {
    await server?.close();
    await closed?.close();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('fails closed without an authenticated actor', async () => {
    const c = await newAssignedCase();
    expect((await api('POST', `/vibang/cases/${c}/number`, null)).status).toBe(401);
    expect(
      (await api('POST', `/vibang/cases/${c}/number`, U.clerk, undefined, T, closedBase)).status,
    ).toBe(401);
    const bad = await fetch(`${base}/vibang/cases/${c}/number`, {
      method: 'POST',
      headers: { 'x-synthetic-user': 'not-a-uuid', 'x-synthetic-tenant': T },
    });
    expect(bad.status).toBe(401);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it('runs the lawful path over HTTP and denies illegal steps with the right status and audit', async () => {
    const c = await newAssignedCase();
    const p = (s: string) => `/vibang/cases/${c}/${s}`;

    // MISA thủ công: sai chi nhánh bị chặn, đúng chi nhánh ghi được.
    expect(
      (await api('PUT', p('misa'), U.accOther, { status: 'CONFIRMED_FULL', reference: 'MISA-1' }))
        .status,
    ).toBe(403);
    expect(
      (await api('PUT', p('misa'), U.clerk, { status: 'CONFIRMED_FULL', reference: 'MISA-1' }))
        .status,
    ).toBe(403);
    expect((await api('PUT', p('misa'), U.acc, { status: 'CONFIRMED_FULL' })).status).toBe(422);
    expect(
      (await api('PUT', p('misa'), U.acc, { status: 'CONFIRMED_FULL', reference: 'MISA-1' }))
        .status,
    ).toBe(200);

    // Số: văn thư sai chi nhánh bị chặn; cấp một lần, gọi lại idempotent.
    expect((await api('POST', p('number'), U.clerkOther)).status).toBe(403);
    const first = await api('POST', p('number'), U.clerk);
    expect(first.status).toBe(200);
    expect(first.json.label).toMatch(/^\d+\/\d{4}\/VB-THV$/);
    const again = await api('POST', p('number'), U.clerk);
    expect(again.json).toMatchObject({ code: 'ALREADY_ALLOCATED', label: first.json.label });

    // Ký/đóng dấu/scan/trả: thiếu bước bị 409, sai người bị 403.
    expect((await api('POST', p('return'), U.clerk)).status).toBe(409);
    expect((await api('POST', p('signature-confirmations'), U.clerk)).status).toBe(403);
    expect((await api('POST', p('signature-confirmations'), U.thv)).status).toBe(200);
    expect((await api('POST', p('stamp-confirmations'), U.clerkOther)).status).toBe(403);
    expect((await api('POST', p('stamp-confirmations'), U.clerk)).status).toBe(200);
    const doc = {
      kind: 'FINAL_SCAN',
      source: 'UPLOADED',
      objectKey: `cases/${c}/scan`,
      sha256: 'd'.repeat(64),
      mime: PDF,
      sizeBytes: 2048,
    };
    expect((await api('POST', p('documents'), U.clerk, { ...doc, mime: 'image/png' })).status).toBe(
      422,
    );
    expect((await api('POST', p('return'), U.clerk)).json).toMatchObject({
      code: 'FINAL_SCAN_MISSING',
    });
    expect((await api('POST', p('documents'), U.clerk, doc)).status).toBe(200);
    const back = await api('POST', p('return'), U.clerk);
    expect(back).toMatchObject({ status: 200, json: { label: 'd'.repeat(64) } });
    expect(await statusOf(c)).toBe('RETURNED');

    // Sở thất bại sau khi trả: ghi sự cố, không đổi RETURNED.
    const reg = await api('PUT', p('registration'), U.clerk, {
      status: 'FAILED',
      deadlineAt: '2026-12-01T00:00:00Z',
      reasonCode: 'SO_REJECTED',
    });
    expect(reg.status).toBe(200);
    expect(await statusOf(c)).toBe('RETURNED');
    expect(
      (
        await owner.query(
          `SELECT count(*)::int n FROM vibang_registration_incidents WHERE case_id = $1`,
          [c],
        )
      ).rows[0].n,
    ).toBe(1);

    // Mọi lần từ chối đã được audit trong DB.
    const denied = await owner.query(
      `SELECT count(*)::int n FROM audit_log WHERE outcome = 'deny' AND action LIKE 'vibang.%'`,
    );
    expect(denied.rows[0].n).toBeGreaterThanOrEqual(6);
  });

  it('validates input and rejects malformed ids or unknown fields', async () => {
    const c = await newAssignedCase();
    expect((await api('POST', '/vibang/cases/not-a-uuid/number', U.clerk)).status).toBe(400);
    expect(
      (
        await api('PUT', `/vibang/cases/${c}/misa`, U.acc, {
          status: 'CONFIRMED_FULL',
          reference: 'x',
          amount: 5,
        })
      ).status,
    ).toBe(400);
    expect((await api('PUT', `/vibang/cases/${c}/misa`, U.acc, { status: 'PARTIAL' })).status).toBe(
      422,
    );
    expect(
      (await api('POST', `/vibang/cases/${c}/misa/revoke-decisions`, U.admin, { accept: 'yes' }))
        .status,
    ).toBe(400);
  });

  it('hides cases of another tenant (404) and never leaks their data', async () => {
    const c = await newAssignedCase();
    const r = await api('POST', `/vibang/cases/${c}/number`, U.otherTenant, undefined, T2);
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ code: 'CASE_NOT_FOUND', label: null });
    expect(
      (await owner.query(`SELECT count(*)::int n FROM vibang_numbers WHERE case_id = $1`, [c]))
        .rows[0].n,
    ).toBe(0);
  });

  it('issues distinct sequential numbers under parallel HTTP requests', async () => {
    const cases = await Promise.all(Array.from({ length: 10 }, () => newAssignedCase()));
    for (const c of cases) {
      expect(
        (
          await api('PUT', `/vibang/cases/${c}/misa`, U.acc, {
            status: 'CONFIRMED_FULL',
            reference: 'M',
          })
        ).status,
      ).toBe(200);
    }
    const results = await Promise.all(
      cases.map((c) => api('POST', `/vibang/cases/${c}/number`, U.clerk)),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    const labels = results.map((r) => r.json.label as string);
    expect(new Set(labels).size).toBe(10);
    const seqs = labels.map((l) => Number(l.split('/')[0])).sort((a, b) => a - b);
    expect(seqs[9]! - seqs[0]!).toBe(9); // liên tiếp, không trùng
  });

  it('serves multiple documents over HTTP without closing the parent early', async () => {
    const root = '/service-of-documents';
    const created = await api('POST', `${root}/requests`, U.clerk, {
      officeId: OFF,
      branchId: BR1,
      requestRef: 'N-01/http',
    });
    expect(created.status).toBe(200);
    const req = created.json.label as string;
    expect(
      (
        await api('POST', `${root}/requests`, U.clerkOther, {
          officeId: OFF,
          branchId: BR1,
          requestRef: 'x',
        })
      ).status,
    ).toBe(403);

    const doc = async (name: string) => {
      const r = await api('POST', `${root}/requests/${req}/documents`, U.clerk, {
        recipientName: name,
        address: 'Địa chỉ giả lập',
        deadlineAt: '2026-12-01T00:00:00Z',
      });
      expect(r.status).toBe(200);
      return r.json.label as string;
    };
    const d1 = await doc('Người nhận 1');
    const d2 = await doc('Người nhận 2');
    expect(
      (await api('PUT', `${root}/documents/${d1}/handler`, U.clerk, { handlerUserId: U.thv }))
        .status,
    ).toBe(403);
    expect(
      (await api('PUT', `${root}/documents/${d1}/handler`, U.admin, { handlerUserId: U.thv }))
        .status,
    ).toBe(200);
    expect(
      (await api('PUT', `${root}/documents/${d2}/handler`, U.admin, { handlerUserId: U.thv }))
        .status,
    ).toBe(200);

    // Giờ tống đạt do máy chủ ghi; client không được gửi.
    expect(
      (
        await api('POST', `${root}/documents/${d1}/attempts`, U.thv, {
          outcome: 'ABSENT',
          at: '2020-01-01T00:00:00Z',
        })
      ).status,
    ).toBe(400);
    expect(
      (await api('POST', `${root}/documents/${d1}/attempts`, U.thv, { outcome: 'SERVED' })).status,
    ).toBe(422);
    expect(
      (
        await api('POST', `${root}/documents/${d1}/attempts`, U.thv, {
          outcome: 'SERVED',
          evidenceKey: 'td/http/1',
          evidenceSha256: 'e'.repeat(64),
        })
      ).status,
    ).toBe(200);
    expect((await api('POST', `${root}/requests/${req}/closure`, U.admin)).status).toBe(409);
    expect(
      (
        await api('POST', `${root}/documents/${d2}/undeliverable`, U.thv, {
          reason: 'NO_RECIPIENT',
        })
      ).status,
    ).toBe(409);
    expect(
      (await api('POST', `${root}/documents/${d2}/attempts`, U.thv, { outcome: 'NO_RECIPIENT' }))
        .status,
    ).toBe(200);
    expect(
      (
        await api('POST', `${root}/documents/${d2}/undeliverable`, U.thv, {
          reason: 'NO_RECIPIENT',
        })
      ).status,
    ).toBe(200);
    expect((await api('POST', `${root}/requests/${req}/closure`, U.clerk)).status).toBe(403);
    expect((await api('POST', `${root}/requests/${req}/closure`, U.admin)).status).toBe(200);
    expect(
      (await api('POST', `${root}/requests/${req}/closure`, U.admin, undefined, T2)).status,
    ).toBe(404);
    expect((await api('POST', `${root}/requests/${req}/closure`, null)).status).toBe(401);
  });

  it('runs a 3-round verification, N-06 conclusion and consented delegation over HTTP', async () => {
    const root = '/verification';
    const created = await api('POST', `${root}/cases`, U.clerk, {
      officeId: OFF,
      branchId: BR1,
      caseRef: 'XM/http',
    });
    expect(created.status).toBe(200);
    const cs = created.json.label as string;
    expect(
      (await api('POST', `${root}/cases/${cs}/rounds`, U.thv, { partyName: 'Bên A' })).status,
    ).toBe(403);
    expect(
      (await api('PUT', `${root}/cases/${cs}/handler`, U.admin, { handlerUserId: U.thv })).status,
    ).toBe(200);

    for (const party of ['Bên A', 'Bên B', 'Bên C']) {
      const r = await api('POST', `${root}/cases/${cs}/rounds`, U.thv, { partyName: party });
      expect(r.status).toBe(200);
      const round = r.json.label as string;
      expect(
        (await api('POST', `${root}/rounds/${round}/completion`, U.thv, { result: 'xong' })).status,
      ).toBe(409);
      const src = await api('POST', `${root}/rounds/${round}/sources`, U.thv, {
        kind: 'Công văn',
        confidentiality: 'PII',
        purpose: 'Xác minh điều kiện',
        evidenceKey: `vx/http/${party}`,
        evidenceSha256: 'd'.repeat(64),
      });
      expect(src.status).toBe(200);
      const access = (body: unknown, user = U.thv) =>
        api('POST', `${root}/sources/${src.json.label}/access`, user, body);
      expect((await access({})).status).toBe(422);
      expect((await access({ purpose: 'Đối chiếu' })).status).toBe(200);
      expect((await access({ purpose: 'Đối chiếu' }, U.thv2)).status).toBe(403);
      expect(
        (
          await api('POST', `${root}/rounds/${round}/completion`, U.thv, {
            result: 'Đạt (giả lập)',
          })
        ).status,
      ).toBe(200);
    }

    expect(
      (
        await api('POST', `${root}/cases/${cs}/conclusion-proposal`, U.thv, {
          text: 'Đủ điều kiện',
        })
      ).status,
    ).toBe(200);
    expect(
      (await api('POST', `${root}/cases/${cs}/conclusion-decision`, U.thv, { approve: true }))
        .status,
    ).toBe(403);
    expect(
      (await api('POST', `${root}/cases/${cs}/conclusion-decision`, U.head, { approve: true }))
        .status,
    ).toBe(200);

    // Ủy quyền: thiếu bước → 409 với mã bước; sai persona → 403.
    const cs2 = (
      await api('POST', `${root}/cases`, U.clerk, { officeId: OFF, branchId: BR1, caseRef: 'XM/d' })
    ).json.label as string;
    await api('PUT', `${root}/cases/${cs2}/handler`, U.admin, { handlerUserId: U.thv });
    const d = (
      await api('POST', `${root}/cases/${cs2}/delegations`, U.thv, { delegateUserId: U.thv2 })
    ).json.label as string;
    const step = (user: string, s: string) =>
      api('POST', `${root}/delegations/${d}/steps`, user, {
        step: s,
        evidenceKey: `vx/http/${s}`,
        evidenceSha256: 'f'.repeat(64),
      });
    const activate = (user: string = U.admin) =>
      api('POST', `${root}/delegations/${d}/activation`, user);
    const missing = await activate();
    expect(missing.status).toBe(409);
    expect(missing.json.code).toBe('CONSENT_MISSING');
    expect((await step(U.thv, 'CONSENT')).status).toBe(200);
    expect((await step(U.thv, 'APP_APPROVAL')).status).toBe(403);
    expect((await step(U.admin, 'APP_APPROVAL')).status).toBe(200);
    expect((await step(U.head, 'LEGAL_SIGNATURE')).status).toBe(200);
    expect((await activate()).json.code).toBe('HANDOVER_MISSING');
    expect((await step(U.admin, 'HANDOVER')).status).toBe(200);
    expect((await activate(U.thv)).status).toBe(403);
    expect((await activate(U.admin)).status).toBe(200);
    expect(
      (await api('POST', `${root}/delegations/${d}/activation`, U.admin, undefined, T2)).status,
    ).toBe(404);
    expect((await api('POST', `${root}/delegations/${d}/activation`, null)).status).toBe(401);
  });

  it('tracks a multi-party, multi-obligation enforcement case over HTTP with partial results', async () => {
    const root = '/enforcement-cases';
    const created = await api('POST', root, U.clerk, {
      officeId: OFF,
      branchId: BR1,
      caseRef: 'THA/http',
      agreementRef: 'HĐDV-giả-lập',
      decisionRef: 'QĐ-giả-lập',
    });
    expect(created.status).toBe(200);
    const cs = created.json.label as string;
    expect(
      (await api('PUT', `${root}/${cs}/handler`, U.thv, { handlerUserId: U.thv })).status,
    ).toBe(403);
    expect(
      (await api('PUT', `${root}/${cs}/handler`, U.admin, { handlerUserId: U.thv })).status,
    ).toBe(200);
    const party = async (role: string) =>
      (
        await api('POST', `${root}/${cs}/parties`, U.thv, {
          displayName: 'Đương sự',
          kind: 'PERSON',
          role,
        })
      ).json.label as string;
    await party('CREDITOR');
    const debtor = await party('DEBTOR');
    await party('RELATED_PARTY');
    expect(
      (
        await api('POST', `${root}/${cs}/parties`, U.thv2, {
          displayName: 'X',
          kind: 'PERSON',
          role: 'DEBTOR',
        })
      ).status,
    ).toBe(403);
    const ob = async () =>
      (
        await api('POST', `${root}/${cs}/obligations`, U.thv, {
          description: 'Nghĩa vụ',
          obligorPartyId: debtor,
        })
      ).json.label as string;
    const o1 = await ob();
    const o2 = await ob();
    const ev = (o: string, body: Record<string, unknown>, user = U.thv) =>
      api('POST', `${root}/obligations/${o}/events`, user, body);
    const partial = {
      kind: 'PARTIAL_RESULT',
      note: 'Một phần',
      evidenceKey: 'th/http/1',
      evidenceSha256: 'a'.repeat(64),
      idempotencyKey: 'p1',
    };
    expect((await ev(o1, { ...partial, evidenceKey: null, evidenceSha256: null })).status).toBe(
      422,
    );
    expect((await ev(o1, partial)).status).toBe(200);
    const retry = await ev(o1, partial);
    expect(retry.status).toBe(200);
    expect(retry.json.code).toBe('ALREADY_RECORDED');
    expect((await ev(o1, { ...partial, idempotencyKey: 'p2' }, U.thv2)).status).toBe(403);
    expect((await ev(o1, { ...partial, kind: 'COMPLETION', idempotencyKey: 'c1' })).status).toBe(
      200,
    );
    const fin = { evidenceKey: 'th/http/done', evidenceSha256: 'b'.repeat(64) };
    expect((await api('POST', `${root}/${cs}/completion`, U.admin, fin)).status).toBe(409);
    expect((await ev(o2, { ...partial, kind: 'COMPLETION', idempotencyKey: 'c2' })).status).toBe(
      200,
    );
    expect((await api('POST', `${root}/${cs}/completion`, U.thv, fin)).status).toBe(403);
    expect((await api('POST', `${root}/${cs}/completion`, U.admin, fin, T2)).status).toBe(404);
    expect((await api('POST', `${root}/${cs}/completion`, U.admin, fin)).status).toBe(200);
    expect((await api('POST', `${root}/${cs}/completion`, null, fin)).status).toBe(401);
  });
});
