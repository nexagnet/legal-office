import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS Phase 2 (0075): STT của sổ S-01/02/04/05 cấp lúc ghi sổ, theo sổ/văn phòng/năm. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsb_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS sổ nghiệp vụ và STT (PostgreSQL)', () => {
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
  const mkDoc = async (u: string, caseId: string, attrs: object | null = null) =>
    (
      await op(T, 'dms_document_add', [
        T,
        u,
        caseId,
        'Quyết định THA',
        'Giấy tờ',
        false,
        attrs ? JSON.stringify(attrs) : null,
      ])
    ).label!;
  const record = (u: string, caseId: string) => op(T, 'dms_case_record', [T, u, caseId]);
  const rows = (u: string, book: string, office = OFF, tenant = T) =>
    call(tenant, 'SELECT * FROM dms_book_rows($1,$2,$3,$4,$5,500,0)', [
      tenant,
      u,
      office,
      book,
      YEAR,
    ]);

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
    const own = ['vibang', 'tongdat', 'xacminh', 'tochuc'].flatMap((d) =>
      ['read', 'draft', 'confirm', 'add_document', 'download'].map((a) => `${d}.${a}.own`),
    );
    const all = ['vibang', 'tongdat', 'xacminh', 'tochuc'].map((d) => `${d}.read.all`);
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

  it('STT cấp lúc ghi sổ, tăng dần, mỗi sổ đếm riêng; nháp chưa có STT', async () => {
    const c1 = await mkCase(U.a, 'vibang', OFF, { nguoi_yeu_cau: 'Người A' });
    const c2 = await mkCase(U.a, 'vibang');
    const x1 = await mkCase(U.a, 'xacminh');
    expect(await rows(U.a, 'S-02')).toEqual([]);
    expect((await record(U.a, c1)).ok).toBe(true);
    expect((await record(U.a, c2)).ok).toBe(true);
    expect((await record(U.a, x1)).ok).toBe(true);
    const s02 = await rows(U.a, 'S-02');
    expect(s02.map((r) => r.stt)).toEqual([1, 2]);
    expect(s02[0].case_attributes).toMatchObject({ nguoi_yeu_cau: 'Người A' });
    expect((await rows(U.a, 'S-04')).map((r) => r.stt)).toEqual([1]);
  });

  it('đếm theo văn phòng: văn phòng khác bắt đầu lại từ 1', async () => {
    const c = await mkCase(U.a, 'vibang', OFF_B);
    expect((await record(U.a, c)).ok).toBe(true);
    expect((await rows(U.a, 'S-02', OFF_B)).map((r) => r.stt)).toEqual([1]);
    expect((await rows(U.a, 'S-02', OFF)).map((r) => r.stt)).toEqual([1, 2]);
  });

  it('nháp đã hủy và ghi sổ lỗi không để lại STT; số đã cấp không dùng lại', async () => {
    const dead = await mkCase(U.a, 'vibang');
    expect((await op(T, 'dms_case_cancel_draft', [T, U.a, dead, 'nhầm'])).ok).toBe(true);
    expect((await record(U.a, dead)).ok).toBe(false);
    const next = await mkCase(U.a, 'vibang');
    expect((await record(U.a, next)).ok).toBe(true);
    expect((await rows(U.a, 'S-02')).map((r) => r.stt)).toEqual([1, 2, 3]);
    // Ghi sổ lần hai bị từ chối và không cấp thêm số.
    expect((await record(U.a, next)).code).toBe('CASE_NOT_DRAFT');
    expect((await rows(U.a, 'S-02')).map((r) => r.stt)).toEqual([1, 2, 3]);
  });

  it('tống đạt (S-01): một dòng cho mỗi giấy tờ; giấy tờ thêm sau khi ghi sổ vào sổ ngay', async () => {
    const c = await mkCase(U.a, 'tongdat');
    await mkDoc(U.a, c, { so_ngay_van_ban: '12/QĐ, 01/10/2026', co_quan_thads: 'x' });
    await mkDoc(U.a, c, { so_ngay_van_ban: '45/GTT, 02/10/2026' });
    expect((await record(U.a, c)).ok).toBe(true);
    const r = await rows(U.a, 'S-01');
    expect(r.map((x) => x.stt)).toEqual([1, 2]);
    expect(r[0].doc_attributes).toMatchObject({ so_ngay_van_ban: '12/QĐ, 01/10/2026' });
    expect(r[0].doc_kind).toBe('Quyết định THA');
    await mkDoc(U.a, c, { so_ngay_van_ban: '08/2026/DS-ST' });
    expect((await rows(U.a, 'S-01')).map((x) => x.stt)).toEqual([1, 2, 3]);
    // Hồ sơ vi bằng thêm tài liệu thì KHÔNG sinh dòng S-01.
    const v = await mkCase(U.a, 'vibang');
    await mkDoc(U.a, v);
    expect((await rows(U.a, 'S-01')).length).toBe(3);
  });

  it('thuộc tính tài liệu sửa được khi nháp, bất biến sau khi ghi sổ', async () => {
    const c = await mkCase(U.a, 'tongdat');
    const d = await mkDoc(U.a, c, { ghi_chu: 'cũ' });
    expect(
      (
        await op(T, 'dms_document_update_draft', [
          T,
          U.a,
          d,
          'Loại',
          'Tên',
          false,
          JSON.stringify({ ghi_chu: 'mới' }),
        ])
      ).ok,
    ).toBe(true);
    await record(U.a, c);
    expect(
      (await rows(U.a, 'S-01')).find((x) => x.document_id === d)?.doc_attributes,
    ).toMatchObject({ ghi_chu: 'mới' });
    expect(
      (
        await op(T, 'dms_document_update_draft', [
          T,
          U.a,
          d,
          'Loại',
          'Tên',
          false,
          JSON.stringify({ ghi_chu: 'hack' }),
        ])
      ).code,
    ).toBe('DOCUMENT_NOT_DRAFT');
    await expect(
      owner.query(`UPDATE dms_documents SET attributes = '{}' WHERE id = $1`, [d]),
    ).rejects.toThrow(/immutable/);
  });

  it('chỉ thấy dòng sổ của hồ sơ mình được quyền đọc; tenant khác cô lập; sổ lạ bị từ chối', async () => {
    // U.b có read.all nên thấy cả hồ sơ do U.a tạo; một người không có quyền nào thì không thấy gì.
    expect((await rows(U.b, 'S-02', OFF)).length).toBe((await rows(U.a, 'S-02', OFF)).length);
    expect(await rows(U.foreign, 'S-02', OFF)).toEqual([]);
    expect(await rows(U.foreign, 'S-02', OFF2, T2)).toEqual([]);
    expect(await call(T2, 'SELECT * FROM dms_book_entries', [])).toEqual([]);
    expect(await rows(U.a, 'S-03')).toEqual([]);
    const audit = await owner.query(
      `SELECT 1 FROM audit_log WHERE action = 'dms.book.export' AND outcome = 'deny' AND reason = 'INVALID_INPUT'`,
    );
    expect(audit.rowCount).toBeGreaterThan(0);
  });

  it('dòng sổ và bộ đếm chỉ ghi thêm: không sửa, không xoá, không cắt bảng', async () => {
    await expect(owner.query(`UPDATE dms_book_entries SET stt = 99`)).rejects.toThrow(
      /append-only/,
    );
    await expect(owner.query(`DELETE FROM dms_book_entries`)).rejects.toThrow(/append-only/);
    await expect(owner.query(`TRUNCATE dms_book_entries`)).rejects.toThrow(/append-only/);
    await expect(owner.query(`DELETE FROM dms_book_counters`)).rejects.toThrow(/append-only/);
    await expect(owner.query(`TRUNCATE dms_book_counters`)).rejects.toThrow(/append-only/);
  });

  it('ghi sổ đồng thời không trùng và không hụt STT', async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, () => mkCase(U.a, 'tochuc')));
    const res = await Promise.all(ids.map((c) => record(U.a, c)));
    expect(res.every((r) => r.ok)).toBe(true);
    const stt = (await rows(U.a, 'S-05')).map((r) => r.stt);
    expect(stt).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
