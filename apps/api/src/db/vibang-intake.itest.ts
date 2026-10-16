import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';

// Cần PostgreSQL tạm. HTTP thật + DB thật + vai legal_app có RLS. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_intake_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)(
  'Vi bằng intake, THV assignment and scoped reads (HTTP + PostgreSQL)',
  () => {
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
        AppModule.register({ pool: appPool, resolver: new SyntheticHeaderResolver() }),
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
      await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
      await admin.end();
    });

    const customer = async (user = U.clerk1) =>
      (await api('POST', '/vibang/customers', user, { kind: 'PERSON', externalRef: 'KH-giả-lập' }))
        .json.label as string;
    const newCase = async (user = U.clerk1, branch = BR1) => {
      const cu = await customer(user);
      const r = await api('POST', '/vibang/cases', user, {
        officeId: OFF,
        branchId: branch,
        customerId: cu,
        title: 'Hồ sơ giả lập',
      });
      expect(r.status).toBe(200);
      return r.json.label as string;
    };

    it('creates customers, contracts and cases with the right roles and validates input', async () => {
      expect(
        (await api('POST', '/vibang/customers', U.outsider, { kind: 'PERSON', externalRef: 'x' }))
          .status,
      ).toBe(403);
      expect(
        (await api('POST', '/vibang/customers', null, { kind: 'PERSON', externalRef: 'x' })).status,
      ).toBe(401);
      expect(
        (await api('POST', '/vibang/customers', U.clerk1, { kind: 'ALIEN', externalRef: 'x' }))
          .status,
      ).toBe(400);
      expect(
        (await api('POST', '/vibang/customers', U.clerk1, { kind: 'PERSON', externalRef: '  ' }))
          .status,
      ).toBe(422);
      expect(
        (
          await api('POST', '/vibang/customers', U.clerk1, {
            kind: 'PERSON',
            externalRef: 'x',
            amount: 5,
          })
        ).status,
      ).toBe(400);
      const cu = await customer();
      expect(
        (
          await api('POST', `/vibang/customers/${cu}/contracts`, U.clerk1, {
            externalRef: 'HĐ-giả-lập',
          })
        ).status,
      ).toBe(200);
      expect(
        (await api('POST', `/vibang/customers/${id()}/contracts`, U.clerk1, { externalRef: 'HĐ' }))
          .status,
      ).toBe(404);
      const contract = (
        await api('POST', `/vibang/customers/${cu}/contracts`, U.admin, { externalRef: 'HĐ2' })
      ).json.label as string;

      const body = {
        officeId: OFF,
        branchId: BR1,
        customerId: cu,
        contractId: contract,
        title: 'Lập vi bằng giả lập',
      };
      expect((await api('POST', '/vibang/cases', U.clerk1, body)).status).toBe(200);
      expect((await api('POST', '/vibang/cases', U.thvA, body)).status).toBe(200);
      expect((await api('POST', '/vibang/cases', U.secretary, body)).status).toBe(200);
      expect((await api('POST', '/vibang/cases', U.clerk2, body)).json.code).toBe(
        'BRANCH_NOT_GRANTED',
      );
      expect((await api('POST', '/vibang/cases', U.acc1, body)).status).toBe(403);
      expect((await api('POST', '/vibang/cases', U.outsider, body)).status).toBe(403);
      expect(
        (await api('POST', '/vibang/cases', U.clerk1, { ...body, customerId: id() })).status,
      ).toBe(404);
      const other = await customer(U.admin);
      expect(
        (await api('POST', '/vibang/cases', U.clerk1, { ...body, customerId: other })).json.code,
      ).toBe('CONTRACT_NOT_FOUND');
      expect((await api('POST', '/vibang/cases', U.clerk1, { ...body, title: ' ' })).status).toBe(
        422,
      );
      expect(
        (await api('POST', '/vibang/cases', U.clerk1, { ...body, branchId: id() })).status,
      ).toBe(404);
      expect((await api('POST', '/vibang/cases', U.otherTenantAdmin, body, T2)).status).toBe(404);
      const row = await owner.query(
        `SELECT status, responsible_thv_user_id, version FROM vibang_cases WHERE title = 'Lập vi bằng giả lập' LIMIT 1`,
      );
      expect(row.rows[0]).toMatchObject({
        status: 'INTAKE',
        responsible_thv_user_id: null,
        version: 1,
      });
    });

    it('lets only an Admin assign a THV, with a reason on change and an append-only history', async () => {
      const c = await newCase();
      const url = `/vibang/cases/${c}/responsible-thv`;
      for (const who of [U.head, U.secretary, U.clerk1, U.thvA, U.outsider]) {
        expect((await api('PUT', url, who, { thvUserId: U.thvA })).status).toBe(403);
      }
      expect((await api('PUT', url, U.admin, { thvUserId: U.clerk1 })).json.code).toBe(
        'INVALID_HANDLER',
      );
      expect((await api('PUT', url, U.admin, { thvUserId: U.thvA })).status).toBe(200);
      expect(
        (await owner.query(`SELECT status, version FROM vibang_cases WHERE id = $1`, [c])).rows[0],
      ).toMatchObject({
        status: 'ASSIGNED',
        version: 2,
      });
      expect((await api('PUT', url, U.admin, { thvUserId: U.thvA })).json.code).toBe(
        'ALREADY_ASSIGNED',
      );
      expect((await api('PUT', url, U.admin, { thvUserId: U.thvB })).json.code).toBe(
        'REASON_REQUIRED',
      );
      expect(
        (await api('PUT', url, U.admin, { thvUserId: U.thvB, reason: 'THV A nghỉ phép' })).status,
      ).toBe(200);
      const hist = await owner.query(
        `SELECT thv_user_id, previous_thv_user_id, reason FROM vibang_assignments WHERE case_id = $1 ORDER BY id`,
        [c],
      );
      expect(hist.rows).toEqual([
        { thv_user_id: U.thvA, previous_thv_user_id: null, reason: null },
        { thv_user_id: U.thvB, previous_thv_user_id: U.thvA, reason: 'THV A nghỉ phép' },
      ]);
      await expect(owner.query(`DELETE FROM vibang_assignments`)).rejects.toThrow();
      expect(
        (await api('PUT', `/vibang/cases/${id()}/responsible-thv`, U.admin, { thvUserId: U.thvA }))
          .status,
      ).toBe(404);
      expect((await api('PUT', url, U.otherTenantAdmin, { thvUserId: U.thvA }, T2)).status).toBe(
        404,
      );
      await owner.query(
        `UPDATE vibang_cases SET status = 'CANCELLED', cancel_reason = 'x' WHERE id = $1`,
        [c],
      );
      expect((await api('PUT', url, U.admin, { thvUserId: U.thvA, reason: 'x' })).json.code).toBe(
        'CASE_NOT_ASSIGNABLE',
      );
    });

    it('shows each role only the cases it may see', async () => {
      const c1 = await newCase(U.clerk1, BR1);
      const c2 = await newCase(U.clerk2, BR2);
      expect(
        (await api('PUT', `/vibang/cases/${c1}/responsible-thv`, U.admin, { thvUserId: U.thvA }))
          .status,
      ).toBe(200);
      const ids = async (who: string, tenant = T) =>
        (
          (await api('GET', '/vibang/cases?limit=200', who, undefined, tenant)).json.items as {
            id: string;
          }[]
        ).map((i) => i.id);

      for (const who of [U.admin, U.head, U.secretary]) {
        const seen = await ids(who);
        expect(seen).toContain(c1);
        expect(seen).toContain(c2);
      }
      const clerk1 = await ids(U.clerk1);
      expect(clerk1).toContain(c1);
      expect(clerk1).not.toContain(c2);
      const clerk2 = await ids(U.clerk2);
      expect(clerk2).toContain(c2);
      expect(clerk2).not.toContain(c1);
      expect(await ids(U.acc1)).toContain(c1);
      expect(await ids(U.acc1)).not.toContain(c2);
      const thvA = await ids(U.thvA);
      // Chủ dự án chốt 16/10/2026: THV xem được mọi hồ sơ của văn phòng (chỉ thao tác khi được giao).
      expect(thvA).toContain(c1);
      expect(thvA).toContain(c2);
      expect(await ids(U.thvB)).toContain(c1);
      expect(await ids(U.outsider)).toEqual([]);
      expect(await ids(U.otherTenantAdmin, T2)).toEqual([]);

      const detail = await api('GET', `/vibang/cases/${c1}`, U.thvA);
      expect(detail.status).toBe(200);
      expect(detail.json).toMatchObject({
        id: c1,
        status: 'ASSIGNED',
        responsibleThvUserId: U.thvA,
        branchId: BR1,
      });
      expect((await api('GET', `/vibang/cases/${c1}`, U.thvB)).status).toBe(200);
      expect((await api('GET', `/vibang/cases/${c2}`, U.clerk1)).status).toBe(404);
      expect(
        (await api('GET', `/vibang/cases/${c1}`, U.otherTenantAdmin, undefined, T2)).status,
      ).toBe(404);
      expect((await api('GET', `/vibang/cases/${c1}`, null)).status).toBe(401);
      expect((await api('GET', '/vibang/cases?limit=0', U.admin)).status).toBe(400);
    });

    it('audits every denial', async () => {
      const r = await owner.query(
        `SELECT count(*)::int n FROM audit_log WHERE action LIKE 'vb.%' AND outcome = 'deny'`,
      );
      expect(r.rows[0].n).toBeGreaterThan(10);
    });
  },
);
