import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';

// Cần PostgreSQL tạm. HTTP thật (fetch tới Nest) + DB thật + vai legal_app có RLS. Dữ liệu giả lập.
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
const SHA = 'b'.repeat(64);

describe.skipIf(!ADMIN_URL)('UAT HTTP: hạn pháp định Xác minh và THA (synthetic)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
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
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const deadlines = async (user: string) => {
    const r = await api('GET', `/office/deadlines?officeId=${OFF}&withinDays=30`, user);
    return r.json as unknown as { domain: string; refId: string; statutory: boolean }[];
  };

  it('Xác minh: ghi ngày ký → hạn 3 ngày làm việc → chỉ Trưởng VP có quyền ký đóng được', async () => {
    const created = await api('POST', '/verification/cases', U.head, {
      officeId: OFF,
      branchId: BR1,
      caseRef: 'XM-UAT-1',
    });
    expect(created.status).toBe(200);
    const caseId = String(created.json.label);
    expect(
      (
        await api('PUT', `/verification/cases/${caseId}/contract-date`, U.clerk, {
          signedOn: '2026-10-15',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api('PUT', `/verification/cases/${caseId}/contract-date`, U.head, {
          signedOn: '2999-01-01',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await api('PUT', `/verification/cases/${caseId}/contract-date`, U.head, {
          signedOn: '2026-10-15',
        })
      ).status,
    ).toBe(200);
    const row = (await deadlines(U.head)).find((d) => d.domain === 'XAC_MINH_QUYET_DINH');
    expect(row?.statutory).toBe(true);
    const due = await owner.query(`SELECT due_at FROM office_statutory_deadlines WHERE id = $1`, [
      row!.refId,
    ]);
    expect(new Date(due.rows[0].due_at).toISOString()).toBe('2026-10-20T16:59:59.000Z');
    expect(
      (
        await api('POST', `/office/deadlines/${row!.refId}/done`, U.thv, {
          note: 'đã ra quyết định',
        })
      ).status,
    ).toBe(403);
    expect(
      (await api('POST', `/office/deadlines/${row!.refId}/done`, U.head, { note: ' ' })).status,
    ).toBe(422);
    expect(
      (
        await api('POST', `/office/deadlines/${row!.refId}/done`, U.head, {
          note: 'Đã ra quyết định xác minh',
        })
      ).status,
    ).toBe(200);
    expect(
      (await api('POST', `/office/deadlines/${row!.refId}/done`, U.head, { note: 'lại' })).status,
    ).toBe(409);
    expect((await deadlines(U.head)).some((d) => d.refId === row!.refId)).toBe(false);
  });

  it('THA: chấm dứt vụ việc (Điều 46) sinh hạn thu hồi, hạn thoả thuận phải có lý do', async () => {
    const created = await api('POST', '/enforcement-cases', U.head, {
      officeId: OFF,
      branchId: BR1,
      caseRef: 'THA-UAT-1',
      agreementRef: 'TT-1',
      decisionRef: 'QD-1',
    });
    expect(created.status).toBe(200);
    const caseId = String(created.json.label);
    const body = {
      reason: 'AGREEMENT',
      basis: 'Điều 46',
      evidenceKey: 'k/term.pdf',
      evidenceSha256: SHA,
    };
    expect(
      (await api('POST', `/enforcement-cases/${caseId}/termination`, U.clerk, body)).status,
    ).toBe(403);
    expect(
      (
        await api('POST', `/enforcement-cases/${caseId}/termination`, U.head, {
          ...body,
          basis: ' ',
        })
      ).status,
    ).toBe(422);
    expect(
      (await api('POST', `/enforcement-cases/${caseId}/termination`, U.head, body)).status,
    ).toBe(200);
    expect(
      (await api('POST', `/enforcement-cases/${caseId}/termination`, U.head, body)).status,
    ).toBe(409);
    const row = (await deadlines(U.admin)).find((d) => d.domain === 'THA_THU_HOI');
    expect(row?.statutory).toBe(true);
    const when = new Date(Date.now() + 10 * 86400000).toISOString().replace(/\.\d+Z$/, '+00:00');
    expect(
      (
        await api('POST', `/office/deadlines/${row!.refId}/agree`, U.clerk, {
          dueAt: when,
          reason: 'x',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api('POST', `/office/deadlines/${row!.refId}/agree`, U.head, {
          dueAt: when,
          reason: ' ',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await api('POST', `/office/deadlines/${row!.refId}/agree`, U.head, {
          dueAt: when,
          reason: 'Hai bên thoả thuận',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api('POST', `/office/deadlines/${row!.refId}/done`, U.head, {
          note: 'Đã ra quyết định thu hồi',
        })
      ).status,
    ).toBe(200);
  });

  it('tách tenant: tenant khác không thấy hạn và không đóng được', async () => {
    const mine = await deadlines(U.admin);
    expect(mine.length).toBeGreaterThanOrEqual(0);
    const rows = await owner.query(
      `SELECT id FROM office_statutory_deadlines WHERE tenant_id = $1 LIMIT 1`,
      [T],
    );
    const r = await api(
      'POST',
      `/office/deadlines/${rows.rows[0].id}/done`,
      U.otherTenant,
      { note: 'x' },
      T2,
    );
    expect([403, 404]).toContain(r.status);
  });
});
