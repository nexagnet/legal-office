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
const DB = `lo_nt_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)(
  'Office notifications: lazy reminders, scope, read state (HTTP + PostgreSQL)',
  () => {
    const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
    let owner: pg.Pool;
    let appPool: pg.Pool;
    let server: INestApplication;
    let base = '';
    const id = () => randomUUID();
    const storeDir = mkdtempSync(join(tmpdir(), 'lo-nt-'));
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

    const list = (user: string | null, extra = '', tenant = T) =>
      api('GET', `/office/notifications?officeId=${OFF}${extra}`, user, undefined, tenant);
    type Item = { id: string; kind: string; label: string; readAt: string | null };
    const items = (r: { json: Record<string, unknown> }) => r.json.items as Item[];

    it('lazily creates one notification per deadline and bucket, only for deadlines the user may read', async () => {
      const rid = id();
      await owner.query(
        `INSERT INTO td_requests (id, tenant_id, office_id, branch_id, request_ref, created_by) VALUES ($1,$2,$3,$4,'YC-NT',$5)`,
        [rid, T, OFF, BR1, U.admin],
      );
      await owner.query(
        `INSERT INTO td_documents (tenant_id, request_id, recipient_name, address, deadline_at) VALUES
          ($1,$2,'Quá hạn','đ', now() - interval '1 day'),
          ($1,$2,'Sắp tới','đ', now() + interval '2 days'),
          ($1,$2,'Xa','đ', now() + interval '30 days')`,
        [T, rid],
      );
      const adminList = await list(U.admin);
      expect(adminList.status).toBe(200);
      expect(
        items(adminList)
          .map((i) => [i.label, i.kind])
          .sort(),
      ).toEqual([
        ['Quá hạn', 'DEADLINE_OVERDUE'],
        ['Sắp tới', 'DEADLINE_DUE_SOON'],
      ]);
      expect(adminList.json.unreadCount).toBe(2);
      // Gọi lại không nhân bản
      expect(items(await list(U.admin))).toHaveLength(2);
      // Chi nhánh khác không thấy hạn của chi nhánh 1; THV không được giao cũng không
      expect(items(await list(U.clerk1))).toHaveLength(2);
      expect(items(await list(U.clerk2))).toHaveLength(0);
      expect(items(await list(U.thvA))).toHaveLength(0);
    });

    it('marks one or all notifications read, only for the caller', async () => {
      const first = items(await list(U.admin))[0]!;
      const one = await api('POST', '/office/notifications/read', U.admin, {
        officeId: OFF,
        id: first.id,
      });
      expect(one.status).toBe(200);
      const after = await list(U.admin);
      expect(after.json.unreadCount).toBe(1);
      expect(items(await list(U.admin, '&unread=true'))).toHaveLength(1);
      // Người khác không đánh dấu được thông báo của admin
      const other = await api('POST', '/office/notifications/read', U.clerk1, {
        officeId: OFF,
        id: first.id,
      });
      expect(other.status).toBeGreaterThanOrEqual(400);
      expect((await list(U.clerk1)).json.unreadCount).toBe(2);
      const all = await api('POST', '/office/notifications/read', U.clerk1, { officeId: OFF });
      expect(all.status).toBe(200);
      expect((await list(U.clerk1)).json.unreadCount).toBe(0);
      expect((await list(U.admin)).json.unreadCount).toBe(1);
    });

    it('rejects outsiders, other tenants and anonymous callers', async () => {
      expect(items(await list(U.outsider))).toHaveLength(0);
      expect(
        (await api('POST', '/office/notifications/read', U.outsider, { officeId: OFF })).status,
      ).toBeGreaterThanOrEqual(400);
      expect(items(await list(U.otherTenantAdmin, '', T2))).toHaveLength(0);
      expect((await list(null)).status).toBe(401);
    });

    it('also reminds correspondence with an open due date, within the same read scope', async () => {
      await owner.query(
        `INSERT INTO of_correspondence (tenant_id, office_id, branch_id, direction, status, doc_type, counterparty, subject, received_on, due_at, result_note, created_by)
         VALUES ($1,$2,$3,'INBOUND','RECEIVED','CV','Sở','Công văn quá hạn', current_date - 5, now() - interval '1 day', NULL, $4),
                ($1,$2,$3,'INBOUND','HANDLED','CV','Sở','Đã xử lý', current_date - 5, now() - interval '1 day', 'xong', $4)`,
        [T, OFF, BR2, U.admin],
      );
      const mine = items(await list(U.clerk2));
      expect(mine.map((i) => [i.label, i.kind])).toEqual([
        ['Công văn quá hạn', 'DEADLINE_OVERDUE'],
      ]);
      expect(items(await list(U.clerk2))).toHaveLength(1);
      expect(items(await list(U.admin)).some((i) => i.label === 'Công văn quá hạn')).toBe(true);
      expect(items(await list(U.clerk1)).some((i) => i.label === 'Công văn quá hạn')).toBe(false);
    });
  },
);
