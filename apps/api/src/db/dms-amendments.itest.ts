import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS Phase 4 (0079): sửa đổi hồ sơ đã lưu qua yêu cầu có lý do + scan bằng chứng; Admin hiệu lực ngay, người khác chờ duyệt hoặc trong cửa sổ tự duyệt. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsa_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS sửa đổi có duyệt (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF_B = id();
  const OFF2 = id();
  const U = { a: id(), b: id(), admin: id(), admin2: id(), foreign: id() };

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
      [U.admin, T],
      [U.admin2, T],
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
    const own = ['vibang', 'tongdat'].flatMap((d) =>
      ['read', 'draft', 'confirm', 'add_document', 'download', 'amend_request'].map(
        (a) => `${d}.${a}.own`,
      ),
    );
    const all = ['vibang', 'tongdat'].map((d) => `${d}.read.all`);
    await group(T, OFF, 'THV tạo', own, [U.a, U.b]);
    await group(T, OFF_B, 'THV tạo VP2', own, [U.a]);
    await group(T2, OFF2, 'THV B', own, [U.foreign]);
    // U.b còn đọc được toàn bộ hồ sơ đã ghi sổ ở văn phòng OFF.
    await group(T, OFF, 'Đọc sổ', all, [U.b]);
    await group(
      T,
      OFF,
      'Admin',
      [...all, 'dms.permission.approve', 'dms.amendment.approve'],
      [U.admin, U.admin2],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const SHA = 'a'.repeat(64);
  const SHA2 = 'b'.repeat(64);
  let seq = 0;
  const key = () => `obj/${randomUUID()}-${seq++}`;
  const propose = (
    u: string,
    caseId: string,
    kind: string,
    proposed: object,
    over: {
      doc?: string | null;
      file?: string | null;
      reason?: string;
      evidence?: boolean;
      n11?: boolean;
    } = {},
  ) =>
    op(T, 'dms_amendment_propose', [
      T,
      u,
      caseId,
      over.doc ?? null,
      over.file ?? null,
      kind,
      JSON.stringify(proposed),
      over.reason ?? 'Văn bản sửa đổi số 01',
      over.n11 ?? false,
      over.evidence === false ? null : key(),
      SHA,
      'application/pdf',
      1234,
    ]);
  const recorded = async (domain = 'vibang', attrs: object = { ghi_chu: 'gốc' }) => {
    const c = await mkCase(U.a, domain, OFF, attrs);
    expect((await record(U.a, c)).ok).toBe(true);
    return c;
  };
  const effective = async (caseId: string) =>
    (
      await call(T, 'SELECT title, attributes FROM dms_get_case($1,$2,$3)', [T, U.a, caseId])
    )[0] as {
      title: string;
      attributes: Record<string, string>;
    };

  it('Admin sửa có hiệu lực ngay; hồ sơ gốc không đổi, có bản sửa đổi và nhật ký', async () => {
    const c = await recorded();
    const r = await propose(U.admin, c, 'CASE_FIELDS', { attributes: { ghi_chu: 'đã sửa' } });
    expect(r.code).toBe('AMENDMENT_APPLIED');
    expect((await effective(c)).attributes.ghi_chu).toBe('đã sửa');
    const base = await owner.query(`SELECT attributes FROM dms_case_files WHERE id=$1`, [c]);
    expect(base.rows[0].attributes.ghi_chu).toBe('gốc');
    const req = await owner.query(
      `SELECT status, auto_via FROM dms_amendment_requests WHERE id=$1`,
      [r.label],
    );
    expect(req.rows[0]).toMatchObject({ status: 'APPROVED', auto_via: 'ADMIN' });
  });

  it('người thường ngoài cửa sổ: chờ duyệt, Admin duyệt thì áp dụng; không tự duyệt', async () => {
    const c = await recorded();
    const r = await propose(U.a, c, 'CASE_FIELDS', { title: 'Tên đã sửa' });
    expect(r.code).toBe('AMENDMENT_PENDING');
    expect((await effective(c)).title).not.toBe('Tên đã sửa');
    expect((await op(T, 'dms_amendment_review', [T, U.b, r.label, true, null])).code).toBe(
      'ADMIN_ONLY',
    );
    expect((await op(T, 'dms_amendment_review', [T, U.a, r.label, true, null])).code).toBe(
      'ADMIN_ONLY',
    );
    expect((await op(T, 'dms_amendment_review', [T, U.admin, r.label, false, ''])).code).toBe(
      'REASON_REQUIRED',
    );
    expect((await op(T, 'dms_amendment_review', [T, U.admin2, r.label, true, null])).code).toBe(
      'AMENDMENT_APPROVED',
    );
    expect((await effective(c)).title).toBe('Tên đã sửa');
    expect((await op(T, 'dms_amendment_review', [T, U.admin, r.label, true, null])).code).toBe(
      'REQUEST_NOT_PENDING',
    );
  });

  it('từ chối cần lý do và không đổi gì', async () => {
    const c = await recorded();
    const r = await propose(U.a, c, 'CASE_FIELDS', { attributes: { ghi_chu: 'x' } });
    expect(
      (await op(T, 'dms_amendment_review', [T, U.admin, r.label, false, 'Thiếu căn cứ'])).code,
    ).toBe('AMENDMENT_REJECTED');
    expect((await effective(c)).attributes.ghi_chu).toBe('gốc');
  });

  it('không tự duyệt: vừa ghi sổ xong người thường cũng phải chờ Admin; không còn cấu hình cửa sổ', async () => {
    const c = await recorded();
    const r = await propose(U.a, c, 'CASE_FIELDS', { attributes: { ghi_chu: 'ngay sau khi lưu' } });
    expect(r.code).toBe('AMENDMENT_PENDING');
    const req = await owner.query(
      `SELECT status, auto_via FROM dms_amendment_requests WHERE id=$1`,
      [r.label],
    );
    expect(req.rows[0]).toMatchObject({ status: 'PENDING', auto_via: null });
    expect((await effective(c)).attributes.ghi_chu).toBe('gốc');
    const gone = await owner.query(
      `SELECT 1 FROM pg_proc WHERE proname IN ('dms_amendment_window', 'dms_amendment_window_set')`,
    );
    expect(gone.rowCount).toBe(0);
  });

  it('bắt buộc lý do, bằng chứng scan; nháp không sửa đổi; N-11 chỉ Vi bằng', async () => {
    const c = await recorded();
    expect((await propose(U.a, c, 'CASE_FIELDS', { title: 'z' }, { reason: '  ' })).code).toBe(
      'REASON_REQUIRED',
    );
    expect((await propose(U.a, c, 'CASE_FIELDS', { title: 'z' }, { evidence: false })).code).toBe(
      'EVIDENCE_REQUIRED',
    );
    expect((await propose(U.a, c, 'CASE_FIELDS', { title: 'z' }, { n11: true })).code).toBe(
      'AMENDMENT_PENDING',
    );
    const td = await recorded('tongdat');
    expect((await propose(U.a, td, 'CASE_FIELDS', { title: 'z' }, { n11: true })).code).toBe(
      'INVALID_INPUT',
    );
    const draft = await mkCase(U.a, 'vibang');
    expect((await propose(U.a, draft, 'CASE_FIELDS', { title: 'z' })).code).toBe(
      'CASE_NOT_RECORDED',
    );
    expect((await propose(U.foreign, c, 'CASE_FIELDS', { title: 'z' })).ok).toBe(false);
  });

  it('thêm phiên bản tệp mới (v2), bản cũ còn, tải về lấy bản mới nhất', async () => {
    const c = await mkCase(U.a, 'vibang');
    const docId = (await op(T, 'dms_document_add', [T, U.a, c, 'Vi bằng', 'Bản chính', true, null]))
      .label!;
    const oldKey = key();
    await op(T, 'dms_file_attach', [
      T,
      U.a,
      docId,
      'scan',
      true,
      oldKey,
      SHA,
      'application/pdf',
      100,
    ]);
    await record(U.a, c);
    const fileId = (
      await owner.query(`SELECT id FROM dms_document_files WHERE document_id=$1`, [docId])
    ).rows[0].id;
    const newKey = key();
    const r = await propose(
      U.admin,
      c,
      'FILE_VERSION',
      { object_key: newKey, sha256: SHA2, mime: 'application/pdf', size_bytes: 200 },
      { doc: docId, file: fileId },
    );
    expect(r.code).toBe('AMENDMENT_APPLIED');
    const versions = await owner.query(
      `SELECT version FROM dms_document_versions WHERE file_id=$1 ORDER BY version`,
      [fileId],
    );
    expect(versions.rows.map((x) => x.version)).toEqual([1, 2]);
    const dl = await call(T, 'SELECT * FROM dms_file_download($1,$2,$3)', [T, U.a, fileId]);
    expect(dl[0].object_key).toBe(newKey);
    await expect(
      owner.query(`UPDATE dms_document_versions SET sha256=$2 WHERE file_id=$1`, [fileId, SHA2]),
    ).rejects.toThrow();
  });

  it('yêu cầu sửa đổi không xoá, không đổi nội dung; thuộc tính tài liệu sửa qua bản sửa đổi', async () => {
    const c = await mkCase(U.a, 'tongdat');
    const docId = (
      await op(T, 'dms_document_add', [
        T,
        U.a,
        c,
        'QĐ',
        'Giấy tờ',
        false,
        JSON.stringify({ loai_van_ban: 'gốc' }),
      ])
    ).label!;
    await record(U.a, c);
    const r = await propose(
      U.admin,
      c,
      'DOCUMENT_FIELDS',
      { attributes: { loai_van_ban: 'mới' } },
      { doc: docId },
    );
    expect(r.code).toBe('AMENDMENT_APPLIED');
    const rows = await call(T, 'SELECT * FROM dms_list_documents($1,$2,$3)', [T, U.a, c]);
    expect(rows[0].attributes.loai_van_ban).toBe('mới');
    await expect(
      owner.query(`DELETE FROM dms_amendment_requests WHERE id=$1`, [r.label]),
    ).rejects.toThrow();
    await expect(
      owner.query(`UPDATE dms_amendment_requests SET reason='x' WHERE id=$1`, [r.label]),
    ).rejects.toThrow();
    const list = await call(T, 'SELECT * FROM dms_list_amendments($1,$2,$3,NULL,NULL,50,0)', [
      T,
      U.b,
      OFF,
    ]);
    expect(list.length).toBe(0);
    const adminList = await call(T, 'SELECT * FROM dms_list_amendments($1,$2,$3,NULL,NULL,50,0)', [
      T,
      U.admin,
      OFF,
    ]);
    expect(adminList.length).toBeGreaterThan(0);
  });
});
