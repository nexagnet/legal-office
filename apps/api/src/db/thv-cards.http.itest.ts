import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';
import { LocalFileStore } from '../storage/file-store';

// Vòng đời Thẻ thừa hành viên (0095): Admin làm trực tiếp, không bước xác nhận, không xoá, giữ lịch sử và bản scan. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_thv_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const PDF = Buffer.from('%PDF-1.4\n% quyết định giả lập 1\n');
const PDF2 = Buffer.from('%PDF-1.4\n% quyết định giả lập 2\n');

describe.skipIf(!ADMIN_URL)('Thẻ THV: vòng đời qua HTTP (PostgreSQL + kho tệp)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const storeDir = mkdtempSync(join(tmpdir(), 'lo-thv-'));
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  const U = { admin: id(), clerk: id(), thv: id() };

  const call = async (
    method: string,
    path: string,
    user: string,
    body?: unknown,
    type?: string,
  ) => {
    const isJson = body !== undefined && !Buffer.isBuffer(body);
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'x-synthetic-user': user,
        'x-synthetic-tenant': T,
        ...(isJson ? { 'content-type': 'application/json' } : {}),
        ...(Buffer.isBuffer(body) && type ? { 'content-type': type } : {}),
      },
      body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
    });
    const bytes = Buffer.from(await res.arrayBuffer());
    const text = bytes.toString('utf8');
    let json: Json = {};
    try {
      json = text ? (JSON.parse(text) as Json) : {};
    } catch {
      /* tệp nhị phân */
    }
    return { status: res.status, json, bytes, type: res.headers.get('content-type') };
  };
  const q = (extra: Record<string, string> = {}) =>
    new URLSearchParams({
      officeId: OFF,
      fullName: 'Lê Thu Hà (giả lập)',
      cardNo: 'TTH-0123',
      decisionNo: 'QĐ 123/QĐ-BTP',
      decisionDate: '2024-05-05',
      effectiveFrom: '2024-05-05',
      ...extra,
    }).toString();
  const save = (user: string, query: string, bytes?: Buffer) =>
    call(
      'POST',
      `/office/thv-cards/${U.thv}?${query}`,
      user,
      bytes,
      bytes ? 'application/pdf' : undefined,
    );
  const list = () => call('GET', `/office/thv-cards?officeId=${OFF}`, U.admin);

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
    appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 4 });
    server = await NestFactory.create(
      AppModule.register({
        pool: appPool,
        resolver: new SyntheticHeaderResolver(),
        fileStore: new LocalFileStore(storeDir),
      }),
      { logger: false },
    );
    await server.listen(0);
    base = (await server.getUrl()).replace('[::1]', 'localhost');
    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A')`, [T]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [OFF, T]);
    for (const [u, role] of [
      [U.admin, 'ADMIN'],
      [U.clerk, 'VAN_THU'],
      [U.thv, 'THV'],
    ] as const) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        u,
        T,
        u,
      ]);
      await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4)`,
        [T, u, OFF, role],
      );
    }
  });

  afterAll(async () => {
    await server?.close();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
    rmSync(storeDir, { recursive: true, force: true });
  });

  it('cấp thẻ: chỉ Admin; cần quyết định và bản scan; có hiệu lực ngay, không bước xác nhận', async () => {
    expect((await save(U.clerk, q(), PDF)).status).toBe(403);
    expect((await save(U.admin, q({ decisionNo: '' }), PDF)).json.code).toBe('DECISION_REQUIRED');
    expect((await save(U.admin, q())).json.code).toBe('SCAN_REQUIRED'); // cấp mới phải có bản scan
    expect((await save(U.admin, q(), Buffer.from('không phải PDF'))).status).toBe(422);
    const ok = await save(U.admin, q(), PDF);
    expect(ok.status).toBe(200);
    expect(ok.json.code).toBe('ALLOWED');
    const cards = (await list()).json as Json[];
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      userId: U.thv,
      cardNo: 'TTH-0123',
      status: 'ACTIVE',
      decisionNo: 'QĐ 123/QĐ-BTP',
      decisionDate: '2024-05-05',
      effectiveFrom: '2024-05-05',
      effectiveTo: null,
      hasScan: true,
    });
  });

  it('bản scan: Admin xem được, người khác không; sửa họ tên không đổi quyết định thì giữ bản scan cũ', async () => {
    const scan = await call('GET', `/office/thv-cards/${U.thv}/scan?officeId=${OFF}`, U.admin);
    expect(scan.status).toBe(200);
    expect(scan.type).toBe('application/pdf');
    expect(scan.bytes.equals(PDF)).toBe(true);
    expect(
      (await call('GET', `/office/thv-cards/${U.thv}/scan?officeId=${OFF}`, U.clerk)).status,
    ).toBe(404);
    const fix = await save(U.admin, q({ fullName: 'Lê Thu Hà' }));
    expect(fix.status).toBe(200);
    expect(((await list()).json as Json[])[0]).toMatchObject({
      fullName: 'Lê Thu Hà',
      hasScan: true,
    });
  });

  it('đổi số quyết định thì bắt buộc bản scan mới; bản scan cũ vẫn xem được trong lịch sử', async () => {
    expect((await save(U.admin, q({ decisionNo: 'QĐ 999/QĐ-BTP' }))).json.code).toBe(
      'SCAN_REQUIRED',
    );
    expect((await save(U.admin, q({ decisionNo: 'QĐ 999/QĐ-BTP' }), PDF2)).status).toBe(200);
    const hist = (await call('GET', `/office/thv-cards/${U.thv}/history?officeId=${OFF}`, U.admin))
      .json.rows as Json[];
    expect(hist.map((h) => h.event)).toEqual(['UPDATED', 'UPDATED', 'ISSUED']);
    const first = hist[hist.length - 1]!;
    const old = await call(
      'GET',
      `/office/thv-cards/${U.thv}/scan?officeId=${OFF}&historyId=${first.id}`,
      U.admin,
    );
    expect(old.bytes.equals(PDF)).toBe(true);
    const now = await call('GET', `/office/thv-cards/${U.thv}/scan?officeId=${OFF}`, U.admin);
    expect(now.bytes.equals(PDF2)).toBe(true);
    expect(
      (await call('GET', `/office/thv-cards/${U.thv}/history?officeId=${OFF}`, U.clerk)).json.rows,
    ).toEqual([]);
  });

  it('ngừng hiệu lực giữ thẻ và lịch sử; lưu lại thì có hiệu lực trở lại; không có đường xoá', async () => {
    expect(
      (await call('POST', `/office/thv-cards/${U.thv}/suspend`, U.clerk, { officeId: OFF })).status,
    ).toBe(403);
    expect(
      (await call('POST', `/office/thv-cards/${U.thv}/suspend`, U.admin, { officeId: OFF })).json
        .code,
    ).toBe('THV_CARD_SUSPENDED');
    expect(
      (await call('POST', `/office/thv-cards/${U.thv}/suspend`, U.admin, { officeId: OFF })).status,
    ).toBe(409);
    const c = ((await list()).json as Json[])[0]!;
    expect(c.status).toBe('SUSPENDED');
    expect(c.effectiveTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(c.hasScan).toBe(true);
    const back = await save(U.admin, q({ decisionNo: 'QĐ 999/QĐ-BTP' }));
    expect(back.json.code).toBe('THV_CARD_RENEWED');
    expect(((await list()).json as Json[])[0]).toMatchObject({
      status: 'ACTIVE',
      effectiveTo: null,
    });
    await expect(owner.query(`DELETE FROM of_thv_cards`)).rejects.toThrow(/cannot be deleted/);
    await expect(owner.query(`UPDATE of_thv_card_history SET full_name = 'x'`)).rejects.toThrow();
    // đường cũ (họ tên + số thẻ) không còn xoá được
    const blank = await call('PUT', '/office/thv-cards', U.admin, {
      officeId: OFF,
      userId: U.thv,
      fullName: '',
      cardNo: '',
    });
    expect(blank.status).toBe(422);
    expect((await list()).json as Json[]).toHaveLength(1);
  });
});
