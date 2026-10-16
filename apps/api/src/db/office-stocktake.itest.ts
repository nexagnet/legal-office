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
const DB = `lo_st_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('Stocktake sessions and item categories (HTTP + PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const id = () => randomUUID();
  const storeDir = mkdtempSync(join(tmpdir(), 'lo-st-'));
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

  const O = '/office';
  const rem = async (b: string) =>
    (await owner.query(`SELECT qty_remaining FROM of_batches WHERE id = $1`, [b])).rows[0]
      .qty_remaining as number;
  const setup = async () => {
    const item = (
      await api('POST', `${O}/items`, U.admin, {
        officeId: OFF,
        name: 'Giấy ' + Math.random(),
        unit: 'ream',
      })
    ).json.label as string;
    const b1 = (
      await api('POST', `${O}/items/${item}/receipts`, U.clerk1, {
        branchId: BR1,
        quantity: 10,
        receiptRef: 'PN-1',
      })
    ).json.label as string;
    return { item, b1 };
  };

  it('counts, requires reason on variance, and applies adjustments only on head approval', async () => {
    const { b1 } = await setup();
    const st = (
      await api('POST', `${O}/stocktakes`, U.clerk1, {
        officeId: OFF,
        branchId: BR1,
        note: 'Cuối tháng',
      })
    ).json.label as string;
    expect(
      (await api('POST', `${O}/stocktakes`, U.clerk2, { officeId: OFF, branchId: BR1 })).status,
    ).toBeGreaterThanOrEqual(400);
    const noReason = await api('POST', `${O}/stocktakes/${st}/counts`, U.clerk1, {
      batchId: b1,
      countedQty: 8,
    });
    expect(noReason.json.code).toBe('REASON_REQUIRED');
    expect(
      (
        await api('POST', `${O}/stocktakes/${st}/counts`, U.clerk1, {
          batchId: b1,
          countedQty: 99,
          reason: 'x',
        })
      ).json.code,
    ).toBe('INVALID_QUANTITY');
    expect(
      (
        await api('POST', `${O}/stocktakes/${st}/counts`, U.clerk1, {
          batchId: b1,
          countedQty: 8,
          reason: 'Hỏng 2 ream',
        })
      ).status,
    ).toBe(200);
    // chưa duyệt: số còn của lô chưa đổi
    expect(await rem(b1)).toBe(10);
    // người không phải Admin/Trưởng VP không duyệt được
    expect(
      (await api('POST', `${O}/stocktakes/${st}/decision`, U.secretary, { approve: true })).status,
    ).toBe(403);
    const lines = await api('GET', `${O}/stocktakes/${st}/lines?officeId=${OFF}`, U.clerk1);
    expect(lines.json).toEqual([
      expect.objectContaining({
        batchId: b1,
        systemQty: 10,
        countedQty: 8,
        diff: -2,
        reason: 'Hỏng 2 ream',
      }),
    ]);
    const ok = await api('POST', `${O}/stocktakes/${st}/decision`, U.head, { approve: true });
    expect(ok.status).toBe(200);
    expect(ok.json.label).toBe('1');
    expect(await rem(b1)).toBe(8);
    const mv = await owner.query(
      `SELECT kind, delta, purpose FROM of_movements WHERE batch_id = $1 AND kind = 'ADJUSTMENT'`,
      [b1],
    );
    expect(mv.rows).toEqual([{ kind: 'ADJUSTMENT', delta: -2, purpose: 'Kiểm kê: Hỏng 2 ream' }]);
    // phiên đã đóng
    expect(
      (await api('POST', `${O}/stocktakes/${st}/decision`, U.head, { approve: true })).status,
    ).toBe(409);
    expect(
      (
        await api('POST', `${O}/stocktakes/${st}/counts`, U.clerk1, {
          batchId: b1,
          countedQty: 8,
          reason: 'x',
        })
      ).status,
    ).toBe(409);
    const list = await api('GET', `${O}/stocktakes?officeId=${OFF}`, U.admin);
    expect(list.json).toEqual([
      expect.objectContaining({ id: st, status: 'APPROVED', lines: 1, varianceLines: 1 }),
    ]);
  });

  it('rejects stale counts and lets head reject a session without changing stock', async () => {
    const { item, b1 } = await setup();
    const st = (await api('POST', `${O}/stocktakes`, U.clerk1, { officeId: OFF, branchId: BR1 }))
      .json.label as string;
    expect(
      (
        await api('POST', `${O}/stocktakes/${st}/counts`, U.clerk1, {
          batchId: b1,
          countedQty: 9,
          reason: 'Thiếu 1',
        })
      ).status,
    ).toBe(200);
    // xuất xen giữa lúc đếm và lúc duyệt
    expect(
      (
        await api('POST', `${O}/items/${item}/issues`, U.clerk1, {
          branchId: BR1,
          quantity: 1,
          purpose: 'In hồ sơ',
        })
      ).status,
    ).toBe(200);
    expect(
      (await api('POST', `${O}/stocktakes/${st}/decision`, U.head, { approve: true })).json.code,
    ).toBe('STALE_COUNT');
    expect(await rem(b1)).toBe(9);
    expect(
      (await api('POST', `${O}/stocktakes/${st}/decision`, U.head, { approve: false })).status,
    ).toBe(200);
    expect(await rem(b1)).toBe(9);
    const empty = (await api('POST', `${O}/stocktakes`, U.clerk1, { officeId: OFF, branchId: BR1 }))
      .json.label as string;
    expect(
      (await api('POST', `${O}/stocktakes/${empty}/decision`, U.head, { approve: true })).status,
    ).toBe(422);
    // lô của chi nhánh khác
    const other = (
      await api('POST', `${O}/items/${item}/receipts`, U.clerk2, {
        branchId: BR2,
        quantity: 3,
        receiptRef: 'PN-2',
      })
    ).json.label as string;
    const st2 = (await api('POST', `${O}/stocktakes`, U.clerk1, { officeId: OFF, branchId: BR1 }))
      .json.label as string;
    expect(
      (
        await api('POST', `${O}/stocktakes/${st2}/counts`, U.clerk1, {
          batchId: other,
          countedQty: 3,
        })
      ).status,
    ).toBe(404);
    // THV và người ngoài không thấy phiên
    expect((await api('GET', `${O}/stocktakes?officeId=${OFF}`, U.thvA)).json).toEqual([]);
    expect((await api('GET', `${O}/stocktakes?officeId=${OFF}`, U.outsider)).json).toEqual([]);
  });

  it('item categories: admin sets, others read, others cannot set', async () => {
    const { item } = await setup();
    expect(
      (await api('PUT', `${O}/items/${item}/category`, U.head, { category: 'Văn phòng phẩm' }))
        .status,
    ).toBe(403);
    expect(
      (await api('PUT', `${O}/items/${item}/category`, U.admin, { category: ' Văn phòng phẩm ' }))
        .status,
    ).toBe(200);
    const got = await api('GET', `${O}/item-categories?officeId=${OFF}`, U.clerk1);
    expect(got.json).toEqual(
      expect.arrayContaining([{ itemId: item, category: 'Văn phòng phẩm' }]),
    );
    expect(
      (await api('PUT', `${O}/items/${item}/category`, U.admin, { category: '' })).status,
    ).toBe(200);
    const after = await api('GET', `${O}/item-categories?officeId=${OFF}`, U.clerk1);
    expect((after.json as unknown as { itemId: string }[]).some((r) => r.itemId === item)).toBe(
      false,
    );
  });
});
