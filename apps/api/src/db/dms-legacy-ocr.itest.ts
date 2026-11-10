import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OcrEngine } from '../ocr/engine';
import { toTsQuery } from '../ocr/text';
import { processTenant } from '../ocr/worker';
import type { FileStore } from '../storage/file-store';

// OCR + tìm toàn văn tài liệu cũ (0121): hàng đợi theo nội dung, cờ ocr của đợt, trạng thái, tìm, quyền, RLS, công tắc worker.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmslo_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('OCR tài liệu cũ (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF2 = id();
  const OFFB = id();
  const U = { imp: id(), rd: id(), none: id(), foreign: id() };

  const call = async (tenant: string, sql: string, args: unknown[]) => {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
      const res = await client.query(sql, args);
      await client.query('COMMIT');
      return res.rows;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  };
  const op = async (tenant: string, fn: string, args: unknown[]) => {
    const rows = await call(
      tenant,
      `SELECT (r).ok, (r).code, (r).label FROM (SELECT ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS r) q`,
      args,
    );
    return rows[0] as { ok: boolean; code: string; label: string | null };
  };
  const key = async (tenant: string, office: string, h: string) =>
    (await call(tenant, `SELECT dms_legacy_object_key($1,$2,$3) AS k`, [tenant, office, h]))[0]
      .k as string;
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
    app = new pg.Pool({ connectionString: appUrl.toString(), max: 4 });

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
    await owner.query(
      `INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A'),($3,$2,'VP A2'),($4,$5,'VP B')`,
      [OFF, T, OFFB, OFF2, T2],
    );
    for (const [uid, tenant] of [
      [U.imp, T],
      [U.rd, T],
      [U.none, T],
      [U.foreign, T2],
    ])
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        tenant,
        uid,
      ]);
    const group = async (
      tenant: string,
      office: string,
      name: string,
      perms: string[],
      users: string[],
    ) => {
      const g = await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,$3) RETURNING id`,
        [tenant, office, name],
      );
      for (const p of perms)
        await owner.query(
          `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
          [tenant, g.rows[0].id, p],
        );
      for (const u of users)
        await owner.query(
          `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
          [tenant, g.rows[0].id, u],
        );
    };
    await group(T, OFF, 'Nhập cũ', ['dms.legacy.import'], [U.imp]);
    await group(T, OFF, 'Xem cũ', ['dms.legacy.read'], [U.rd]);
    await group(T2, OFF2, 'Nhập cũ B', ['dms.legacy.import', 'dms.legacy.read'], [U.foreign]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const files = new Map<string, Buffer>();
  const store: FileStore = {
    put: async (k, b) => void files.set(k, b),
    get: async (k) => files.get(k) ?? null,
    delete: async () => undefined,
  };
  const engine: OcrEngine = {
    recognize: async (bytes) => {
      const text = bytes.toString('utf8');
      if (text === 'BOOM') throw new Error('ENGINE_CRASH');
      return { engine: 'fake', lang: 'vie', pages: 2, confidence: 90, text };
    },
  };
  const log = { info: () => undefined, error: () => undefined };
  const open = async (ocr: boolean, actor = U.imp) =>
    (await op(T, 'dms_legacy_batch_open', [T, actor, OFF, 'Tải từ giao diện', null, ocr])).label!;
  /** Đăng ký một tệp có nội dung cho trước (sha thật) và đặt nội dung vào kho giả. */
  const add = async (batch: string, path: string, content: string, mime = 'application/pdf') => {
    const h = createHash('sha256').update(content).digest('hex');
    const k = await key(T, OFF, h);
    files.set(k, Buffer.from(content));
    const r = await op(T, 'dms_legacy_register', [
      T,
      U.imp,
      batch,
      path,
      content.length,
      h,
      mime,
      null,
      k,
    ]);
    expect(r.ok).toBe(true);
    return { id: r.label!, h };
  };
  const status = async (ids: string[], actor = U.imp, office = OFF) =>
    call(T, 'SELECT * FROM dms_legacy_ocr_status($1,$2,$3,$4)', [T, actor, office, ids]);
  const search = (q: string, actor = U.rd) =>
    call(T, 'SELECT * FROM dms_legacy_search($1,$2,$3,$4,20,0)', [T, actor, OFF, toTsQuery(q)]);

  it('chỉ đợt ocr mới vào hàng đợi; tệp trùng nội dung chỉ OCR một lần; tìm được không dấu', async () => {
    const plain = await open(false);
    const a0 = await add(plain, 'cu/khong-ocr.pdf', 'Hợp đồng không OCR');
    const b = await open(true);
    const a = await add(b, '2019/hd-001.pdf', 'Hợp đồng thuê nhà số 123 Hà Nội');
    const dup = await add(b, '2019/sao-chep.pdf', 'Hợp đồng thuê nhà số 123 Hà Nội');
    const docx = await add(
      b,
      '2019/van-ban.docx',
      'word',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    expect((await status([a.id, a0.id])).map((r) => r.status).sort()).toEqual(['NONE', 'PENDING']);
    expect(await processTenant(app, T, store, engine, log, 20, true)).toBe(1);
    const st = Object.fromEntries(
      (await status([a.id, dup.id, docx.id, a0.id])).map((r) => [r.file_id, r]),
    );
    expect(st[a.id]).toMatchObject({ status: 'DONE', page_count: 2 });
    expect(st[dup.id].status).toBe('DONE');
    expect(st[docx.id]).toMatchObject({ status: 'SKIPPED', error: 'UNSUPPORTED_TYPE' });
    expect(st[a0.id].status).toBe('NONE');

    const hits = await search('thue nha ha noi');
    expect(hits.map((h) => h.rel_path).sort()).toEqual(['2019/hd-001.pdf', '2019/sao-chep.pdf']);
    expect(await search('khong ocr')).toHaveLength(0);
  });

  it('công tắc tắt: worker không nhận việc tài liệu cũ', async () => {
    const b = await open(true);
    const f = await add(b, 'x/off.pdf', 'Nội dung chờ');
    expect(await processTenant(app, T, store, engine, log, 20, false)).toBe(0);
    expect((await status([f.id]))[0].status).toBe('PENDING');
    expect(await processTenant(app, T, store, engine, log, 20, true)).toBe(1);
  });

  it('lỗi engine thử lại tối đa 3 lần rồi FAILED, không dừng việc khác', async () => {
    const b = await open(true);
    const bad = await add(b, 'x/hong.pdf', 'BOOM');
    const ok = await add(b, 'x/tot.pdf', 'Giấy chứng nhận quyền sử dụng đất');
    await processTenant(app, T, store, engine, log, 20, true);
    await processTenant(app, T, store, engine, log, 20, true);
    await processTenant(app, T, store, engine, log, 20, true);
    const st = Object.fromEntries((await status([bad.id, ok.id])).map((r) => [r.file_id, r]));
    expect(st[bad.id]).toMatchObject({ status: 'FAILED', error: 'ENGINE_CRASH' });
    expect(st[ok.id].status).toBe('DONE');
  });

  it('quyền: tìm cần dms.legacy.read; trạng thái cần import hoặc read; tenant khác không thấy', async () => {
    expect(await search('thue nha', U.imp)).toHaveLength(0);
    expect(await search('thue nha', U.none)).toHaveLength(0);
    expect(await search('thue nha', U.rd)).not.toHaveLength(0);
    const any = (await call(T, 'SELECT id FROM dms_legacy_files LIMIT 1', []))[0].id as string;
    expect(await status([any], U.none)).toHaveLength(0);
    expect(await status([any], U.rd)).toHaveLength(1);
    await expect(
      call(T2, 'SELECT * FROM dms_legacy_search($1,$2,$3,$4,20,0)', [T, U.rd, OFF, 'thue']),
    ).rejects.toThrow(/tenant mismatch/);
    const other = await call(T2, 'SELECT count(*)::int AS n FROM dms_legacy_ocr', []);
    expect(other[0].n).toBe(0);
  });
});
