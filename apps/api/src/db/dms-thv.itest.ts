import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS lát 5c (0077): THV được ghi tên phải tự xác nhận trước khi hồ sơ ghi sổ. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmst_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS THV tự xác nhận (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF2 = id();
  const U = { creator: id(), thv: id(), other: id(), foreign: id() };

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
  const op = async (fn: string, args: unknown[], tenant = T) => {
    const rows = await call(
      tenant,
      `SELECT (r).ok, (r).code, (r).label FROM (SELECT ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS r) q`,
      args,
    );
    return rows[0] as { ok: boolean; code: string; label: string | null };
  };
  const mkCase = async () =>
    (
      await op('dms_case_create_draft', [
        T,
        U.creator,
        OFF,
        'vibang',
        'Vi bằng thử',
        JSON.stringify({ nguoi_yeu_cau: 'A' }),
      ])
    ).label!;

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
      [U.creator, T],
      [U.thv, T],
      [U.other, T],
      [U.foreign, T2],
    ])
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        tenant,
        uid,
      ]);
    const g = await owner.query(
      `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'Nhập liệu') RETURNING id`,
      [T, OFF],
    );
    for (const p of ['read', 'draft', 'confirm', 'add_document'].map((a) => `vibang.${a}.own`))
      await owner.query(
        `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
        [T, g.rows[0].id, p],
      );
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, g.rows[0].id, U.creator],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('hồ sơ không ghi tên THV thì ghi sổ như thường', async () => {
    const c = await mkCase();
    expect((await op('dms_case_record', [T, U.creator, c])).ok).toBe(true);
  });

  it('có ghi tên THV: chưa xác nhận thì không ghi sổ được; THV xác nhận rồi mới ghi sổ', async () => {
    const c = await mkCase();
    expect((await op('dms_case_set_thv', [T, U.creator, c, U.thv])).ok).toBe(true);
    expect(await op('dms_case_record', [T, U.creator, c])).toMatchObject({
      ok: false,
      code: 'THV_CONFIRMATION_REQUIRED',
    });
    // Người nhập liệu không tự xác nhận hộ; người khác cũng không.
    expect(await op('dms_thv_confirm', [T, U.creator, c])).toMatchObject({
      ok: false,
      code: 'CASE_NOT_FOUND',
    });
    expect(await op('dms_thv_confirm', [T, U.other, c])).toMatchObject({
      ok: false,
      code: 'CASE_NOT_FOUND',
    });
    expect((await op('dms_thv_confirm', [T, U.thv, c])).ok).toBe(true);
    const rec = await op('dms_case_record', [T, U.creator, c]);
    expect(rec).toMatchObject({ ok: true, code: 'CASE_RECORDED' });
  });

  it('sửa nội dung sau khi THV xác nhận thì xác nhận hết hiệu lực', async () => {
    const c = await mkCase();
    await op('dms_case_set_thv', [T, U.creator, c, U.thv]);
    await op('dms_thv_confirm', [T, U.thv, c]);
    expect(
      (
        await op('dms_case_update_draft', [
          T,
          U.creator,
          c,
          'Vi bằng thử',
          JSON.stringify({ nguoi_yeu_cau: 'B' }),
        ])
      ).ok,
    ).toBe(true);
    expect(await op('dms_case_record', [T, U.creator, c])).toMatchObject({
      ok: false,
      code: 'THV_CONFIRMATION_STALE',
    });
    const pending = await call(T, 'SELECT * FROM dms_list_thv_pending($1,$2)', [T, U.thv]);
    expect(pending.find((r) => r.case_id === c)).toMatchObject({ stale: true });
    expect((await op('dms_thv_confirm', [T, U.thv, c])).ok).toBe(true);
    expect((await op('dms_case_record', [T, U.creator, c])).ok).toBe(true);
    // Thêm tài liệu cũng đổi dấu vân.
    const c2 = await mkCase();
    await op('dms_case_set_thv', [T, U.creator, c2, U.thv]);
    await op('dms_thv_confirm', [T, U.thv, c2]);
    await op('dms_document_add', [T, U.creator, c2, 'N-04', 'Tài liệu', true]);
    expect((await op('dms_case_record', [T, U.creator, c2])).code).toBe('THV_CONFIRMATION_STALE');
  });

  it('đổi sang THV khác thì xác nhận của THV cũ không có giá trị', async () => {
    const c = await mkCase();
    await op('dms_case_set_thv', [T, U.creator, c, U.thv]);
    await op('dms_thv_confirm', [T, U.thv, c]);
    await op('dms_case_set_thv', [T, U.creator, c, U.other]);
    expect((await op('dms_case_record', [T, U.creator, c])).code).toBe('THV_CONFIRMATION_REQUIRED');
    // Bỏ tên THV thì ghi sổ như hồ sơ thường.
    await op('dms_case_set_thv', [T, U.creator, c, null]);
    expect((await op('dms_case_record', [T, U.creator, c])).ok).toBe(true);
  });

  it('THV chỉ thấy nội dung bản nháp được ghi tên mình; không thấy hồ sơ khác, không thấy sau khi ghi sổ', async () => {
    const c = await mkCase();
    const other = await mkCase();
    await op('dms_case_set_thv', [T, U.creator, c, U.thv]);
    const pending = await call(T, 'SELECT * FROM dms_list_thv_pending($1,$2)', [T, U.thv]);
    expect(pending.map((r) => r.case_id)).toContain(c);
    expect(pending.map((r) => r.case_id)).not.toContain(other);
    const rev = await call(T, 'SELECT * FROM dms_thv_review_case($1,$2,$3)', [T, U.thv, c]);
    expect(rev[0]).toMatchObject({ title: 'Vi bằng thử', confirmed: false });
    expect(await call(T, 'SELECT * FROM dms_thv_review_case($1,$2,$3)', [T, U.thv, other])).toEqual(
      [],
    );
    expect(await call(T, 'SELECT * FROM dms_thv_review_case($1,$2,$3)', [T, U.other, c])).toEqual(
      [],
    );
    await op('dms_thv_confirm', [T, U.thv, c]);
    await op('dms_case_record', [T, U.creator, c]);
    expect(await call(T, 'SELECT * FROM dms_thv_review_case($1,$2,$3)', [T, U.thv, c])).toEqual([]);
    expect((await op('dms_thv_confirm', [T, U.thv, c])).ok).toBe(false);
  });

  it('chỉ người có quyền sửa nháp mới ghi tên THV; THV phải tồn tại cùng tenant; hồ sơ đã ghi sổ không ghi tên được', async () => {
    const c = await mkCase();
    expect(await op('dms_case_set_thv', [T, U.other, c, U.thv])).toMatchObject({
      ok: false,
      code: 'CASE_NOT_FOUND',
    });
    expect(await op('dms_case_set_thv', [T, U.creator, c, U.foreign])).toMatchObject({
      ok: false,
      code: 'USER_NOT_FOUND',
    });
    expect(await op('dms_case_set_thv', [T, U.creator, c, id()])).toMatchObject({
      ok: false,
      code: 'USER_NOT_FOUND',
    });
    await op('dms_case_record', [T, U.creator, c]);
    expect(await op('dms_case_set_thv', [T, U.creator, c, U.thv])).toMatchObject({
      ok: false,
      code: 'CASE_NOT_DRAFT',
    });
  });

  it('xác nhận chỉ ghi thêm; tenant khác cô lập', async () => {
    await expect(
      owner.query(`UPDATE dms_thv_confirmations SET content_hash = 'x'`),
    ).rejects.toThrow(/append-only/);
    await expect(owner.query(`DELETE FROM dms_thv_confirmations`)).rejects.toThrow(/append-only/);
    expect(await call(T2, 'SELECT * FROM dms_thv_confirmations', [])).toEqual([]);
    expect(await call(T2, 'SELECT * FROM dms_list_thv_pending($1,$2)', [T2, U.foreign])).toEqual(
      [],
    );
  });
});
