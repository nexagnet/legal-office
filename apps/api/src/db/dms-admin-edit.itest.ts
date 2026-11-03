import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS GĐ 2a (0106): hàm đọc bổ sung (số hồ sơ, cờ đã trả, SĐT) và Admin sửa trực tiếp hồ sơ/tài liệu đã ghi sổ.
// PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsae_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS Admin sửa hồ sơ đã ghi sổ và hàm đọc bổ sung (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF2 = id();
  const U = { admin: id(), thv: id(), reader: id(), foreign: id() };
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
  const mkCase = async (attrs: Record<string, unknown>, domain = 'vibang') =>
    (
      await op(T, 'dms_case_create_draft', [
        T,
        U.thv,
        OFF,
        domain,
        'Hồ sơ gốc',
        JSON.stringify(attrs),
      ])
    ).label!;
  const mkDoc = async (caseId: string, attrs: Record<string, unknown> | null = null) =>
    (
      await op(T, 'dms_document_add', [
        T,
        U.thv,
        caseId,
        'Quyết định THA',
        'Giấy tờ',
        false,
        attrs ? JSON.stringify(attrs) : null,
      ])
    ).label!;
  const record = (caseId: string) => op(T, 'dms_case_record', [T, U.thv, caseId]);
  const recorded = async (attrs: Record<string, unknown> = {}) => {
    const c = await mkCase(attrs);
    const d = await mkDoc(c, { so_van_ban: '12/QĐ' });
    expect((await record(c)).ok).toBe(true);
    return { c, d };
  };
  const edit = (
    actor: string,
    caseId: string,
    title: string | null,
    attrs: Record<string, unknown> | null,
    reason: string | null,
    tenant = T,
  ) =>
    op(tenant, 'dms_case_admin_edit', [
      tenant,
      actor,
      caseId,
      title,
      attrs ? JSON.stringify(attrs) : null,
      reason,
    ]);
  const editDoc = (
    actor: string,
    docId: string,
    attrs: Record<string, unknown> | null,
    reason: string | null,
    tenant = T,
  ) =>
    op(tenant, 'dms_document_admin_edit', [
      tenant,
      actor,
      docId,
      attrs ? JSON.stringify(attrs) : null,
      reason,
    ]);
  const extras = (actor: string, cases: string[], tenant = T) =>
    call(tenant, 'SELECT * FROM dms_case_extras($1,$2,$3)', [tenant, actor, cases]);
  const effective = async (caseId: string) =>
    (await call(T, 'SELECT * FROM dms_case_effective($1,$2)', [T, caseId]))[0] as {
      title: string;
      attributes: Record<string, unknown>;
    };
  const revCount = async (caseId: string) =>
    Number(
      (
        await call(T, 'SELECT count(*) AS n FROM dms_case_revisions WHERE case_id = $1', [caseId])
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
      `INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A'),($3,$4,'VP B')`,
      [OFF, T, OFF2, T2],
    );
    for (const [uid, tenant] of [
      [U.admin, T],
      [U.thv, T],
      [U.reader, T],
      [U.foreign, T2],
    ]) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        tenant,
        uid,
      ]);
    }
    await owner.query(
      `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,'ADMIN'),($1,$4,$3,'THV')`,
      [T, U.admin, OFF, U.thv],
    );
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
    await group(
      T,
      OFF,
      'THV',
      domains.flatMap((d) =>
        ['read', 'draft', 'confirm', 'add_document', 'download'].map((a) => `${d}.${a}.own`),
      ),
      [U.thv],
    );
    await group(
      T,
      OFF,
      'Chỉ đọc',
      domains.map((d) => `${d}.read.all`),
      [U.reader],
    );
    await group(
      T2,
      OFF2,
      'THV B',
      domains.flatMap((d) =>
        ['read', 'draft', 'confirm', 'add_document'].map((a) => `${d}.${a}.own`),
      ),
      [U.foreign],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('dms_case_extras: số hồ sơ, cờ đã trả mặc định false và SĐT lấy từ thuộc tính', async () => {
    const { c } = await recorded({ so_dien_thoai: ' 0912 345 678 ' });
    const noPhone = await recorded({});
    const rows = await extras(U.thv, [c, noPhone.c]);
    const byId = new Map(rows.map((r) => [r.case_id as string, r]));
    expect(byId.get(c)?.case_number).toMatch(new RegExp(`^\\d{3,}/${YEAR}/VB-TPL$`));
    expect(byId.get(c)?.returned).toBe(false);
    expect(byId.get(c)?.phone).toBe('0912 345 678');
    expect(byId.get(noPhone.c)?.phone).toBeNull();

    expect((await op(T, 'dms_case_set_returned', [T, U.thv, c, true])).ok).toBe(true);
    expect((await extras(U.thv, [c]))[0].returned).toBe(true);
  });

  it('dms_domain_returned_counts: chỉ đếm hồ sơ đã ghi sổ có ô tích, đúng miền, năm, phạm vi xem và tenant', async () => {
    const counts = async (actor: string, tenant = T, office = OFF, year = YEAR) =>
      Object.fromEntries(
        (
          await call(tenant, 'SELECT * FROM dms_domain_returned_counts($1,$2,$3,$4)', [
            tenant,
            actor,
            office,
            year,
          ])
        ).map((r) => [r.domain as string, r.returned as number]),
      );
    const before = (await counts(U.thv)).vibang ?? 0;
    const a = await recorded({});
    const b = await recorded({});
    await mkCase({}); // nháp: không tính
    await op(T, 'dms_case_set_returned', [T, U.thv, a.c, true]);
    await op(T, 'dms_case_set_returned', [T, U.thv, b.c, true]);
    expect((await counts(U.thv)).vibang).toBe(before + 2);
    // Bỏ tích thì giảm; miền khác không lẫn vào.
    await op(T, 'dms_case_set_returned', [T, U.thv, b.c, false]);
    expect((await counts(U.thv)).vibang).toBe(before + 1);
    expect((await counts(U.thv)).tongdat).toBeUndefined();
    // Người chỉ đọc (read.all) thấy cùng số; năm khác và tenant khác thì không.
    expect((await counts(U.reader)).vibang).toBe(before + 1);
    expect((await counts(U.thv, T, OFF, YEAR - 1)).vibang).toBeUndefined();
    expect(await counts(U.foreign, T2, OFF2)).toEqual({});
    // Năm sai thì từ chối bằng rỗng, không lỗi.
    expect(await counts(U.thv, T, OFF, 1999)).toEqual({});
  });

  it('dms_case_extras: không lộ hồ sơ ngoài phạm vi hiển thị hoặc của tenant khác', async () => {
    const draftByThv = await mkCase({ so_dien_thoai: '0900000001' });
    // Người chỉ đọc không thấy bản nháp của người khác.
    expect(await extras(U.reader, [draftByThv])).toEqual([]);
    const { c } = await recorded({});
    expect(await extras(U.foreign, [c], T2)).toEqual([]);
    expect(await extras(U.reader, [c])).toHaveLength(1);
  });

  it('Admin sửa: tạo bản sửa mới, giá trị hiện hành đổi, bản gốc giữ nguyên, có lịch sử và nhật ký', async () => {
    const { c } = await recorded({ so_dien_thoai: '0911111111', ghi_chu: 'cũ' });
    const r = await edit(
      U.admin,
      c,
      'Hồ sơ đã sửa',
      { so_dien_thoai: '0922222222' },
      'Khách báo sai số điện thoại',
    );
    expect(r).toMatchObject({ ok: true, code: 'CASE_EDITED' });

    const eff = await effective(c);
    expect(eff.title).toBe('Hồ sơ đã sửa');
    expect(eff.attributes).toEqual({ so_dien_thoai: '0922222222', ghi_chu: 'cũ' });
    // Cột gốc không bị ghi đè (hồ sơ đã ghi sổ bất biến).
    const raw = (
      await call(T, 'SELECT title, attributes FROM dms_case_files WHERE id = $1', [c])
    )[0];
    expect(raw.title).toBe('Hồ sơ gốc');
    expect(raw.attributes.so_dien_thoai).toBe('0911111111');

    expect((await extras(U.thv, [c]))[0].phone).toBe('0922222222');
    const versions = await call(T, 'SELECT * FROM dms_case_revision_list($1,$2,$3)', [T, U.thv, c]);
    expect(versions.map((v) => v.rev)).toEqual([0, 1]);
    expect(versions[1].reason).toBe('Khách báo sai số điện thoại');
    const audit = await call(
      T,
      `SELECT count(*) AS n FROM dms_audit_records WHERE target_id = $1 AND action = 'dms.case.admin_edit'`,
      [c],
    );
    expect(Number(audit[0].n)).toBe(1);
  });

  it('Admin sửa: giá trị null xóa khóa, tiêu đề bỏ trống thì giữ nguyên, sửa nhiều lần tăng số bản', async () => {
    const { c } = await recorded({ a: '1', b: '2' });
    expect((await edit(U.admin, c, null, { a: null }, 'Bỏ ô a')).ok).toBe(true);
    expect((await effective(c)).attributes).toEqual({ b: '2' });
    expect((await effective(c)).title).toBe('Hồ sơ gốc');
    expect((await edit(U.admin, c, null, { b: '3' }, 'Đổi b')).ok).toBe(true);
    expect((await effective(c)).attributes).toEqual({ b: '3' });
    expect(await revCount(c)).toBe(2);
  });

  it('Admin sửa: không phải Admin thì ADMIN_ONLY, người không có quyền xem thì CASE_NOT_FOUND', async () => {
    const { c } = await recorded({});
    expect(await edit(U.thv, c, 'Tôi tự sửa', {}, 'thử')).toMatchObject({
      ok: false,
      code: 'ADMIN_ONLY',
    });
    expect((await edit(U.reader, c, 'x', {}, 'thử')).ok).toBe(false);
    expect(await edit(U.foreign, c, 'x', {}, 'thử', T2)).toMatchObject({
      ok: false,
      code: 'CASE_NOT_FOUND',
    });
    expect(await revCount(c)).toBe(0);
    expect((await effective(c)).title).toBe('Hồ sơ gốc');
  });

  it('Admin sửa: từ chối bản nháp, thiếu lý do, không đổi gì, thuộc tính không phải object', async () => {
    const draft = await mkCase({});
    // Admin không thấy nháp của người khác hoặc bị chặn vì chưa ghi sổ; không bao giờ thành công.
    expect((await edit(U.admin, draft, 'x', {}, 'thử')).ok).toBe(false);

    const { c } = await recorded({ k: 'v' });
    expect(await edit(U.admin, c, 'x', {}, '   ')).toMatchObject({
      ok: false,
      code: 'REASON_REQUIRED',
    });
    expect(await edit(U.admin, c, null, { k: 'v' }, 'Không đổi gì')).toMatchObject({
      ok: false,
      code: 'NOTHING_TO_CHANGE',
    });
    expect(
      await op(T, 'dms_case_admin_edit', [T, U.admin, c, null, '["x"]', 'sai kiểu']),
    ).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(await revCount(c)).toBe(0);
  });

  it('Admin sửa tài liệu: gộp thuộc tính, có lý do, bản gốc giữ nguyên, người khác bị chặn', async () => {
    const { d } = await recorded({});
    expect(await editDoc(U.thv, d, { so_van_ban: '99' }, 'thử')).toMatchObject({
      ok: false,
      code: 'ADMIN_ONLY',
    });
    expect(await editDoc(U.admin, d, { so_van_ban: '99' }, '')).toMatchObject({
      ok: false,
      code: 'REASON_REQUIRED',
    });
    expect(await editDoc(U.admin, d, { so_van_ban: '12/QĐ' }, 'Không đổi')).toMatchObject({
      ok: false,
      code: 'NOTHING_TO_CHANGE',
    });
    expect(
      await editDoc(U.admin, d, { so_van_ban: '99/QĐ', ghi_chu: 'mới' }, 'Gõ sai số'),
    ).toMatchObject({ ok: true, code: 'DOCUMENT_EDITED' });
    const eff = (await call(T, 'SELECT dms_doc_effective_attrs($1,$2) AS a', [T, d]))[0]
      .a as Record<string, unknown>;
    expect(eff).toEqual({ so_van_ban: '99/QĐ', ghi_chu: 'mới' });
    const raw = (await call(T, 'SELECT attributes FROM dms_documents WHERE id = $1', [d]))[0]
      .attributes;
    expect(raw).toEqual({ so_van_ban: '12/QĐ' });
    expect(await editDoc(U.foreign, d, { x: '1' }, 'thử', T2)).toMatchObject({
      ok: false,
      code: 'DOCUMENT_NOT_FOUND',
    });
  });

  it('sổ lấy giá trị hiện hành sau khi Admin sửa', async () => {
    const { c } = await recorded({ so_dien_thoai: '0933333333', noi_dung: 'ban đầu' });
    await edit(U.admin, c, 'Tiêu đề mới', { noi_dung: 'sau khi sửa' }, 'Đính chính');
    const rows = await call(T, 'SELECT * FROM dms_book_rows($1,$2,$3,$4,$5,$6,$7)', [
      T,
      U.thv,
      OFF,
      'S-02',
      YEAR,
      2000,
      0,
    ]);
    const mine = rows.filter((r) => r.case_id === c);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0].case_title).toBe('Tiêu đề mới');
    expect(mine[0].case_attributes.noi_dung).toBe('sau khi sửa');
  });

  it('ràng buộc: bản sửa không qua yêu cầu sửa đổi bắt buộc có lý do; bản sửa vẫn chỉ-thêm', async () => {
    const { c } = await recorded({});
    await expect(
      owner.query(
        `INSERT INTO dms_case_revisions (tenant_id, case_id, rev, title, attributes, created_by)
         VALUES ($1,$2,1,'x','{}'::jsonb,$3)`,
        [T, c, U.admin],
      ),
    ).rejects.toThrow(/dms_case_revisions_source_chk/);
    await edit(U.admin, c, 'Tiêu đề khác', {}, 'Có lý do');
    await expect(
      owner.query(`UPDATE dms_case_revisions SET title = 'sửa lén' WHERE case_id = $1`, [c]),
    ).rejects.toThrow(/append-only/);
    await expect(
      owner.query(`DELETE FROM dms_case_revisions WHERE case_id = $1`, [c]),
    ).rejects.toThrow(/append-only/);
  });
});
