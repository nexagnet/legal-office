import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OcrEngine } from '../ocr/engine';
import { toTsQuery } from '../ocr/text';
import { processTenant } from '../ocr/worker';
import type { FileStore } from '../storage/file-store';

// OCR để tìm kiếm (0084): hàng đợi, RLS, quyền xem, phiên bản mới nhất. PostgreSQL thật, dữ liệu giả lập, engine giả.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmso_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('OCR tìm kiếm toàn văn (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF2 = id();
  const U = { a: id(), b: id(), foreign: id() };
  const logs: string[] = [];
  const log = { info: (m: string) => logs.push(m), error: (m: string) => logs.push(m) };
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
      return { engine: 'fake', lang: 'vie', pages: 1, confidence: 90, text };
    },
  };

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
  const search = (u: string, q: string, office = OFF, tenant = T) =>
    call(tenant, 'SELECT * FROM dms_ocr_search($1,$2,$3,NULL,$4,20)', [
      tenant,
      u,
      office,
      toTsQuery(q),
    ]);

  /** Tạo hồ sơ đã ghi sổ có một tài liệu và một tệp với nội dung cho trước. */
  const record = async (u: string, content: string, mime = 'image/png') => {
    const c = (await op(T, 'dms_case_create_draft', [T, u, OFF, 'vtden', 'Công văn đến', '{}']))
      .label!;
    const d = (await op(T, 'dms_document_add', [T, u, c, 'Công văn', 'Giấy tờ', false, null]))
      .label!;
    const key = `t/${id()}`;
    files.set(key, Buffer.from(content));
    const f = (
      await op(T, 'dms_file_attach', [
        T,
        u,
        d,
        'scan',
        true,
        key,
        'a'.repeat(64),
        mime,
        content.length,
      ])
    ).label!;
    expect((await op(T, 'dms_case_record', [T, u, c])).ok).toBe(true);
    return { c, d, f, key };
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
    app = new pg.Pool({ connectionString: appUrl.toString(), max: 4 });

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
    await owner.query(
      `INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A'),($3,$4,'VP B')`,
      [OFF, T, OFF2, T2],
    );
    for (const [uid, tenant] of [
      [U.a, T],
      [U.b, T],
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
    const own = ['read', 'draft', 'confirm', 'add_document', 'download'].map(
      (a) => `vtden.${a}.own`,
    );
    await group(T, OFF, 'Văn thư', own, [U.a]);
    await group(T2, OFF2, 'Văn thư B', own, [U.foreign]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('worker OCR tệp mới, tìm được không dấu; người không có quyền xem không thấy gì', async () => {
    const r = await record(U.a, 'Biên bản TỐNG ĐẠT cho ông Nguyễn Văn An tại phố Huế');
    expect(await processTenant(app, T, store, engine, log)).toBe(1);
    const hit = await search(U.a, 'tong dat nguyen');
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ case_id: r.c, file_id: r.f, version: 1 });
    expect(await search(U.a, 'Nguyễn Văn')).toHaveLength(1);
    expect(await search(U.a, 'khong co tu nay')).toHaveLength(0);
    expect(await search(U.b, 'tong dat')).toHaveLength(0);
  });

  it('cách ly tenant: tenant khác không thấy văn bản và worker không đụng việc của tenant khác', async () => {
    expect(await search(U.foreign, 'tong dat', OFF2, T2)).toHaveLength(0);
    expect(await call(T2, 'SELECT * FROM dms_ocr_results', [])).toHaveLength(0);
    expect(
      await call('00000000-0000-0000-0000-000000000000', 'SELECT * FROM dms_ocr_results', []),
    ).toHaveLength(0);
  });

  it('lỗi engine: thử lại tối đa 3 lần rồi FAILED, mã lỗi ngắn không chứa nội dung', async () => {
    await record(U.a, 'BOOM');
    for (let i = 0; i < 4; i += 1) await processTenant(app, T, store, engine, log);
    const rows = await call(
      T,
      `SELECT status, attempts, error FROM dms_ocr_results WHERE status = 'FAILED'`,
      [],
    );
    expect(rows).toEqual([{ status: 'FAILED', attempts: 3, error: 'ENGINE_CRASH' }]);
    expect(logs.join('\n')).not.toContain('BOOM');
  });

  it('định dạng không hỗ trợ bị SKIPPED, không bao giờ vào kết quả tìm', async () => {
    await record(U.a, 'bang tinh doc rieng', 'application/vnd.ms-excel');
    await processTenant(app, T, store, engine, log);
    expect(
      await call(T, `SELECT 1 FROM dms_ocr_results WHERE status = 'SKIPPED'`, []),
    ).toHaveLength(1);
    expect(await search(U.a, 'bang tinh')).toHaveLength(0);
  });

  it('chỉ tìm trên phiên bản mới nhất của tệp', async () => {
    const r = await record(U.a, 'noi dung cu abc');
    await processTenant(app, T, store, engine, log);
    expect(await search(U.a, 'abc')).toHaveLength(1);
    // Mô phỏng phiên bản 2 (thật ra tạo qua yêu cầu sửa đổi đã duyệt): bỏ qua FK amendment bằng vai replica của tài khoản chủ.
    const c = await owner.connect();
    try {
      await c.query('SET session_replication_role = replica');
      await c.query(
        `INSERT INTO dms_document_versions (tenant_id, file_id, version, object_key, sha256, mime, size_bytes, created_by, amendment_id)
         SELECT tenant_id, file_id, 2, 'v2/' || file_id, sha256, mime, size_bytes, created_by, gen_random_uuid()
         FROM dms_document_versions WHERE file_id = $1 AND version = 1`,
        [r.f],
      );
    } finally {
      c.release();
    }
    files.set(`v2/${r.f}`, Buffer.from('noi dung moi xyz'));
    expect(await search(U.a, 'abc')).toHaveLength(0); // bản 2 chưa OCR: bản cũ không còn là bản mới nhất
    await processTenant(app, T, store, engine, log);
    expect(await search(U.a, 'abc')).toHaveLength(0);
    expect(await search(U.a, 'xyz')).toHaveLength(1);
  });

  it('ocr_text không thể bị ghi lại sau khi DONE', async () => {
    const rows = await call(T, `SELECT id FROM dms_ocr_results WHERE status = 'DONE' LIMIT 1`, []);
    const res = await call(T, `SELECT dms_ocr_complete($1,$2,'x','vie',1,1,'đè','de') AS ok`, [
      T,
      rows[0].id,
    ]);
    expect(res[0].ok).toBe(false);
  });
});
