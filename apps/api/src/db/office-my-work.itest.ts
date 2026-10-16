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
const DB = `lo_mw_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)(
  'Office my-work: assigned items across domains, own only (HTTP + PostgreSQL)',
  () => {
    const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
    let owner: pg.Pool;
    let appPool: pg.Pool;
    let server: INestApplication;
    let base = '';
    const id = () => randomUUID();
    const storeDir = mkdtempSync(join(tmpdir(), 'lo-mw-'));
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

    type Item = { domain: string; label: string; status: string; overdue: boolean };
    const mine = (user: string | null, tenant = T) =>
      api('GET', `/office/my-work?officeId=${OFF}`, user, undefined, tenant);
    const items = (r: { json: Record<string, unknown> }) => r.json.items as Item[];

    it('lists only open items assigned to the caller, across domains', async () => {
      const cust = id();
      await owner.query(
        `INSERT INTO customers (id, tenant_id, kind, external_ref) VALUES ($1,$2,'PERSON','c')`,
        [cust, T],
      );
      const vb = async (title: string, thv: string, status: string) => {
        const cid = id();
        await owner.query(
          `INSERT INTO vibang_cases (id, tenant_id, office_id, branch_id, customer_id, title) VALUES ($1,$2,$3,$4,$5,$6)`,
          [cid, T, OFF, BR1, cust, title],
        );
        await owner.query(
          `UPDATE vibang_cases SET status = $2, cancel_reason = CASE WHEN $2 = 'CANCELLED' THEN 'x' END, responsible_thv_user_id = $3, version = version + 1 WHERE id = $1`,
          [cid, status, thv],
        );
      };
      await vb('VB của A', U.thvA, 'ASSIGNED');
      await vb('VB của B', U.thvB, 'ASSIGNED');
      await vb('VB đã huỷ của A', U.thvA, 'CANCELLED');
      await owner.query(
        `INSERT INTO vx_cases (tenant_id, office_id, branch_id, case_ref, status, handler_user_id, created_by) VALUES
          ($1,$2,$3,'XM-A','OPEN',$4,$5), ($1,$2,$3,'XM-B','OPEN',$6,$5)`,
        [T, OFF, BR1, U.thvA, U.admin, U.thvB],
      );
      await owner.query(
        `INSERT INTO th_cases (tenant_id, office_id, branch_id, case_ref, agreement_ref, decision_ref, handler_user_id, created_by)
         VALUES ($1,$2,$3,'TH-A','HD','QD',$4,$5)`,
        [T, OFF, BR1, U.thvA, U.admin],
      );
      const rid = id();
      await owner.query(
        `INSERT INTO td_requests (id, tenant_id, office_id, branch_id, request_ref, created_by) VALUES ($1,$2,$3,$4,'YC-MW',$5)`,
        [rid, T, OFF, BR1, U.admin],
      );
      await owner.query(
        `INSERT INTO td_documents (tenant_id, request_id, recipient_name, address, deadline_at, handler_user_id, status) VALUES
          ($1,$2,'TĐ quá hạn của A','đ', now() - interval '1 day', $3, 'ASSIGNED'),
          ($1,$2,'TĐ chưa giao','đ', now() + interval '1 day', NULL, 'PENDING')`,
        [T, rid, U.thvA],
      );
      const a = await mine(U.thvA);
      expect(a.status).toBe(200);
      expect(items(a).map((i) => [i.domain, i.label, i.overdue])).toEqual([
        ['TONG_DAT', 'TĐ quá hạn của A', true],
        ...items(a)
          .filter((i) => i.domain !== 'TONG_DAT')
          .map((i) => [i.domain, i.label, false]),
      ]);
      expect(
        items(a)
          .map((i) => i.label)
          .sort(),
      ).toEqual(['TĐ quá hạn của A', 'TH-A', 'VB của A', 'XM-A'].sort());
      expect(
        items(await mine(U.thvB))
          .map((i) => i.label)
          .sort(),
      ).toEqual(['VB của B', 'XM-B']);
      expect(items(await mine(U.admin))).toEqual([]);
    });

    it('rejects outsiders, other tenants and anonymous callers', async () => {
      expect(items(await mine(U.outsider))).toEqual([]);
      expect(items(await mine(U.otherTenantAdmin, T2))).toEqual([]);
      expect((await mine(null)).status).toBe(401);
    });
  },
);
