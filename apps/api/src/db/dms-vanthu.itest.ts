import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS Phase 3 (0078): Văn thư — Số đến (sổ đến) và STT (sổ đi, nội bộ) cấp lúc ghi sổ, theo sổ/văn phòng/năm. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsv_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS Văn thư: số đến/STT (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF_B = id();
  const OFF2 = id();
  const U = { a: id(), b: id(), foreign: id() };
  const YEAR = new Date().getFullYear();

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
  const mkCase = async (u: string, domain: string, office = OFF, attrs: object = {}) =>
    (
      await op(T, 'dms_case_create_draft', [
        T,
        u,
        office,
        domain,
        `Hồ sơ ${domain}`,
        JSON.stringify(attrs),
      ])
    ).label!;
  const record = (u: string, caseId: string) => op(T, 'dms_case_record', [T, u, caseId]);
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
      [OFF, T, OFF_B, OFF2, T2],
    );
    for (const [uid, tenant] of [
      [U.a, T],
      [U.b, T],
      [U.foreign, T2],
    ]) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        tenant,
        uid,
      ]);
    }
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
    const own = ['vtden', 'vtdi', 'vtnb'].flatMap((d) =>
      ['read', 'draft', 'confirm', 'add_document', 'download'].map((a) => `${d}.${a}.own`),
    );
    const all = ['vtden', 'vtdi', 'vtnb'].map((d) => `${d}.read.all`);
    await group(T, OFF, 'THV tạo', own, [U.a, U.b]);
    await group(T, OFF_B, 'THV tạo VP2', own, [U.a]);
    await group(T2, OFF2, 'THV B', own, [U.foreign]);
    // U.b còn đọc được toàn bộ hồ sơ đã ghi sổ ở văn phòng OFF.
    await group(T, OFF, 'Đọc sổ', all, [U.b]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const vrows = (u: string, book: string, office = OFF) =>
    call(T, 'SELECT * FROM dms_book_rows($1,$2,$3,$4,$5,500,0)', [T, u, office, book, YEAR]);
  const sttOf = async (caseId: string, book: string) =>
    (
      await owner.query(`SELECT stt FROM dms_book_entries WHERE case_id=$1 AND book=$2`, [
        caseId,
        book,
      ])
    ).rows.map((r) => r.stt as number);

  it('mỗi sổ văn thư đánh số riêng, tăng dần, chỉ khi ghi sổ; nháp không có số', async () => {
    const d1 = await mkCase(U.a, 'vtden', OFF, { so_ky_hieu: '12/QĐ-A' });
    const d2 = await mkCase(U.a, 'vtden');
    const o1 = await mkCase(U.a, 'vtdi');
    expect(await sttOf(d1, 'VT-DEN')).toEqual([]);
    expect((await record(U.a, d1)).ok).toBe(true);
    expect((await record(U.a, o1)).ok).toBe(true);
    expect((await record(U.a, d2)).ok).toBe(true);
    expect(await sttOf(d1, 'VT-DEN')).toEqual([1]);
    expect(await sttOf(d2, 'VT-DEN')).toEqual([2]);
    expect(await sttOf(o1, 'VT-DI')).toEqual([1]);
    const rows = await vrows(U.a, 'VT-DEN');
    expect(rows.map((r) => r.stt)).toEqual([1, 2]);
  });

  it('nháp đã hủy không có số, không khôi phục; hồ sơ đã ghi sổ bất biến', async () => {
    const c = await mkCase(U.a, 'vtnb');
    expect((await op(T, 'dms_case_cancel_draft', [T, U.a, c, 'nhập nhầm'])).ok).toBe(true);
    expect(await sttOf(c, 'VT-NB')).toEqual([]);
    expect((await record(U.a, c)).code).toBe('CASE_NOT_DRAFT');
    const d = await mkCase(U.a, 'vtnb');
    await record(U.a, d);
    const upd = await op(T, 'dms_case_update_draft', [T, U.a, d, 'đổi', '{}']);
    expect(upd.ok).toBe(false);
  });

  it('phân quyền theo miền văn thư: không có quyền vtdi thì không tạo được', async () => {
    const r = await op(T, 'dms_case_create_draft', [T, U.foreign, OFF, 'vtdi', 'x', '{}']);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('PERMISSION_DENIED');
  });

  it('quyền văn thư được nhận trong Nhóm quyền; tên miền lạ vẫn bị từ chối', async () => {
    const bad = await op(T, 'dms_case_create_draft', [T, U.a, OFF, 'vtxx', 'x', '{}']);
    expect(bad.ok).toBe(false);
  });
});
