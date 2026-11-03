import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS GĐ 1 (0103): số hồ sơ tự cấp (030/2026/VB-TPL) và ô tích "Đã trả kết quả". PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsn_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS số hồ sơ và cờ đã trả kết quả (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF_B = id();
  const OFF2 = id();
  const U = { a: id(), reader: id(), foreign: id() };
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
  const mkCase = async (u: string, domain: string, office = OFF) =>
    (await op(T, 'dms_case_create_draft', [T, u, office, domain, `Hồ sơ ${domain}`, '{}'])).label!;
  const mkDoc = async (u: string, caseId: string) =>
    (await op(T, 'dms_document_add', [T, u, caseId, 'Quyết định THA', 'Giấy tờ', false, null]))
      .label!;
  const record = (u: string, caseId: string) => op(T, 'dms_case_record', [T, u, caseId]);
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
  const firstStt = async (caseId: string, book: string) => (await sttOf(caseId, book))[0] as number;
  const pad = (n: number) => String(n).padStart(3, '0');
  const flags = (u: string, cases: string[]) =>
    call(T, 'SELECT * FROM dms_case_returned_flags($1,$2,$3)', [T, u, cases]);
  const setReturned = (u: string, caseId: string, v: boolean | null) =>
    op(T, 'dms_case_set_returned', [T, u, caseId, v]);
  const auditCount = async (caseId: string) =>
    Number(
      (
        await call(
          T,
          `SELECT count(*) AS n FROM dms_audit_records WHERE target_id = $1 AND action = 'dms.case.set_returned'`,
          [caseId],
        )
      )[0].n,
    );

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
      [U.reader, T],
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
    const domains = ['vibang', 'tongdat', 'xacminh', 'tochuc'];
    const own = domains.flatMap((d) =>
      ['read', 'draft', 'confirm', 'add_document', 'download'].map((a) => `${d}.${a}.own`),
    );
    await group(T, OFF, 'THV tạo', own, [U.a]);
    await group(T, OFF_B, 'THV tạo VP2', own, [U.a]);
    await group(T2, OFF2, 'THV B', own, [U.foreign]);
    // Người chỉ đọc: thấy hồ sơ đã ghi sổ nhưng không có quyền thêm tài liệu.
    await group(
      T,
      OFF,
      'Chỉ đọc',
      domains.map((d) => `${d}.read.all`),
      [U.reader],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('định dạng số: tối thiểu 3 chữ số, đuôi theo nghiệp vụ, dài ra khi quá 999', async () => {
    const fmt = async (n: number | null, y: number, d: string) =>
      (await call(T, 'SELECT dms_case_number_format($1,$2,$3) AS f', [n, y, d]))[0].f as
        string | null;
    expect(await fmt(30, 2026, 'vibang')).toBe('030/2026/VB-TPL');
    expect(await fmt(1, 2027, 'vibang')).toBe('001/2027/VB-TPL');
    expect(await fmt(3, 2026, 'tongdat')).toBe('003/2026/TĐ-TPL');
    expect(await fmt(7, 2026, 'xacminh')).toBe('007/2026/XM-TPL');
    expect(await fmt(12, 2026, 'tochuc')).toBe('012/2026/TC-TPL');
    expect(await fmt(1234, 2026, 'vibang')).toBe('1234/2026/VB-TPL');
    expect(await fmt(0, 2026, 'vibang')).toBeNull();
    expect(await fmt(null, 2026, 'vibang')).toBeNull();
  });

  it('năm theo giờ Việt Nam: 0h ngày 01/01 giờ VN đã là năm mới', async () => {
    const yr = async (ts: string) =>
      (await call(T, 'SELECT dms_vn_year($1::timestamptz) AS y', [ts]))[0].y as number;
    expect(await yr('2026-12-31T16:59:59Z')).toBe(2026);
    expect(await yr('2026-12-31T17:00:00Z')).toBe(2027);
    expect(await yr('2027-01-01T00:00:00+07:00')).toBe(2027);
  });

  it('nháp và nháp đã hủy không có số; ghi sổ cấp số trùng STT của sổ', async () => {
    const draft = await mkCase(U.a, 'vibang');
    expect(await numberOf(draft)).toBeNull();
    const dead = await mkCase(U.a, 'vibang');
    expect((await op(T, 'dms_case_cancel_draft', [T, U.a, dead, 'nhầm'])).ok).toBe(true);
    expect(await numberOf(dead)).toBeNull();

    expect((await record(U.a, draft)).ok).toBe(true);
    const stt = await firstStt(draft, 'S-02');
    expect(await numberOf(draft)).toBe(`${pad(stt)}/${YEAR}/VB-TPL`);

    const next = await mkCase(U.a, 'vibang');
    expect((await record(U.a, next)).ok).toBe(true);
    const stt2 = await firstStt(next, 'S-02');
    expect(stt2).toBe(stt + 1);
    expect(await numberOf(next)).toBe(`${pad(stt2)}/${YEAR}/VB-TPL`);
  });

  it('Xác minh THA và Tổ chức THA: số theo STT của sổ S-04 và S-05, đuôi XM-TPL và TC-TPL', async () => {
    const x = await mkCase(U.a, 'xacminh');
    const t = await mkCase(U.a, 'tochuc');
    expect((await record(U.a, x)).ok).toBe(true);
    expect((await record(U.a, t)).ok).toBe(true);
    expect(await numberOf(x)).toBe(`${pad(await firstStt(x, 'S-04'))}/${YEAR}/XM-TPL`);
    expect(await numberOf(t)).toBe(`${pad(await firstStt(t, 'S-05'))}/${YEAR}/TC-TPL`);
  });

  it('Tống đạt: số theo hồ sơ (bộ đếm riêng), không theo STT các dòng S-01', async () => {
    const c1 = await mkCase(U.a, 'tongdat');
    await mkDoc(U.a, c1);
    await mkDoc(U.a, c1);
    await mkDoc(U.a, c1);
    expect((await record(U.a, c1)).ok).toBe(true);
    const c2 = await mkCase(U.a, 'tongdat');
    await mkDoc(U.a, c2);
    expect((await record(U.a, c2)).ok).toBe(true);
    const s1 = await sttOf(c1, 'S-01');
    const s2 = await sttOf(c2, 'S-01');
    expect(s1.length).toBe(3);
    expect(s2.length).toBe(1);
    // Hồ sơ thứ hai có STT S-01 cao hơn nhưng số hồ sơ chỉ tăng thêm 1.
    expect(await numberOf(c1)).toBe(`001/${YEAR}/TĐ-TPL`);
    expect(await numberOf(c2)).toBe(`002/${YEAR}/TĐ-TPL`);
    expect(s2[0]).toBe(4);
  });

  it('mỗi văn phòng đếm riêng số hồ sơ; bộ đếm của năm khác không ảnh hưởng năm nay', async () => {
    await owner.query(
      `INSERT INTO dms_case_number_counters (tenant_id, office_id, domain, year, last_value) VALUES ($1,$2,'tongdat',$3,50)`,
      [T, OFF_B, YEAR - 1],
    );
    const c = await mkCase(U.a, 'tongdat', OFF_B);
    await mkDoc(U.a, c);
    expect((await record(U.a, c)).ok).toBe(true);
    expect(await numberOf(c)).toBe(`001/${YEAR}/TĐ-TPL`);
    const v = await mkCase(U.a, 'vibang', OFF_B);
    expect((await record(U.a, v)).ok).toBe(true);
    expect(await numberOf(v)).toBe(`001/${YEAR}/VB-TPL`);
  });

  it('ghi sổ lại bị từ chối và không cấp thêm số; số đã gán không sửa được trực tiếp', async () => {
    const c = await mkCase(U.a, 'vibang');
    expect((await record(U.a, c)).ok).toBe(true);
    const num = await numberOf(c);
    expect((await record(U.a, c)).code).toBe('CASE_NOT_DRAFT');
    expect(await numberOf(c)).toBe(num);
    await expect(
      call(T, `UPDATE dms_case_files SET case_number = '999/${YEAR}/VB-TPL' WHERE id = $1`, [c]),
    ).rejects.toThrow();
    expect(await numberOf(c)).toBe(num);
  });

  it('ràng buộc: số gán cho nháp bị CSDL từ chối', async () => {
    const draft = await mkCase(U.a, 'vibang');
    await expect(
      call(T, `UPDATE dms_case_files SET case_number = '001/${YEAR}/VB-TPL' WHERE id = $1`, [
        draft,
      ]),
    ).rejects.toThrow();
  });

  it('đã trả kết quả: chỉ hồ sơ đã ghi sổ; cần quyền add_document; ghi nhật ký; đặt lại cùng giá trị không ghi thêm', async () => {
    const c = await mkCase(U.a, 'vibang');
    expect((await setReturned(U.a, c, true)).code).toBe('CASE_NOT_RECORDED');
    expect((await record(U.a, c)).ok).toBe(true);

    expect(await flags(U.a, [c])).toEqual([]);
    expect((await setReturned(U.reader, c, true)).code).toBe('PERMISSION_DENIED');
    expect((await setReturned(U.foreign, c, true)).code).toBe('CASE_NOT_FOUND');
    expect((await setReturned(U.a, c, null)).code).toBe('INVALID_INPUT');

    // Chưa có dòng nào mà bỏ tích thì không tạo gì.
    expect((await setReturned(U.a, c, false)).ok).toBe(true);
    expect(await flags(U.a, [c])).toEqual([]);
    expect(await auditCount(c)).toBe(0);

    expect((await setReturned(U.a, c, true)).ok).toBe(true);
    expect((await flags(U.a, [c]))[0]).toMatchObject({ case_id: c, returned: true });
    expect(await auditCount(c)).toBe(1);
    expect((await setReturned(U.a, c, true)).ok).toBe(true);
    expect(await auditCount(c)).toBe(1);

    expect((await setReturned(U.a, c, false)).ok).toBe(true);
    expect((await flags(U.a, [c]))[0]).toMatchObject({ returned: false });
    expect(await auditCount(c)).toBe(2);
  });

  it('đọc cờ chỉ trả hồ sơ người xem được thấy; không xóa được dòng cờ; cờ không đổi trạng thái hồ sơ', async () => {
    const c = await mkCase(U.a, 'vibang');
    expect((await record(U.a, c)).ok).toBe(true);
    expect((await setReturned(U.a, c, true)).ok).toBe(true);
    expect((await flags(U.reader, [c])).length).toBe(1);
    expect(await flags(U.foreign, [c])).toEqual([]);
    await expect(
      call(T, 'DELETE FROM dms_case_returned WHERE case_id = $1', [c]),
    ).rejects.toThrow();
    const st = await call(T, 'SELECT status FROM dms_case_files WHERE id = $1', [c]);
    expect(st[0].status).toBe('RECORDED');
  });
});
