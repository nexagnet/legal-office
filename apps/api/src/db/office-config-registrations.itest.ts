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
import { LocalFileStore } from '../storage/file-store';

// Cần PostgreSQL tạm. HTTP thật + DB thật + vai legal_app có RLS. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_cf_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)(
  'Office config, Sở/CSDL tracking, contacts, receivers (HTTP + PostgreSQL)',
  () => {
    const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
    let owner: pg.Pool;
    let appPool: pg.Pool;
    let server: INestApplication;
    let base = '';
    const id = () => randomUUID();
    const storeDir = mkdtempSync(join(tmpdir(), 'lo-cf-'));
    const store = new LocalFileStore(storeDir);
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
      await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [
        OFF,
        T,
      ]);
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

    const OF = `officeId=${OFF}`;
    type Row = Record<string, unknown>;

    it('reads office settings for members; only Admin changes names; rule and branches are fixed', async () => {
      const r = await api('GET', `/office/settings?${OF}`, U.thvA);
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({
        legalName: 'VP A',
        displayName: 'VP A',
        numberRule: '<số>/<năm>/VB-THV',
      });
      expect((r.json.branches as Row[]).map((b) => b.name)).toEqual(['CN1', 'CN2']);
      const denied = await api('PUT', '/office/settings', U.head, {
        officeId: OFF,
        displayName: 'X',
      });
      expect(denied.status).toBeGreaterThanOrEqual(400);
      expect(
        (await api('PUT', '/office/settings', U.admin, { officeId: OFF })).status,
      ).toBeGreaterThanOrEqual(400);
      expect(
        (await api('PUT', '/office/settings', U.admin, { officeId: OFF, displayName: '  ' }))
          .status,
      ).toBeGreaterThanOrEqual(400);
      const ok = await api('PUT', '/office/settings', U.admin, {
        officeId: OFF,
        displayName: 'Văn phòng THADS Hai Bà Trưng',
      });
      expect(ok.status).toBe(200);
      const after = await api('GET', `/office/settings?${OF}`, U.clerk1);
      expect(after.json).toMatchObject({
        legalName: 'VP A',
        displayName: 'Văn phòng THADS Hai Bà Trưng',
      });
      expect((await api('GET', `/office/settings?${OF}`, U.outsider)).status).toBe(403);
      expect(
        (await api('GET', `/office/settings?${OF}`, U.otherTenantAdmin, undefined, T2)).status,
      ).toBe(403);
      expect((await api('GET', `/office/settings?${OF}`, null)).status).toBe(401);
    });

    it('shows paper-ledger last number status: not imported, then imported by Admin; read scope is Admin, head, secretary', async () => {
      const q = `officeId=${OFF}&year=2026`;
      const before = await api('GET', `/office/number-status?${q}`, U.secretary);
      expect(before.status).toBe(200);
      expect(before.json).toMatchObject({ year: 2026, lastSeq: 0, paperImported: false });
      expect((await api('GET', `/office/number-status?${q}`, U.clerk1)).status).toBe(403);
      expect((await api('GET', `/office/number-status?${q}`, U.thvA)).status).toBe(403);
      expect(
        (await api('GET', `/office/number-status?officeId=${OFF}&year=1999`, U.admin)).status,
      ).toBeGreaterThanOrEqual(400);
      expect(
        (
          await api('POST', `/vibang/offices/${OFF}/number-imports`, U.head, {
            year: 2026,
            lastNumber: 120,
          })
        ).status,
      ).toBeGreaterThanOrEqual(400);
      expect(
        (
          await api('POST', `/vibang/offices/${OFF}/number-imports`, U.admin, {
            year: 2026,
            lastNumber: 120,
          })
        ).status,
      ).toBe(200);
      const after = await api('GET', `/office/number-status?${q}`, U.head);
      expect(after.json).toMatchObject({
        year: 2026,
        lastSeq: 120,
        paperImported: true,
        importedSeq: 120,
      });
      expect(after.json.importedAt).toBeTruthy();
    });

    it('lists THV receivers only to roles taking part in handover', async () => {
      const ok = await api('GET', `/office/receivers?${OF}`, U.thvA);
      expect((ok.json.items as Row[]).map((i) => i.userId).sort()).toEqual([U.thvA, U.thvB].sort());
      expect((await api('GET', `/office/receivers?${OF}`, U.admin)).status).toBe(200);
      expect(
        ((await api('GET', `/office/receivers?${OF}`, U.acc1)).json.items as Row[]) ?? [],
      ).toHaveLength(0);
      expect(
        ((await api('GET', `/office/receivers?${OF}`, U.outsider)).json.items as Row[]) ?? [],
      ).toHaveLength(0);
    });

    it('tracks Sở/CSDL updates per numbered case with summary, incidents and scope; lists contacts', async () => {
      const cust = id();
      await owner.query(
        `INSERT INTO customers (id, tenant_id, kind, external_ref) VALUES ($1,$2,'PERSON','c')`,
        [cust, T],
      );
      const mk = async (title: string, seq: number, branch: string) => {
        const cid = id();
        await owner.query(
          `INSERT INTO vibang_cases (id, tenant_id, office_id, branch_id, customer_id, title) VALUES ($1,$2,$3,$4,$5,$6)`,
          [cid, T, OFF, branch, cust, title],
        );
        await owner.query(
          `UPDATE vibang_cases SET status = 'ASSIGNED', responsible_thv_user_id = $2, version = version + 1 WHERE id = $1`,
          [cid, U.thvA],
        );
        await owner.query(
          `INSERT INTO vibang_numbers (tenant_id, office_id, case_id, year, seq, label, allocated_by) VALUES ($1,$2,$3,2026,$4,$5,$6)`,
          [T, OFF, cid, seq, `${seq}/2026/VB-THV`, U.admin],
        );
        return cid;
      };
      const c1 = await mk('A', 1, BR1);
      const c2 = await mk('B', 2, BR1);
      const c3 = await mk('C', 3, BR2);
      const future = new Date(Date.now() + 3 * 86400000).toISOString();
      const put = (c: string, body: Row) =>
        api('PUT', `/vibang/cases/${c}/registration`, U.admin, body);
      expect((await put(c2, { status: 'CONFIRMED', deadlineAt: future })).status).toBe(200);
      expect(
        (await put(c3, { status: 'FAILED', deadlineAt: future, reasonCode: 'SO_REJECTED' })).status,
      ).toBe(200);

      const all = await api('GET', '/vibang/registrations', U.admin);
      expect(all.status).toBe(200);
      expect(all.json.summary).toEqual({ pending: 1, done: 1, incident: 1 });
      const byLabel = Object.fromEntries((all.json.items as Row[]).map((i) => [i.numberLabel, i]));
      expect(byLabel['1/2026/VB-THV']).toMatchObject({
        regStatus: 'NOT_STARTED',
        incidentReason: null,
        deadlineAt: null,
      });
      expect(byLabel['2/2026/VB-THV']).toMatchObject({ regStatus: 'CONFIRMED' });
      expect(byLabel['3/2026/VB-THV']).toMatchObject({
        regStatus: 'FAILED',
        incidentReason: 'SO_REJECTED',
      });
      const inc = await api('GET', '/vibang/registrations?status=incident', U.admin);
      expect((inc.json.items as Row[]).map((i) => i.numberLabel)).toEqual(['3/2026/VB-THV']);
      // THV xem mọi hồ sơ Vi bằng; Văn thư chi nhánh 2 chỉ thấy hồ sơ chi nhánh 2; Kế toán/người ngoài không thấy gì
      expect(((await api('GET', '/vibang/registrations', U.thvB)).json.items as Row[]).length).toBe(
        3,
      );
      expect(
        ((await api('GET', '/vibang/registrations', U.clerk2)).json.items as Row[]).map(
          (i) => i.numberLabel,
        ),
      ).toEqual(['3/2026/VB-THV']);
      expect(
        (await api('GET', '/vibang/registrations', U.outsider)).json.items as Row[],
      ).toHaveLength(0);
      expect((await api('GET', `/vibang/cases/${c1}/registration`, U.admin)).json).toMatchObject({
        regStatus: 'NOT_STARTED',
      });
      expect((await api('GET', `/vibang/cases/${c1}/registration`, U.outsider)).status).toBe(404);

      // Nhật ký liên hệ
      expect((await api('GET', `/vibang/cases/${c1}/contacts`, U.admin)).json).toEqual({
        items: [],
      });
      expect(
        (
          await api('POST', `/vibang/cases/${c1}/contacts`, U.admin, {
            kind: 'REMINDER',
            outcome: 'REMINDED',
          })
        ).status,
      ).toBe(200);
      const logged = await api('GET', `/vibang/cases/${c1}/contacts`, U.thvA);
      expect((logged.json.items as Row[]).map((i) => [i.kind, i.outcome])).toEqual([
        ['REMINDER', 'REMINDED'],
      ]);
      expect((await api('GET', `/vibang/cases/${c1}/contacts`, U.outsider)).status).toBe(404);
      expect((await api('GET', `/vibang/cases/${c1}/contacts`, null)).status).toBe(401);
    });
  },
);
