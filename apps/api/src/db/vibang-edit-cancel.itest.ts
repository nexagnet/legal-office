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
const DB = `lo_edit_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)(
  'Vi bằng 48h edit, change requests and cancellation (HTTP + PostgreSQL)',
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

    const customer = async () =>
      (
        await api('POST', '/vibang/customers', U.clerk1, {
          kind: 'PERSON',
          externalRef: 'KH-giả-lập',
        })
      ).json.label as string;
    const newCase = async (assign = true) => {
      const r = await api('POST', '/vibang/cases', U.clerk1, {
        officeId: OFF,
        branchId: BR1,
        customerId: await customer(),
        title: 'Hồ sơ giả lập',
      });
      const c = r.json.label as string;
      if (assign) {
        await api('PUT', `/vibang/cases/${c}/responsible-thv`, U.admin, { thvUserId: U.thvA });
      }
      return c;
    };
    const age = async (c: string) => {
      await owner.query('ALTER TABLE vibang_cases DISABLE TRIGGER vibang_cases_guard_trg');
      await owner.query(
        `UPDATE vibang_cases SET created_at = now() - interval '49 hours' WHERE id = $1`,
        [c],
      );
      await owner.query('ALTER TABLE vibang_cases ENABLE TRIGGER vibang_cases_guard_trg');
    };
    const row = async (c: string) =>
      (
        await owner.query(
          `SELECT title, description, status, version FROM vibang_cases WHERE id=$1`,
          [c],
        )
      ).rows[0];

    it('lets allowed roles edit title and description within 48 hours', async () => {
      const c = await newCase();
      const url = `/vibang/cases/${c}/details`;
      for (const who of [U.admin, U.head, U.secretary, U.clerk1, U.thvA]) {
        const r = await api('PUT', url, who, { title: `Tiêu đề ${who.slice(0, 4)}` });
        expect(r.status).toBe(200);
      }
      expect((await api('PUT', url, U.thvA, { description: 'Nội dung ghi nhận' })).status).toBe(
        200,
      );
      expect(await row(c)).toMatchObject({ description: 'Nội dung ghi nhận', version: 8 });
      for (const who of [U.thvB, U.acc1, U.clerk2, U.outsider]) {
        expect((await api('PUT', url, who, { title: 'x' })).status).toBe(403);
      }
      expect((await api('PUT', url, U.admin, {})).json.code).toBe('NOTHING_TO_CHANGE');
      expect((await api('PUT', url, U.admin, { title: ' ' })).json.code).toBe('TITLE_REQUIRED');
      expect((await api('PUT', url, U.admin, { title: 'x', amount: 1 })).status).toBe(400);
      expect(
        (await api('PUT', `/vibang/cases/${id()}/details`, U.admin, { title: 'x' })).status,
      ).toBe(404);
      expect((await api('PUT', url, U.otherTenantAdmin, { title: 'x' }, T2)).status).toBe(404);
      expect((await api('PUT', url, null, { title: 'x' })).status).toBe(401);
    });

    it('closes direct edit after 48 hours and requires a change request approved by Admin', async () => {
      const c = await newCase();
      const edit = `/vibang/cases/${c}/details`;
      const req = `/vibang/cases/${c}/change-requests`;
      const body = { field: 'title', value: 'Tiêu đề mới', reason: 'Sai chính tả' };
      expect((await api('POST', req, U.clerk1, body)).json.code).toBe('EDIT_WINDOW_OPEN');
      await age(c);
      expect((await api('PUT', edit, U.admin, { title: 'x' })).json.code).toBe(
        'EDIT_WINDOW_CLOSED',
      );
      expect((await api('POST', req, U.acc1, body)).status).toBe(403);
      expect((await api('POST', req, U.clerk1, { ...body, field: 'status' })).status).toBe(400);
      expect((await api('POST', req, U.clerk1, { ...body, reason: ' ' })).status).toBe(422);
      const made = await api('POST', req, U.clerk1, body);
      expect(made.status).toBe(200);
      const rid = made.json.label as string;
      expect(await row(c)).toMatchObject({ title: 'Hồ sơ giả lập' });

      const list = await api('GET', req, U.thvA);
      expect(list.status).toBe(200);
      expect((list.json.items as { status: string }[])[0]).toMatchObject({
        status: 'PENDING',
        before: { title: 'Hồ sơ giả lập' },
        after: { title: 'Tiêu đề mới' },
      });
      // THV xem được mọi hồ sơ của văn phòng (chủ dự án chốt 16/10/2026) nên cũng thấy đề nghị này.
      expect(((await api('GET', req, U.thvB)).json.items as unknown[]).length).toBe(1);

      const dec = `/vibang/change-requests/${rid}/decision`;
      for (const who of [U.head, U.secretary, U.clerk1, U.thvA, U.outsider]) {
        expect((await api('POST', dec, who, { accept: true })).status).toBe(403);
      }
      expect((await api('POST', dec, U.admin, { accept: 'yes' })).status).toBe(400);
      expect((await api('POST', dec, U.admin, { accept: true })).status).toBe(200);
      expect(await row(c)).toMatchObject({ title: 'Tiêu đề mới', version: 3 });
      expect((await api('POST', dec, U.admin, { accept: false })).json.code).toBe(
        'REQUEST_NOT_PENDING',
      );
      expect(
        (await api('POST', `/vibang/change-requests/${id()}/decision`, U.admin, { accept: true }))
          .status,
      ).toBe(404);

      const rej = (
        await api('POST', req, U.thvA, { field: 'description', value: 'Mô tả', reason: 'Bổ sung' })
      ).json.label as string;
      expect(
        (await api('POST', `/vibang/change-requests/${rej}/decision`, U.admin, { accept: false }))
          .status,
      ).toBe(200);
      expect((await row(c)).description).not.toBe('Mô tả');
      const after = (await api('GET', req, U.admin)).json.items as { status: string }[];
      expect(after.map((i) => i.status).sort()).toEqual(['APPROVED', 'REJECTED']);
    });

    it('extends change requests to customer fields and locks direct edit of a used customer', async () => {
      const c = await newCase();
      const cust = (await owner.query(`SELECT customer_id FROM vibang_cases WHERE id=$1`, [c]))
        .rows[0].customer_id as string;
      const profile = `/vibang/customers/${cust}/profile`;
      const req = `/vibang/cases/${c}/change-requests`;
      const body = { field: 'customer_phone', value: '0912345678', reason: 'Khách đổi số' };
      expect(
        (await api('POST', profile, U.clerk1, { displayName: 'Nguyễn Văn A', phone: '0900000000' }))
          .status,
      ).toBe(200);
      // Khách chưa bị khoá và hồ sơ còn trong 48 giờ: sửa trực tiếp, chưa cần đề nghị.
      expect((await api('POST', req, U.clerk1, body)).json.code).toBe('EDIT_WINDOW_OPEN');
      await age(c);
      expect(
        (await api('POST', profile, U.clerk1, { displayName: 'Nguyễn Văn B', phone: '0911' })).json
          .code,
      ).toBe('CUSTOMER_LOCKED');
      expect((await api('POST', req, U.acc1, body)).status).toBe(403);
      expect((await api('POST', req, U.clerk1, { ...body, value: '0900000000' })).json.code).toBe(
        'NOTHING_TO_CHANGE',
      );
      expect(
        (await api('POST', req, U.clerk1, { ...body, field: 'customer_name', value: ' ' })).status,
      ).toBe(422);
      expect(
        (await api('POST', req, U.clerk1, { ...body, field: 'customer_tax_code', value: 'MST1' }))
          .json.code,
      ).toBe('FIELD_NOT_FOR_KIND');
      const made = await api('POST', req, U.clerk1, body);
      expect(made.status).toBe(200);
      const items = (await api('GET', req, U.thvA)).json.items as {
        before: unknown;
        after: unknown;
      }[];
      expect(items[0]).toMatchObject({
        before: { customer_phone: '0900000000' },
        after: { customer_phone: '0912345678' },
      });
      const dec = `/vibang/change-requests/${made.json.label as string}/decision`;
      expect((await api('POST', dec, U.head, { accept: true })).status).toBe(403);
      expect((await api('POST', dec, U.admin, { accept: true })).status).toBe(200);
      const after = (
        await owner.query(`SELECT phone, display_name, updated_by FROM customers WHERE id=$1`, [
          cust,
        ])
      ).rows[0];
      expect(after).toMatchObject({
        phone: '0912345678',
        display_name: 'Nguyễn Văn A',
        updated_by: U.admin,
      });
      const id2 = (
        await api('POST', req, U.clerk1, {
          field: 'customer_id_number',
          value: '001099000111',
          reason: 'Nhập sai',
        })
      ).json.label as string;
      expect(
        (await api('POST', `/vibang/change-requests/${id2}/decision`, U.admin, { accept: true }))
          .status,
      ).toBe(200);
      expect(
        (await owner.query(`SELECT id_number FROM customers WHERE id=$1`, [cust])).rows[0]
          .id_number,
      ).toBe('001099000111');

      // Hồ sơ mới của cùng khách còn trong 48 giờ: trường khách được đề nghị ngay vì danh bạ đã khoá, trường hồ sơ thì chưa.
      const second = (
        await api('POST', '/vibang/cases', U.clerk1, {
          officeId: OFF,
          branchId: BR1,
          customerId: cust,
          title: 'Hồ sơ thứ hai',
        })
      ).json.label as string;
      const req2 = `/vibang/cases/${second}/change-requests`;
      expect(
        (
          await api('POST', req2, U.clerk1, {
            field: 'customer_address',
            value: 'Hà Nội',
            reason: 'Bổ sung',
          })
        ).status,
      ).toBe(200);
      expect(
        (await api('POST', req2, U.clerk1, { field: 'title', value: 'x', reason: 'y' })).json.code,
      ).toBe('EDIT_WINDOW_OPEN');
    });

    it('cancels only by Admin, with a reason, before any legal act', async () => {
      const c = await newCase(false);
      const url = `/vibang/cases/${c}/cancellation`;
      for (const who of [U.head, U.secretary, U.clerk1, U.outsider]) {
        expect((await api('POST', url, who, { reason: 'Khách rút' })).status).toBe(403);
      }
      expect((await api('POST', url, U.admin, { reason: ' ' })).status).toBe(422);
      expect((await api('POST', url, U.admin, { reason: 'Khách rút' })).status).toBe(200);
      expect(await row(c)).toMatchObject({ status: 'CANCELLED' });
      expect((await api('POST', url, U.admin, { reason: 'Lại' })).json.code).toBe(
        'CANCEL_NOT_ALLOWED',
      );
      expect(
        (await api('PUT', `/vibang/cases/${c}/details`, U.admin, { title: 'x' })).json.code,
      ).toBe('CASE_FINAL');
      const assigned = await newCase();
      expect(
        (
          await api('POST', `/vibang/cases/${assigned}/cancellation`, U.admin, {
            reason: 'Không hợp lệ',
          })
        ).status,
      ).toBe(200);
      const signed = await newCase();
      await owner.query('ALTER TABLE vibang_cases DISABLE TRIGGER vibang_cases_guard_trg');
      await owner.query(`UPDATE vibang_cases SET status = 'SIGNED' WHERE id = $1`, [signed]);
      await owner.query('ALTER TABLE vibang_cases ENABLE TRIGGER vibang_cases_guard_trg');
      expect(
        (await api('POST', `/vibang/cases/${signed}/cancellation`, U.admin, { reason: 'x' })).json
          .code,
      ).toBe('CANCEL_NOT_ALLOWED');
      expect(
        (await api('POST', `/vibang/cases/${id()}/cancellation`, U.admin, { reason: 'x' })).status,
      ).toBe(404);
      expect((await api('POST', url, U.otherTenantAdmin, { reason: 'x' }, T2)).status).toBe(404);
    });

    it('lists THV only to an Admin of the office', async () => {
      const ok = await api('GET', '/vibang/thv', U.admin);
      expect(ok.status).toBe(200);
      const ids = (ok.json.items as { userId: string }[]).map((i) => i.userId).sort();
      expect(ids).toEqual([U.thvA, U.thvB].sort());
      for (const who of [U.head, U.clerk1, U.thvA, U.outsider]) {
        expect((await api('GET', '/vibang/thv', who)).json.items).toEqual([]);
      }
      expect(
        (await api('GET', '/vibang/thv', U.otherTenantAdmin, undefined, T2)).json.items,
      ).toEqual([]);
      expect((await api('GET', '/vibang/thv', null)).status).toBe(401);
    });

    it('reports case progress only to people who may see the case', async () => {
      const c = await newCase();
      const url = `/vibang/cases/${c}/progress`;
      const fresh = await api('GET', url, U.thvA);
      expect(fresh.status).toBe(200);
      expect(fresh.json).toMatchObject({
        misaStatus: 'NOT_CONFIRMED',
        numberLabel: null,
        signedAt: null,
        stampedAt: null,
        hasFinalScan: false,
      });
      expect(
        (
          await api('PUT', `/vibang/cases/${c}/misa`, U.acc1, {
            status: 'CONFIRMED_FULL',
            reference: 'MISA-giả-lập',
          })
        ).status,
      ).toBe(200);
      expect((await api('GET', url, U.clerk1)).json.misaStatus).toBe('CONFIRMED_FULL');
      expect((await api('GET', url, U.thvB)).status).toBe(200);
      for (const who of [U.clerk2, U.outsider]) {
        expect((await api('GET', url, who)).status).toBe(404);
      }
      expect((await api('GET', url, U.otherTenantAdmin, undefined, T2)).status).toBe(404);
      expect((await api('GET', `/vibang/cases/${id()}/progress`, U.admin)).status).toBe(404);
      expect((await api('GET', url, null)).status).toBe(401);
    });

    it('audits every denial', async () => {
      const r = await owner.query(
        `SELECT count(*)::int n FROM audit_log WHERE action IN ('vb.case.edit','vb.change.request','vb.change.decide','vb.case.cancel') AND outcome = 'deny'`,
      );
      expect(r.rows[0].n).toBeGreaterThan(15);
    });
  },
);
