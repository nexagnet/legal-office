import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
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
const DB = `lo_ex_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)(
  'Office export: report and ledger XLSX, same scope as JSON (HTTP + PostgreSQL)',
  () => {
    const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
    let owner: pg.Pool;
    let appPool: pg.Pool;
    let server: INestApplication;
    let base = '';
    const id = () => randomUUID();
    const storeDir = mkdtempSync(join(tmpdir(), 'lo-ex-'));
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

    const get = async (path: string, user: string | null, tenant = T) => {
      const headers: Record<string, string> = {};
      if (user) {
        headers['x-synthetic-user'] = user;
        headers['x-synthetic-tenant'] = tenant;
      }
      const res = await fetch(`${base}${path}`, { headers });
      return { status: res.status, res, buf: Buffer.from(await res.arrayBuffer()) };
    };
    const sheet = async (buf: Buffer) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const ws = wb.worksheets[0]!;
      const rows: unknown[][] = [];
      ws.eachRow((r) => rows.push((r.values as unknown[]).slice(1)));
      return rows;
    };
    const today = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const rep = `/office/report/export?officeId=${OFF}&from=2020-01-01&to=${today}`;

    it('exports the report and the S-01 ledger as XLSX with template columns', async () => {
      const rid = id();
      await owner.query(
        `INSERT INTO td_requests (id, tenant_id, office_id, branch_id, request_ref, created_by) VALUES ($1,$2,$3,$4,'YC-EX',$5)`,
        [rid, T, OFF, BR1, U.admin],
      );
      await owner.query(
        `INSERT INTO td_documents (tenant_id, request_id, recipient_name, address, deadline_at) VALUES ($1,$2,'A','đ', now() + interval '2 days')`,
        [T, rid],
      );
      const r = await get(rep, U.admin);
      expect(r.status).toBe(200);
      expect(r.res.headers.get('content-type')).toContain('spreadsheetml');
      const rows = await sheet(r.buf);
      expect(rows[2]).toEqual(['Nghiệp vụ', 'Đơn vị đếm', 'Trạng thái', 'Số lượng']);
      expect(rows.some((x) => x[0] === 'TONG_DAT' && x[1] === 'DOCUMENT' && x[3] === 1)).toBe(true);

      const l = await get(`/office/ledgers/s-01/export?officeId=${OFF}`, U.admin);
      expect(l.status).toBe(200);
      const ls = await sheet(l.buf);
      expect(ls[2]).toHaveLength(10);
      expect(ls[2]![0]).toBe('STT');
      expect(ls[3]![0]).toBe(1);
    });

    it('exports the same report and ledger as PDF and rejects unknown formats', async () => {
      const r = await get(`${rep}&format=pdf`, U.admin);
      expect(r.status).toBe(200);
      expect(r.res.headers.get('content-type')).toContain('application/pdf');
      expect(r.buf.subarray(0, 5).toString()).toBe('%PDF-');
      const l = await get(`/office/ledgers/s-01/export?officeId=${OFF}&format=pdf`, U.admin);
      expect(l.res.headers.get('content-disposition')).toContain('so-s-01.pdf');
      expect(l.buf.subarray(0, 5).toString()).toBe('%PDF-');
      expect((await get(`${rep}&format=docx`, U.admin)).status).toBe(422);
      expect((await get(`${rep}&format=pdf`, null)).status).toBe(401);
      const out = await get(`/office/ledgers/s-01/export?officeId=${OFF}&format=pdf`, U.outsider);
      expect(out.status).toBe(200); // outsider thấy sổ rỗng, cùng phạm vi với Excel
    });

    it('keeps the same scope as the JSON endpoints and rejects bad callers', async () => {
      // Văn thư chi nhánh khác không thấy dòng của chi nhánh 1
      const l = await get(`/office/ledgers/s-01/export?officeId=${OFF}`, U.clerk2);
      expect((await sheet(l.buf)).length).toBe(3);
      expect((await get(`/office/ledgers/s-99/export?officeId=${OFF}`, U.admin)).status).toBe(404);
      expect((await get(rep, null)).status).toBe(401);
      const out = await get(`/office/ledgers/s-01/export?officeId=${OFF}`, U.outsider);
      expect((await sheet(out.buf)).length).toBe(3);
      expect((await get(`${rep}&from=bad`, U.admin)).status).toBe(400);
    });

    it('breaks the report down by THV or branch with the same scope', async () => {
      const rid = id();
      await owner.query(
        `INSERT INTO td_requests (id, tenant_id, office_id, branch_id, request_ref, created_by) VALUES ($1,$2,$3,$4,'YC-BY',$5)`,
        [rid, T, OFF, BR2, U.admin],
      );
      await owner.query(
        `INSERT INTO td_documents (tenant_id, request_id, recipient_name, address, deadline_at, handler_user_id, status) VALUES
          ($1,$2,'G1','đ', now() + interval '2 days', $3, 'ASSIGNED'), ($1,$2,'G2','đ', now() + interval '2 days', $3, 'ASSIGNED')`,
        [T, rid, U.thvA],
      );
      const q = (g: string, user: string | null) =>
        get(`/office/report/by?officeId=${OFF}&from=2020-01-01&to=${today}&groupBy=${g}`, user);
      const byThv = JSON.parse((await q('thv', U.admin)).buf.toString()) as Record<
        string,
        unknown
      >[];
      const a = byThv.find(
        (r) => r.groupId === U.thvA && r.unit === 'DOCUMENT' && r.status === 'ASSIGNED',
      );
      expect(a?.total).toBe(2);
      expect(byThv.some((r) => r.groupLabel === 'Chưa giao')).toBe(true);
      const byBranch = JSON.parse((await q('branch', U.admin)).buf.toString()) as Record<
        string,
        unknown
      >[];
      expect(byBranch.find((r) => r.groupLabel === 'CN2' && r.unit === 'DOCUMENT')?.total).toBe(2);
      // Văn thư chi nhánh 1 không thấy số của chi nhánh 2; THV chỉ thấy phần của mình
      const clerk1 = JSON.parse((await q('branch', U.clerk1)).buf.toString()) as Record<
        string,
        unknown
      >[];
      expect(clerk1.some((r) => r.groupLabel === 'CN2')).toBe(false);
      const own = JSON.parse((await q('thv', U.thvB)).buf.toString()) as Record<string, unknown>[];
      expect(own.some((r) => r.groupId === U.thvA)).toBe(false);
      expect((await q('x', U.admin)).status).toBe(400);
      expect((await q('thv', null)).status).toBe(401);
    });

    it('reports correspondence, supplies and labour for a period with the same scope', async () => {
      const item = id();
      const batch = id();
      await owner.query(
        `INSERT INTO of_correspondence (tenant_id, office_id, branch_id, direction, status, doc_type, counterparty, subject, received_on, created_by)
         VALUES ($1,$2,$3,'INBOUND','RECEIVED','CV','Sở','V/v A', current_date, $4), ($1,$2,$5,'INBOUND','RECEIVED','CV','Sở','V/v B', current_date, $4)`,
        [T, OFF, BR1, U.admin, BR2],
      );
      await owner.query(
        `INSERT INTO of_items (id, tenant_id, office_id, name, unit, created_by) VALUES ($1,$2,$3,'Giấy','ram',$4)`,
        [item, T, OFF, U.admin],
      );
      await owner.query(
        `INSERT INTO of_batches (id, tenant_id, item_id, office_id, branch_id, receipt_ref, qty_received, qty_remaining, received_by) VALUES ($1,$2,$3,$4,$5,'PN-1',10,7,$6)`,
        [batch, T, item, OFF, BR1, U.admin],
      );
      await owner.query(
        `INSERT INTO of_movements (tenant_id, batch_id, kind, delta, purpose, actor_user_id) VALUES ($1,$2,'RECEIPT',10,NULL,$3), ($1,$2,'ISSUE',-3,'in',$3)`,
        [T, batch, U.admin],
      );
      await owner.query(
        `INSERT INTO of_personnel (tenant_id, office_id, person_id, version, branch_id, full_name, gender, work_status, saved_by)
         VALUES ($1,$2,$3,1,$4,'Nguyễn A','M','ACTIVE',$5), ($1,$2,$3,2,$4,'Nguyễn A','M','LEFT',$5)`,
        [T, OFF, id(), BR1, U.admin],
      );
      const q = (user: string | null, extra = '') =>
        get(`/office/report/ops?officeId=${OFF}&from=2020-01-01&to=${today}${extra}`, user);
      const rows = JSON.parse((await q(U.admin)).buf.toString()) as Record<string, unknown>[];
      const pick = (d: string, u: string, s: string) =>
        rows.find((r) => r.domain === d && r.unit === u && r.status === s)?.total;
      expect(pick('CONG_VAN', 'CORRESPONDENCE', 'INBOUND:RECEIVED')).toBe(2);
      expect(pick('VAT_TU', 'MOVEMENT', 'ISSUE')).toBe(1);
      expect(pick('VAT_TU', 'QUANTITY', 'RECEIPT')).toBe(10);
      expect(pick('VAT_TU', 'QUANTITY', 'ISSUE')).toBe(3);
      // chỉ tính phiên bản mới nhất của mỗi người
      expect(pick('LAO_DONG', 'PERSON', 'LEFT')).toBe(1);
      expect(pick('LAO_DONG', 'PERSON', 'ACTIVE')).toBeUndefined();
      // Văn thư chi nhánh 2 không thấy phần của chi nhánh 1
      const c2 = JSON.parse((await q(U.clerk2)).buf.toString()) as Record<string, unknown>[];
      expect(c2.find((r) => r.unit === 'CORRESPONDENCE')?.total).toBe(1);
      expect(c2.some((r) => r.domain === 'VAT_TU')).toBe(false);
      expect((await q(U.admin, '&from=bad')).status).toBe(400);
      expect((await q(null)).status).toBe(401);
    });
  },
);
