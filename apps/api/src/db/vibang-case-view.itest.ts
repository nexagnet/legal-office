import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';
import { LocalFileStore, type FileStore } from '../storage/file-store';

// Cần PostgreSQL tạm. HTTP thật + DB thật + vai legal_app có RLS. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_hv_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('Vi bằng case view and handover (HTTP + PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const storeDir = mkdtempSync(join(tmpdir(), 'lo-files-'));
  const store: FileStore = new LocalFileStore(storeDir);
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const BR1 = id();
  const BR2 = id();
  const U = {
    admin: id(),
    head: id(),
    secretary: id(),
    clerk1: id(),
    clerk2: id(),
    acc1: id(),
    thvA: id(),
    thvB: id(),
    outsider: id(),
    otherTenantAdmin: id(),
  };

  const api = async (
    method: string,
    path: string,
    user: string | null,
    body?: unknown,
    tenant = T,
  ) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (user) {
      headers['x-synthetic-user'] = user;
      headers['x-synthetic-tenant'] = tenant;
    }
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const t = await res.text();
    return { status: res.status, json: t ? (JSON.parse(t) as Record<string, unknown>) : {} };
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
    appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 6 });
    server = await NestFactory.create(
      AppModule.register({
        pool: appPool,
        resolver: new SyntheticHeaderResolver(),
        fileStore: store,
      }),
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
      [U.head, 'TRUONG_VP', null],
      [U.secretary, 'THU_KY', null],
      [U.clerk1, 'VAN_THU', BR1],
      [U.clerk2, 'VAN_THU', BR2],
      [U.acc1, 'KE_TOAN', BR1],
      [U.thvA, 'THV', null],
      [U.thvB, 'THV', null],
    ];
    for (const [uid, role, branch] of people) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        role,
      ]);
      const m = await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role, legal_signer) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [T, uid, OFF, role, role === 'ADMIN'],
      );
      if (branch) {
        await owner.query(
          `INSERT INTO branch_grants (tenant_id, membership_id, branch_id) VALUES ($1,$2,$3)`,
          [T, m.rows[0].id, branch],
        );
      }
    }
    await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,'out')`, [
      U.outsider,
      T,
    ]);
    await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,'a2')`, [
      U.otherTenantAdmin,
      T2,
    ]);
  });

  afterAll(async () => {
    await server?.close();
    await owner?.end();
    rmSync(storeDir, { recursive: true, force: true });
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const customer = async () =>
    (
      await api('POST', '/vibang/customers', U.clerk1, {
        kind: 'PERSON',
        externalRef: 'KH-giả-lập',
      })
    ).json.label as string;
  const newCase = async () => {
    const r = await api('POST', '/vibang/cases', U.clerk1, {
      officeId: OFF,
      branchId: BR1,
      customerId: await customer(),
      title: 'Hồ sơ giả lập',
    });
    const c = r.json.label as string;
    await api('PUT', `/vibang/cases/${c}/responsible-thv`, U.admin, { thvUserId: U.thvA });
    return c;
  };
  const force = async (c: string, status: string) => {
    const client = await owner.connect();
    try {
      await client.query(`SET session_replication_role = replica`);
      await client.query(`UPDATE vibang_cases SET status = $2 WHERE id = $1`, [c, status]);
    } finally {
      await client.query(`RESET session_replication_role`);
      client.release();
    }
  };

  it('list and detail carry customer, branch, thv, number and next step; customer name hidden from non-intake roles', async () => {
    await owner.query(`UPDATE users SET external_ref = 'THV A' WHERE id = $1 AND tenant_id = $2`, [
      U.thvA,
      T,
    ]);
    const cust = await customer();
    await owner.query(
      `UPDATE customers SET display_name = 'Nguyễn Văn Giả Lập', phone = '0900000000', id_number = '000000000000' WHERE id = $1`,
      [cust],
    );
    const r = await api('POST', '/vibang/cases', U.clerk1, {
      officeId: OFF,
      branchId: BR1,
      customerId: cust,
      title: 'Hồ sơ cột hiển thị',
    });
    const c = r.json.label as string;
    const fresh = await api('GET', `/vibang/cases/${c}`, U.clerk1);
    expect(fresh.json).toMatchObject({
      branchName: 'CN1',
      customerName: 'Nguyễn Văn Giả Lập',
      thvLabel: null,
      numberLabel: null,
      nextStep: 'ASSIGN_THV',
      createdBy: U.clerk1,
      createdByLabel: 'VAN_THU',
      customerPhone: '0900000000',
      customerIdNumber: '000000000000',
      handoverRecipient: null,
      handoverOn: null,
    });
    await api('PUT', `/vibang/cases/${c}/responsible-thv`, U.admin, { thvUserId: U.thvA });
    const assigned = await api('GET', `/vibang/cases/${c}`, U.admin);
    expect(assigned.json).toMatchObject({ thvLabel: 'THV A', nextStep: 'MISA_NUMBER' });
    const list = await api('GET', '/vibang/cases?limit=50', U.secretary);
    const items = list.json.items as { id: string; branchName: string; nextStep: string }[];
    expect(items.find((i) => i.id === c)).toMatchObject({
      branchName: 'CN1',
      nextStep: 'MISA_NUMBER',
    });
    // Kế toán xem được hồ sơ chi nhánh nhưng không thấy tên khách (PII)
    const acc = await api('GET', `/vibang/cases/${c}`, U.acc1);
    expect(acc.status).toBe(200);
    expect(acc.json.customerName).toBeNull();
    expect(acc.json.customerPhone).toBeNull();
    expect(acc.json.customerIdNumber).toBeNull();
    // số tiếp nhận tăng dần theo văn phòng, đúng năm hiện tại (giờ Việt Nam)
    const year = new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
    const second = (
      await api('POST', '/vibang/cases', U.clerk1, {
        officeId: OFF,
        branchId: BR1,
        customerId: cust,
        title: 'Hồ sơ thứ hai',
      })
    ).json.label as string;
    const no = async (id: string) =>
      ((await api('GET', `/vibang/cases/${id}`, U.admin)).json as { intakeNo: string }).intakeNo;
    const a1 = await no(c);
    const a2 = await no(second);
    expect(a1).toMatch(new RegExp(`^\\d+/${year}/TN$`));
    expect(Number(a2.split('/')[0])).toBe(Number(a1.split('/')[0]) + 1);
    expect((await api('GET', `/vibang/cases/${c}`, U.clerk2)).status).toBe(404);
  });

  it('records handover once, only for stamped/returned cases, by clerk or responsible thv', async () => {
    const c = await newCase();
    const url = `/vibang/cases/${c}/handover`;
    const body = { recipientName: 'Trần Thị Nhận', handedOverOn: '2026-10-16' };
    expect((await api('POST', url, U.clerk1, body)).json.code).toBe('INVALID_CASE_STATUS');
    await force(c, 'STAMPED');
    expect((await api('POST', url, U.clerk2, body)).status).toBe(403);
    expect((await api('POST', url, U.acc1, body)).status).toBe(403);
    expect((await api('POST', url, U.clerk1, { ...body, recipientName: ' ' })).status).toBe(422);
    expect((await api('POST', url, U.clerk1, body)).status).toBe(200);
    expect((await api('POST', url, U.clerk1, body)).json.code).toBe('ALREADY_RECORDED');
    const got = await api('GET', `/vibang/cases/${c}`, U.clerk1);
    expect(got.json).toMatchObject({
      nextStep: 'RETURN',
      handoverRecipient: 'Trần Thị Nhận',
      handoverOn: '2026-10-16',
    });
    await expect(
      owner.query(`UPDATE vibang_handovers SET recipient_name = 'x' WHERE case_id = $1`, [c]),
    ).rejects.toThrow();
  });
});
