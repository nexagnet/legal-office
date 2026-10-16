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
const DB = `lo_rd_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)(
  'Office read layer: movements, correspondence list/detail/files, assign (HTTP + PostgreSQL)',
  () => {
    const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
    let owner: pg.Pool;
    let appPool: pg.Pool;
    let server: INestApplication;
    let base = '';
    const id = () => randomUUID();
    const storeDir = mkdtempSync(join(tmpdir(), 'lo-td-'));
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

    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from('tệp giả lập')]);
    const OF = '/office/correspondence';
    const q = (o: Record<string, string>) => '?' + new URLSearchParams(o).toString();
    const upload = async (path: string, user: string, body: Buffer) => {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'image/png', 'x-synthetic-user': user, 'x-synthetic-tenant': T },
        body,
      });
      return res.status;
    };
    const arr = (r: { json: unknown }) => r.json as Record<string, unknown>[];

    describe('movements', () => {
      let item = '';
      it('records receipts and FIFO issues, and shows each role only its scope', async () => {
        const it1 = await api('POST', '/office/items', U.admin, {
          officeId: OFF,
          name: 'Giấy A4',
          unit: 'ram',
        });
        item = it1.json.label as string;
        const it2 = await api('POST', '/office/items', U.admin, {
          officeId: OFF,
          name: 'Mực in',
          unit: 'hộp',
        });
        const rcv = (u: string, br: string, n: number, ref: string, i = item) =>
          api('POST', `/office/items/${i}/receipts`, u, {
            branchId: br,
            quantity: n,
            receiptRef: ref,
          });
        expect((await rcv(U.clerk1, BR1, 5, 'PN1')).status).toBe(200);
        expect((await rcv(U.clerk1, BR1, 5, 'PN2')).status).toBe(200);
        expect((await rcv(U.clerk2, BR2, 4, 'PN3')).status).toBe(200);
        expect((await rcv(U.clerk2, BR2, 2, 'PN4', it2.json.label as string)).status).toBe(200);
        const iss = await api('POST', `/office/items/${item}/issues`, U.clerk1, {
          branchId: BR1,
          quantity: 7,
          purpose: 'Văn phòng',
        });
        expect(iss.status).toBe(200);

        const all = arr(await api('GET', `/office/movements${q({ officeId: OFF })}`, U.admin));
        expect(all).toHaveLength(6); // 4 nhập + 2 dòng xuất (mỗi lô một dòng)
        const issues = all.filter((r) => r.kind === 'ISSUE');
        expect(issues.map((r) => r.delta as number).sort((x, y) => x - y)).toEqual([-5, -2]);
        expect(issues.every((r) => r.receiptRef && r.batchId && r.purpose === 'Văn phòng')).toBe(
          true,
        );
        expect(all.every((r) => !('price' in r) && !('cost' in r))).toBe(true);
        for (const u of [U.head, U.secretary]) {
          expect(arr(await api('GET', `/office/movements${q({ officeId: OFF })}`, u))).toHaveLength(
            6,
          );
        }
        const c1 = arr(await api('GET', `/office/movements${q({ officeId: OFF })}`, U.clerk1));
        expect(c1).toHaveLength(4);
        expect(c1.every((r) => r.branchId === BR1)).toBe(true);
        expect(
          arr(await api('GET', `/office/movements${q({ officeId: OFF })}`, U.acc1)),
        ).toHaveLength(4);
        const c2 = arr(await api('GET', `/office/movements${q({ officeId: OFF })}`, U.clerk2));
        expect(c2).toHaveLength(2);
        for (const u of [U.thvA, U.outsider]) {
          expect(arr(await api('GET', `/office/movements${q({ officeId: OFF })}`, u))).toEqual([]);
        }
        expect(
          arr(
            await api(
              'GET',
              `/office/movements${q({ officeId: OFF })}`,
              U.otherTenantAdmin,
              undefined,
              T2,
            ),
          ),
        ).toEqual([]);
        // bộ lọc
        expect(
          arr(await api('GET', `/office/movements${q({ officeId: OFF, itemId: item })}`, U.admin)),
        ).toHaveLength(5);
        expect(
          arr(await api('GET', `/office/movements${q({ officeId: OFF, branchId: BR2 })}`, U.admin)),
        ).toHaveLength(2);
        expect(
          arr(await api('GET', `/office/movements${q({ officeId: OFF, limit: '3' })}`, U.admin)),
        ).toHaveLength(3);
        expect(
          arr(
            await api(
              'GET',
              `/office/movements${q({ officeId: OFF, from: '2999-01-01' })}`,
              U.admin,
            ),
          ),
        ).toEqual([]);
        expect(
          arr(
            await api('GET', `/office/movements${q({ officeId: OFF, to: '2000-01-01' })}`, U.admin),
          ),
        ).toEqual([]);
        expect(
          arr(
            await api(
              'GET',
              `/office/movements${q({ officeId: OFF, from: '2000-01-01', to: '2999-01-01' })}`,
              U.admin,
            ),
          ),
        ).toHaveLength(6);
        expect(
          (await api('GET', `/office/movements${q({ officeId: OFF, from: 'bad' })}`, U.admin))
            .status,
        ).toBe(400);
        const audit = await owner.query(
          `SELECT count(*)::int n FROM audit_log WHERE action = 'of.stock.movements'`,
        );
        expect(audit.rows[0].n).toBeGreaterThan(5);
      });
    });

    describe('correspondence list, detail, files, assign', () => {
      const past = new Date(Date.now() - 3 * 86400_000).toISOString();
      const future = new Date(Date.now() + 3 * 86400_000).toISOString();
      const inbound = async (user: string, br: string, extra: Record<string, unknown>) =>
        (
          await api('POST', OF, user, {
            officeId: OFF,
            branchId: br,
            direction: 'INBOUND',
            docType: 'Công văn',
            counterparty: 'Sở Tư pháp',
            subject: 'Nội dung ' + Math.random(),
            receivedOn: '2026-10-01',
            ...extra,
          })
        ).json.label as string;
      let late = '',
        fine = '',
        mine = '',
        br2doc = '',
        outDoc = '';

      it('lists extended columns, filters, overdue flag and scope', async () => {
        late = await inbound(U.clerk1, BR1, { dueAt: past, handlerUserId: U.clerk1 });
        fine = await inbound(U.clerk1, BR1, { dueAt: future });
        mine = await inbound(U.clerk1, BR1, { dueAt: past, handlerUserId: U.thvA });
        br2doc = await inbound(U.clerk2, BR2, { dueAt: past });
        outDoc = (
          await api('POST', OF, U.clerk1, {
            officeId: OFF,
            branchId: BR1,
            direction: 'OUTBOUND',
            docType: 'Công văn',
            counterparty: 'UBND',
            subject: 'Đi 1',
          })
        ).json.label as string;
        const L = (user: string, o: Record<string, string> = {}, tenant = T) =>
          api(
            'GET',
            `/office/correspondence/list${q({ officeId: OFF, ...o })}`,
            user,
            undefined,
            tenant,
          );
        const adminAll = arr(await L(U.admin));
        expect(adminAll).toHaveLength(5);
        const row = adminAll.find((r) => r.id === late)!;
        expect(row).toMatchObject({
          overdue: true,
          handlerUserId: U.clerk1,
          receivedOn: '2026-10-01',
          status: 'RECEIVED',
        });
        expect(row).toHaveProperty('dueAt');
        expect(row).toHaveProperty('resultNote');
        expect(row).toHaveProperty('archiveRef');
        expect(row).toHaveProperty('issuedOn');
        expect(adminAll.find((r) => r.id === fine)!.overdue).toBe(false);
        expect(
          arr(await L(U.admin, { overdue: 'true' }))
            .map((r) => r.id)
            .sort(),
        ).toEqual([late, mine, br2doc].sort());
        expect(arr(await L(U.admin, { direction: 'OUTBOUND' })).map((r) => r.id)).toEqual([outDoc]);
        expect(arr(await L(U.admin, { status: 'HANDLED' }))).toEqual([]);
        expect(arr(await L(U.admin, { handler: U.thvA })).map((r) => r.id)).toEqual([mine]);
        expect(arr(await L(U.admin, { from: '2026-10-02', direction: 'INBOUND' }))).toEqual([]);
        expect(arr(await L(U.admin, { to: '2026-10-01', direction: 'INBOUND' }))).toHaveLength(4);
        // phạm vi đọc
        expect(
          arr(await L(U.clerk1))
            .map((r) => r.id)
            .sort(),
        ).toEqual([late, fine, mine, outDoc].sort());
        expect(arr(await L(U.clerk2)).map((r) => r.id)).toEqual([br2doc]);
        expect(
          arr(await L(U.acc1))
            .map((r) => r.id)
            .sort(),
        ).toEqual([late, fine, mine, outDoc].sort());
        expect(arr(await L(U.thvA)).map((r) => r.id)).toEqual([mine]);
        expect(arr(await L(U.thvB))).toEqual([]);
        expect(arr(await L(U.outsider))).toEqual([]);
        expect(arr(await L(U.otherTenantAdmin, {}, T2))).toEqual([]);
        expect((await L(U.admin, { overdue: 'maybe' })).status).toBe(400);
        // văn bản đã xử lý không còn quá hạn
        expect(
          (await api('POST', `${OF}/${late}/result`, U.clerk1, { result: 'Đã trả lời' })).status,
        ).toBe(200);
        const done = arr(await L(U.admin)).find((r) => r.id === late)!;
        expect(done).toMatchObject({ status: 'HANDLED', overdue: false, resultNote: 'Đã trả lời' });
        expect(
          arr(await L(U.admin, { overdue: 'true' }))
            .map((r) => r.id)
            .sort(),
        ).toEqual([mine, br2doc].sort());
      });

      it('returns detail with attachments and events, downloads files with the same read scope', async () => {
        expect(
          await upload(`${OF}/${fine}/attachment-files${q({ role: 'ATTACHMENT' })}`, U.clerk1, PNG),
        ).toBe(200);
        const d = await api('GET', `${OF}/${fine}`, U.clerk1);
        expect(d.status).toBe(200);
        const atts = d.json.attachments as {
          id: number;
          role: string;
          key: string;
          sha256: string;
          name: string;
        }[];
        expect(atts).toHaveLength(1);
        expect(atts[0]).toMatchObject({ role: 'ATTACHMENT' });
        expect(atts[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(atts[0]!.key.startsWith(`t/${T}/`)).toBe(true);
        expect(atts[0]!.name).toMatch(/\.png$/);
        expect((d.json.events as { event: string }[]).map((e) => e.event)).toEqual([
          'CREATED',
          'ATTACHED',
        ]);
        expect(d.json).toMatchObject({ id: fine, direction: 'INBOUND', overdue: false });

        const file = await fetch(`${base}${OF}/${fine}/files/${atts[0]!.id}`, {
          headers: { 'x-synthetic-user': U.clerk1, 'x-synthetic-tenant': T },
        });
        expect(file.status).toBe(200);
        expect(file.headers.get('content-type')).toBe('image/png');
        expect(Buffer.from(await file.arrayBuffer()).equals(PNG)).toBe(true);
        const f = (id: string, att: number | string, user: string, tenant = T) =>
          fetch(`${base}${OF}/${id}/files/${att}`, {
            headers: { 'x-synthetic-user': user, 'x-synthetic-tenant': tenant },
          }).then((r) => r.status);
        expect(await f(fine, atts[0]!.id, U.admin)).toBe(200);
        expect(await f(fine, atts[0]!.id, U.clerk2)).toBe(404); // chi nhánh khác
        expect(await f(fine, atts[0]!.id, U.thvA)).toBe(404);
        expect(await f(fine, atts[0]!.id, U.outsider)).toBe(404);
        expect(await f(fine, atts[0]!.id, U.otherTenantAdmin, T2)).toBe(404);
        expect(await f(fine, 999999, U.admin)).toBe(404);
        // tệp của công văn khác không tải được qua id công văn này
        expect(await f(mine, atts[0]!.id, U.admin)).toBe(404);
        expect((await api('GET', `${OF}/${fine}`, U.clerk2)).status).toBe(404);
        expect((await api('GET', `${OF}/${mine}`, U.thvA)).status).toBe(200);
        expect((await api('GET', `${OF}/${mine}`, U.thvB)).status).toBe(404);
        expect((await api('GET', `${OF}/${randomUUID()}`, U.admin)).status).toBe(404);
        expect((await api('GET', `${OF}/${fine}`, null)).status).toBeGreaterThanOrEqual(400);
      });

      it('assigns a handler only by Admin/Head/Secretary, only while RECEIVED, only to office members', async () => {
        const assign = (id: string, user: string, handler: string | null) =>
          api('POST', `${OF}/${id}/assign`, user, { handlerUserId: handler });
        for (const u of [U.clerk1, U.acc1, U.thvA, U.outsider]) {
          expect((await assign(fine, u, U.thvB)).status).toBeGreaterThanOrEqual(400);
        }
        expect((await assign(fine, U.outsider, U.thvB)).status).toBe(403);
        expect((await assign(fine, U.admin, U.outsider)).json.code).toBe('INVALID_HANDLER');
        expect((await assign(fine, U.admin, U.otherTenantAdmin)).json.code).toBe('INVALID_HANDLER');
        expect((await assign(fine, U.admin, randomUUID())).json.code).toBe('INVALID_HANDLER');
        expect((await assign(outDoc, U.admin, U.thvB)).json.code).toBe('CORRESPONDENCE_FINAL');
        expect((await assign(late, U.admin, U.thvB)).json.code).toBe('CORRESPONDENCE_FINAL'); // đã HANDLED
        expect(
          (await api('POST', `${OF}/${fine}/assign`, U.admin, { handlerUserId: U.thvB, x: 1 }))
            .status,
        ).toBe(400);
        expect(
          (await api('POST', `${OF}/${randomUUID()}/assign`, U.admin, { handlerUserId: U.thvB }))
            .json.code,
        ).toBe('CORRESPONDENCE_NOT_FOUND');
        expect(
          (
            await api(
              'POST',
              `${OF}/${fine}/assign`,
              U.otherTenantAdmin,
              { handlerUserId: U.thvB },
              T2,
            )
          ).json.code,
        ).toBe('CORRESPONDENCE_NOT_FOUND');

        expect((await assign(fine, U.secretary, U.thvA)).status).toBe(200);
        expect((await api('GET', `${OF}/${fine}`, U.thvA)).status).toBe(200);
        expect((await api('GET', `${OF}/${fine}`, U.thvB)).status).toBe(404);
        expect((await assign(fine, U.head, U.thvB)).status).toBe(200); // đổi người
        expect((await api('GET', `${OF}/${fine}`, U.thvA)).status).toBe(404);
        const d = await api('GET', `${OF}/${fine}`, U.thvB);
        expect(d.json.handlerUserId).toBe(U.thvB);
        expect((d.json.events as { event: string }[]).map((e) => e.event)).toEqual([
          'CREATED',
          'ATTACHED',
          'ASSIGNED',
          'ASSIGNED',
        ]);
        // người được giao xử lý được
        expect((await api('POST', `${OF}/${fine}/result`, U.thvB, { result: 'Xong' })).status).toBe(
          200,
        );
        expect((await assign(fine, U.admin, U.thvA)).json.code).toBe('CORRESPONDENCE_FINAL');
        const au = await owner.query(
          `SELECT outcome FROM audit_log WHERE action = 'of.corr.assign'`,
        );
        expect(au.rows.filter((r) => r.outcome === 'allow')).toHaveLength(2);
        expect(au.rows.filter((r) => r.outcome === 'deny').length).toBeGreaterThan(5);
      });
    });
  },
);
