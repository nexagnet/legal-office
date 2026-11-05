import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Admin nhập số cuối sổ giấy cho 4 sổ DMS và bộ đếm số hồ sơ Tống đạt (0117). PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsni_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS nhập số cuối sổ giấy (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF_B = id();
  const OFF2 = id();
  const U = { admin: id(), thv: id(), foreign: id() };
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
  const importLast = (actor: string, office: string, kind: string, year: number, last: number) =>
    op(T, 'dms_import_last_number', [T, actor, office, kind, year, last]);
  const status = (actor: string, office: string, year = YEAR) =>
    call(T, 'SELECT * FROM dms_number_status($1,$2,$3,$4)', [T, actor, office, year]);
  const mkCase = async (domain: string, office = OFF) =>
    (await op(T, 'dms_case_create_draft', [T, U.thv, office, domain, `Hồ sơ ${domain}`, '{}']))
      .label!;
  const mkDoc = async (caseId: string) =>
    (await op(T, 'dms_document_add', [T, U.thv, caseId, 'Quyết định THA', 'Giấy tờ', false, null]))
      .label!;
  const record = (caseId: string) => op(T, 'dms_case_record', [T, U.thv, caseId]);
  const numberOf = async (caseId: string) =>
    (await call(T, 'SELECT case_number FROM dms_case_files WHERE id = $1', [caseId]))[0]
      .case_number as string | null;
  const sttOf = async (caseId: string, book: string) =>
    (
      await call(
        T,
        'SELECT stt FROM dms_book_entries WHERE case_id = $1 AND book = $2 ORDER BY stt',
        [caseId, book],
      )
    ).map((r) => r.stt as number);
  const lastOf = async (kind: string, office = OFF) =>
    (await status(U.admin, office)).find((r) => r.kind === kind)!.last_value as number;

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
      [U.admin, T],
      [U.thv, T],
      [U.foreign, T2],
    ]) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        tenant,
        uid,
      ]);
    }
    for (const office of [OFF, OFF_B]) {
      await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,'ADMIN')`,
        [T, U.admin, office],
      );
    }
    const domains = ['vibang', 'tongdat', 'xacminh', 'tochuc'];
    const own = domains.flatMap((d) =>
      ['read', 'draft', 'confirm', 'add_document', 'download'].map((a) => `${d}.${a}.own`),
    );
    for (const office of [OFF, OFF_B]) {
      const g = await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'THV tạo') RETURNING id`,
        [T, office],
      );
      for (const p of own)
        await owner.query(
          `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
          [T, g.rows[0].id, p],
        );
      await owner.query(
        `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
        [T, g.rows[0].id, U.thv],
      );
    }
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('chỉ Admin của văn phòng được nhập và xem; người khác bị từ chối và không đổi gì', async () => {
    expect((await importLast(U.thv, OFF, 'S-02', YEAR, 10)).code).toBe('ADMIN_ONLY');
    expect((await importLast(U.admin, OFF2, 'S-02', YEAR, 10)).ok).toBe(false);
    expect(await status(U.thv, OFF)).toEqual([]);
    expect((await status(U.admin, OFF)).length).toBe(5);
    expect(await lastOf('S-02')).toBe(0);
  });

  it('nhập N thì Vi bằng ghi sổ kế tiếp được STT và số hồ sơ N+1', async () => {
    expect((await importLast(U.admin, OFF, 'S-02', YEAR, 120)).ok).toBe(true);
    const c = await mkCase('vibang');
    expect((await record(c)).ok).toBe(true);
    expect(await sttOf(c, 'S-02')).toEqual([121]);
    expect(await numberOf(c)).toBe(`121/${YEAR}/VB-TPL`);
    expect(await lastOf('S-02')).toBe(121);
  });

  it('Xác minh THA và Tổ chức THA cũng tiếp nối đúng; mỗi sổ đếm riêng', async () => {
    expect((await importLast(U.admin, OFF, 'S-04', YEAR, 7)).ok).toBe(true);
    expect((await importLast(U.admin, OFF, 'S-05', YEAR, 99)).ok).toBe(true);
    const xm = await mkCase('xacminh');
    const tc = await mkCase('tochuc');
    expect((await record(xm)).ok).toBe(true);
    expect((await record(tc)).ok).toBe(true);
    expect(await numberOf(xm)).toBe(`008/${YEAR}/XM-TPL`);
    expect(await numberOf(tc)).toBe(`100/${YEAR}/TC-TPL`);
  });

  it('Tống đạt: STT sổ S-01 và số hồ sơ là hai bộ đếm riêng', async () => {
    expect((await importLast(U.admin, OFF, 'S-01', YEAR, 40)).ok).toBe(true);
    expect((await importLast(U.admin, OFF, 'CASE-TD', YEAR, 12)).ok).toBe(true);
    const c = await mkCase('tongdat');
    await mkDoc(c);
    await mkDoc(c);
    expect((await record(c)).ok).toBe(true);
    expect(await sttOf(c, 'S-01')).toEqual([41, 42]);
    expect(await numberOf(c)).toBe(`013/${YEAR}/TĐ-TPL`);
  });

  it('chỉ tiến, không lùi; nhập đúng số hiện tại thì được; mỗi lần nhập được ghi lại', async () => {
    const before = await lastOf('S-02');
    expect((await importLast(U.admin, OFF, 'S-02', YEAR, before - 1)).code).toBe(
      'WOULD_MOVE_BACKWARDS',
    );
    expect(await lastOf('S-02')).toBe(before);
    expect((await importLast(U.admin, OFF, 'S-02', YEAR, before)).ok).toBe(true);
    expect((await importLast(U.admin, OFF, 'S-02', YEAR, before + 30)).ok).toBe(true);
    expect(await lastOf('S-02')).toBe(before + 30);
    const log = await call(
      T,
      `SELECT previous_value, imported_value FROM dms_number_imports WHERE office_id = $1 AND kind = 'S-02' AND year = $2 ORDER BY id DESC LIMIT 1`,
      [OFF, YEAR],
    );
    expect(log[0]).toEqual({ previous_value: before, imported_value: before + 30 });
    const row = (await status(U.admin, OFF)).find((r) => r.kind === 'S-02')!;
    expect(row.imported_value).toBe(before + 30);
    expect(row.imported_at).not.toBeNull();
  });

  it('nhập 0 được ghi lại, không tạo bộ đếm và số đầu tiên vẫn là 001', async () => {
    expect((await importLast(U.admin, OFF_B, 'S-02', YEAR, 0)).ok).toBe(true);
    expect(await lastOf('S-02', OFF_B)).toBe(0);
    const c = await mkCase('vibang', OFF_B);
    expect((await record(c)).ok).toBe(true);
    expect(await numberOf(c)).toBe(`001/${YEAR}/VB-TPL`);
  });

  it('dữ liệu sai bị từ chối: sổ lạ, năm ngoài khoảng, số âm hoặc rỗng', async () => {
    for (const [kind, year, last] of [
      ['S-03', YEAR, 5],
      ['S-02', 1999, 5],
      ['S-02', 2101, 5],
      ['S-02', YEAR, -1],
    ] as const) {
      expect((await importLast(U.admin, OFF, kind, year, last)).code).toBe('INVALID_NUMBER');
    }
    const nulls = await op(T, 'dms_import_last_number', [T, U.admin, OFF, 'S-02', YEAR, null]);
    expect(nulls.code).toBe('INVALID_NUMBER');
  });

  it('mỗi văn phòng và mỗi năm đếm riêng; sang năm khác không ảnh hưởng năm nay', async () => {
    expect((await importLast(U.admin, OFF_B, 'S-04', YEAR - 1, 500)).ok).toBe(true);
    expect(await lastOf('S-04', OFF_B)).toBe(0);
    expect(
      (await status(U.admin, OFF_B, YEAR - 1)).find((r) => r.kind === 'S-04')!.last_value,
    ).toBe(500);
    const c = await mkCase('xacminh', OFF_B);
    expect((await record(c)).ok).toBe(true);
    expect(await numberOf(c)).toBe(`001/${YEAR}/XM-TPL`);
  });

  it('nhật ký nhập số không sửa, không xoá được', async () => {
    await expect(call(T, `UPDATE dms_number_imports SET imported_value = 1`, [])).rejects.toThrow();
    await expect(call(T, `DELETE FROM dms_number_imports`, [])).rejects.toThrow();
  });

  it('tenant khác không thấy nhật ký của tenant này', async () => {
    const rows = await call(T2, `SELECT count(*)::int AS n FROM dms_number_imports`, []);
    expect(rows[0].n).toBe(0);
  });
});
