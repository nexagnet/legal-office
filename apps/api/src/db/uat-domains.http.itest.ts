import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';

// UAT (#24): kịch bản cuối-đến-cuối qua HTTP thật + DB thật cho ba mảng nghiệp vụ pháp lý còn lại
// (Tống đạt, Xác minh, Thi hành án) kèm các cổng vai/pháp lý và cách ly tenant. Toàn bộ dữ liệu giả lập.
// Vi bằng đã có bộ kiểm riêng (vibang.http.itest.ts); văn phòng chung có office*.itest.ts.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_uat_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const HASH = 'a'.repeat(64);

describe.skipIf(!ADMIN_URL)('UAT: Tống đạt, Xác minh, Thi hành án qua HTTP (synthetic)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF2 = id();
  const BR1 = id();
  const BR2 = id();
  const BR_T2 = id();
  const U = {
    admin: id(),
    head: id(),
    clerk: id(),
    clerkOther: id(),
    thv: id(),
    thv2: id(),
    acc: id(),
    foreign: id(),
  };

  const api = async (method: string, path: string, user: string, body?: unknown, tenant = T) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-synthetic-user': user,
        'x-synthetic-tenant': tenant,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  };
  const label = (r: { json: Record<string, unknown> }) => r.json.label as string;
  const list = async (path: string, user: string, tenant = T) =>
    (await api('GET', path, user, undefined, tenant)).json.items as Record<string, unknown>[];

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
    server = await NestFactory.create(
      AppModule.register({ pool: appPool, resolver: new SyntheticHeaderResolver() }),
      { logger: false },
    );
    await server.listen(0);
    base = (await server.getUrl()).replace('[::1]', 'localhost');

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
    await owner.query(
      `INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A'),($3,$4,'VP B')`,
      [OFF, T, OFF2, T2],
    );
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN1'),($4,$2,$3,'CN2'),($5,$6,$7,'CN-B')`,
      [BR1, T, OFF, BR2, BR_T2, T2, OFF2],
    );
    const people: [string, string, string, string, string | null][] = [
      [U.admin, T, OFF, 'ADMIN', null],
      [U.head, T, OFF, 'TRUONG_VP', null],
      [U.clerk, T, OFF, 'VAN_THU', BR1],
      [U.clerkOther, T, OFF, 'VAN_THU', BR2],
      [U.thv, T, OFF, 'THV', null],
      [U.thv2, T, OFF, 'THV', null],
      [U.acc, T, OFF, 'KE_TOAN', BR1],
      [U.foreign, T2, OFF2, 'ADMIN', null],
    ];
    for (const [uid, tenant, office, role, branch] of people) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        tenant,
        role,
      ]);
      const m = await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4) RETURNING id`,
        [tenant, uid, office, role],
      );
      if (branch) {
        await owner.query(
          `INSERT INTO branch_grants (tenant_id, membership_id, branch_id) VALUES ($1,$2,$3)`,
          [tenant, m.rows[0].id, branch],
        );
      }
    }
    await owner.query(`UPDATE memberships SET legal_signer = true WHERE user_id IN ($1,$2)`, [
      U.admin,
      U.head,
    ]);
  });

  afterAll(async () => {
    await server?.close();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('Tống đạt: một yêu cầu nhiều tài liệu, nhiều lần với kết quả khác nhau, chỉ đóng khi mọi tài liệu có kết cục', async () => {
    const req = label(
      await api('POST', '/service-of-documents/requests', U.clerk, {
        officeId: OFF,
        branchId: BR1,
        requestRef: 'N-01/UAT',
      }),
    );
    const deadline = '2099-01-01T00:00:00Z';
    const doc = (name: string) =>
      api('POST', `/service-of-documents/requests/${req}/documents`, U.clerk, {
        recipientName: name,
        address: 'Địa chỉ giả lập',
        deadlineAt: deadline,
      }).then(label);
    const d1 = await doc('Người nhận 1');
    const d2 = await doc('Người nhận 2');

    // Chi nhánh khác và THV chưa được giao không thao tác được.
    expect(
      (
        await api('POST', `/service-of-documents/requests/${req}/documents`, U.clerkOther, {
          recipientName: 'x',
          address: 'y',
          deadlineAt: deadline,
        })
      ).status,
    ).toBe(403);
    for (const d of [d1, d2]) {
      expect(
        (
          await api('PUT', `/service-of-documents/documents/${d}/handler`, U.admin, {
            handlerUserId: U.thv,
          })
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await api('POST', `/service-of-documents/documents/${d1}/attempts`, U.thv2, {
          outcome: 'ABSENT',
        })
      ).status,
    ).toBe(403);

    // Lần 1 vắng mặt (chưa kết cục); đóng yêu cầu lúc này bị chặn, không có "hoàn tất giả".
    expect(
      (
        await api('POST', `/service-of-documents/documents/${d1}/attempts`, U.thv, {
          outcome: 'ABSENT',
        })
      ).status,
    ).toBe(200);
    const early = await api('POST', `/service-of-documents/requests/${req}/closure`, U.admin);
    expect(early.status).toBe(409);
    expect(early.json.code).toBe('DOCUMENTS_NOT_FINAL');
    // Tống đạt thành công cần chứng cứ; niêm yết cần căn cứ pháp lý.
    expect(
      (
        await api('POST', `/service-of-documents/documents/${d1}/attempts`, U.thv, {
          outcome: 'SERVED',
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await api('POST', `/service-of-documents/documents/${d1}/attempts`, U.thv, {
          outcome: 'SERVED',
          evidenceKey: `t/${T}/td/${d1}/evidence/x.pdf`,
          evidenceSha256: HASH,
        })
      ).status,
    ).toBe(200);
    // Không thể tuyên bố "không tống đạt được" khi chưa có lần tống đạt nào.
    const noAttempt = await api(
      'POST',
      `/service-of-documents/documents/${d2}/undeliverable`,
      U.thv,
      {
        reason: 'NO_RECIPIENT',
      },
    );
    expect(noAttempt.json.code).toBe('NO_ATTEMPTS');
    expect(
      (
        await api('POST', `/service-of-documents/documents/${d2}/attempts`, U.thv, {
          outcome: 'NO_RECIPIENT',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api('POST', `/service-of-documents/documents/${d2}/undeliverable`, U.thv, {
          reason: 'NO_RECIPIENT',
        })
      ).status,
    ).toBe(200);
    // Chỉ Admin/Trưởng VP đóng yêu cầu.
    expect((await api('POST', `/service-of-documents/requests/${req}/closure`, U.thv)).status).toBe(
      403,
    );
    expect(
      (await api('POST', `/service-of-documents/requests/${req}/closure`, U.head)).status,
    ).toBe(200);
    const items = await list('/service-of-documents/documents', U.admin);
    const mine = items.filter((i) => i.requestId === req);
    expect(mine.map((i) => i.status).sort()).toEqual(['DELIVERED', 'UNDELIVERABLE']);
    expect(mine.every((i) => i.requestStatus === 'CLOSED')).toBe(true);
  });

  it('Xác minh: nhiều vòng và nguồn, kết luận chung cần người ký pháp lý khác người đề xuất', async () => {
    const cs = label(
      await api('POST', '/verification/cases', U.clerk, {
        officeId: OFF,
        branchId: BR1,
        caseRef: 'N-05/UAT',
      }),
    );
    expect(
      (await api('PUT', `/verification/cases/${cs}/handler`, U.admin, { handlerUserId: U.thv }))
        .status,
    ).toBe(200);
    const round = async (party: string) => {
      const r = label(
        await api('POST', `/verification/cases/${cs}/rounds`, U.thv, { partyName: party }),
      );
      expect(
        (
          await api('POST', `/verification/rounds/${r}/sources`, U.thv, {
            kind: 'Công văn',
            confidentiality: 'CONFIDENTIAL',
            purpose: 'Xác minh điều kiện',
            evidenceKey: `t/${T}/vx/rounds/${r}/sources/x.pdf`,
            evidenceSha256: HASH,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await api('POST', `/verification/rounds/${r}/completion`, U.thv, {
            result: 'Đủ điều kiện (giả lập)',
          })
        ).status,
      ).toBe(200);
      return r;
    };
    await round('Bên A');
    await round('Bên B');

    // THV khác không đề xuất được; đề xuất xong thì người đề xuất không tự duyệt.
    expect(
      (await api('POST', `/verification/cases/${cs}/conclusion-proposal`, U.thv2, { text: 'x' }))
        .status,
    ).toBe(403);
    expect(
      (
        await api('POST', `/verification/cases/${cs}/conclusion-proposal`, U.thv, {
          text: 'Đủ điều kiện (giả lập)',
        })
      ).status,
    ).toBe(200);
    expect(
      (await api('POST', `/verification/cases/${cs}/conclusion-decision`, U.thv, { approve: true }))
        .status,
    ).toBe(403);
    expect(
      (
        await api('POST', `/verification/cases/${cs}/conclusion-decision`, U.head, {
          approve: false,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await api('POST', `/verification/cases/${cs}/conclusion-decision`, U.head, {
          approve: true,
        })
      ).status,
    ).toBe(200);
    const row = (await list('/verification/cases', U.admin)).find((c) => c.caseId === cs)!;
    expect(row.status).toBe('CONCLUDED');
    expect(row.rounds).toHaveLength(2);
    // Hồ sơ đã kết luận không mở thêm vòng.
    expect(
      (await api('POST', `/verification/cases/${cs}/rounds`, U.thv, { partyName: 'Bên C' })).status,
    ).toBe(409);
  });

  it('Thi hành án: hồ sơ chỉ hoàn tất khi mọi nghĩa vụ có chứng cứ, và do Admin/Trưởng VP xác nhận', async () => {
    const cs = label(
      await api('POST', '/enforcement-cases', U.clerk, {
        officeId: OFF,
        branchId: BR1,
        caseRef: 'THA/UAT',
        agreementRef: 'HĐDV-giả-lập',
        decisionRef: 'QĐ-giả-lập',
      }),
    );
    expect(
      (await api('PUT', `/enforcement-cases/${cs}/handler`, U.admin, { handlerUserId: U.thv }))
        .status,
    ).toBe(200);
    const debtor = label(
      await api('POST', `/enforcement-cases/${cs}/parties`, U.thv, {
        displayName: 'Đương sự giả lập',
        kind: 'PERSON',
        role: 'DEBTOR',
      }),
    );
    const ob1 = label(
      await api('POST', `/enforcement-cases/${cs}/obligations`, U.thv, {
        description: 'Nghĩa vụ 1',
        obligorPartyId: debtor,
      }),
    );
    const ob2 = label(
      await api('POST', `/enforcement-cases/${cs}/obligations`, U.thv, {
        description: 'Nghĩa vụ 2',
      }),
    );
    const ev = (ob: string, user: string, kind: string, key: string) =>
      api('POST', `/enforcement-cases/obligations/${ob}/events`, user, {
        kind,
        note: 'Ghi nhận giả lập',
        evidenceKey: `t/${T}/th/${key}.pdf`,
        evidenceSha256: HASH,
        idempotencyKey: key,
      });
    expect((await ev(ob1, U.thv2, 'PARTIAL_RESULT', 'k0')).status).toBe(403);
    expect((await ev(ob1, U.thv, 'PARTIAL_RESULT', 'k1')).status).toBe(200);
    // Thử lại cùng khoá không nhân đôi.
    expect((await ev(ob1, U.thv, 'PARTIAL_RESULT', 'k1')).status).toBe(200);
    expect(
      (
        await owner.query(
          `SELECT count(*)::int AS n FROM th_obligation_events WHERE obligation_id = $1`,
          [ob1],
        )
      ).rows[0].n,
    ).toBe(1);
    expect((await ev(ob1, U.thv, 'COMPLETION', 'k2')).status).toBe(200);

    const done = { evidenceKey: `t/${T}/th/done.pdf`, evidenceSha256: HASH };
    const early = await api('POST', `/enforcement-cases/${cs}/completion`, U.head, done);
    expect(early.status).toBe(409);
    expect(early.json.code).toBe('OBLIGATIONS_NOT_COMPLETE');
    expect((await ev(ob2, U.thv, 'COMPLETION', 'k3')).status).toBe(200);
    expect((await api('POST', `/enforcement-cases/${cs}/completion`, U.thv, done)).status).toBe(
      403,
    );
    expect((await api('POST', `/enforcement-cases/${cs}/completion`, U.head, done)).status).toBe(
      200,
    );
    const row = (await list('/enforcement-cases', U.admin)).find((c) => c.caseId === cs)!;
    expect(row.status).toBe('COMPLETED');
  });

  it('cách ly: tenant khác không thấy hay chạm được dữ liệu; từ chối được ghi audit', async () => {
    for (const path of [
      '/service-of-documents/documents',
      '/verification/cases',
      '/enforcement-cases',
    ]) {
      expect((await list(path, U.foreign, T2)).length).toBe(0);
      expect((await list(path, U.admin)).length).toBeGreaterThan(0);
    }
    const doc = (await owner.query(`SELECT id FROM td_documents WHERE tenant_id = $1 LIMIT 1`, [T]))
      .rows[0].id;
    const cross = await api(
      'POST',
      `/service-of-documents/documents/${doc}/reminders`,
      U.foreign,
      undefined,
      T2,
    );
    expect([403, 404]).toContain(cross.status);
    // Kế toán không có quyền nghiệp vụ pháp lý; người không có vai trong văn phòng bị chặn.
    expect(
      (
        await api('POST', '/enforcement-cases', U.acc, {
          officeId: OFF,
          branchId: BR1,
          caseRef: 'x',
          agreementRef: 'y',
          decisionRef: 'z',
        })
      ).status,
    ).toBe(403);
    const denies = await owner.query(
      `SELECT count(*)::int AS n FROM audit_log WHERE tenant_id = $1 AND outcome = 'deny'`,
      [T],
    );
    expect(denies.rows[0].n).toBeGreaterThan(5);
    await expect(owner.query(`DELETE FROM audit_log WHERE tenant_id = $1`, [T])).rejects.toThrow(
      /append-only/,
    );
  });
});
