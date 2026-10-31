import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS Phase 1 lát 1 (0071): hồ sơ/tài liệu/tệp/phiên bản/nhật ký, phân quyền bằng Nhóm quyền. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dms_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const sha = (c: string) => c.repeat(64).slice(0, 64);

describe.skipIf(!ADMIN_URL)('DMS lõi (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF2 = id();
  const U = { thvA: id(), thvB: id(), reader: id(), none: id(), foreign: id() };

  /** Chạy một hàm CSDL dưới role ứng dụng (RLS thật) với ngữ cảnh tenant. */
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
  const createCase = (
    u: string,
    domain = 'vibang',
    title = 'Hồ sơ thử',
    tenant = T,
    office = OFF,
  ) =>
    op(tenant, 'dms_case_create_draft', [
      tenant,
      u,
      office,
      domain,
      title,
      JSON.stringify({ k: 'v' }),
    ]);
  const addDoc = (u: string, caseId: string, title = 'Tài liệu 1') =>
    op(T, 'dms_document_add', [T, u, caseId, 'N-04', title, true]);
  let keySeq = 0;
  const attach = (u: string, docId: string, scan = true) =>
    op(T, 'dms_file_attach', [
      T,
      u,
      docId,
      'bản scan',
      scan,
      `obj/${++keySeq}`,
      sha('a'),
      'application/pdf',
      1234,
    ]);
  const cases = (u: string, domain: string | null = null, status: string | null = null) =>
    call(T, 'SELECT * FROM dms_list_cases($1,$2,$3,$4,$5,100,0)', [T, u, OFF, domain, status]);

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
      [U.thvA, T],
      [U.thvB, T],
      [U.reader, T],
      [U.none, T],
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
      for (const p of perms) {
        await owner.query(
          `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
          [tenant, g.rows[0].id, p],
        );
      }
      for (const u of users) {
        await owner.query(
          `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
          [tenant, g.rows[0].id, u],
        );
      }
      return g.rows[0].id as string;
    };
    // Nhóm "THV tạo": toàn quyền trên hồ sơ do chính mình tạo, ở cả bốn miền.
    const own = ['vibang', 'tongdat', 'xacminh', 'tochuc'].flatMap((d) =>
      ['read', 'draft', 'confirm', 'add_document', 'download'].map((a) => `${d}.${a}.own`),
    );
    await group(T, OFF, 'THV tạo', own, [U.thvA, U.thvB]);
    await group(
      T,
      OFF,
      'Người xem Vi bằng',
      ['vibang.read.all', 'vibang.download.all'],
      [U.reader],
    );
    await group(T2, OFF2, 'THV tạo', own, [U.foreign]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('mặc định từ chối: người không thuộc nhóm nào không tạo được hồ sơ', async () => {
    const r = await createCase(U.none);
    expect(r).toMatchObject({ ok: false, code: 'PERMISSION_DENIED' });
  });

  it('THV tạo nháp ở cả bốn miền; tên miền lạ bị từ chối', async () => {
    for (const d of ['vibang', 'tongdat', 'xacminh', 'tochuc']) {
      expect((await createCase(U.thvA, d)).ok).toBe(true);
    }
    expect(await createCase(U.thvA, 'khac')).toMatchObject({ ok: false, code: 'INVALID_DOMAIN' });
  });

  it('nháp sửa được, ghi sổ rồi thì bất biến (kể cả qua hàm lẫn SQL trực tiếp)', async () => {
    const c = (await createCase(U.thvA, 'tongdat', 'Tống đạt 1')).label!;
    expect(
      (await op(T, 'dms_case_update_draft', [T, U.thvA, c, 'Tống đạt 1 sửa', '{"a":1}'])).ok,
    ).toBe(true);
    const d = (await addDoc(U.thvA, c)).label!;
    expect(
      (await op(T, 'dms_document_update_draft', [T, U.thvA, d, 'N-02', 'Tài liệu sửa', true])).ok,
    ).toBe(true);
    expect(await op(T, 'dms_case_record', [T, U.thvA, c])).toMatchObject({
      ok: true,
      code: 'CASE_RECORDED',
    });

    expect(await op(T, 'dms_case_update_draft', [T, U.thvA, c, 'x', '{}'])).toMatchObject({
      ok: false,
      code: 'CASE_NOT_DRAFT',
    });
    expect(
      await op(T, 'dms_document_update_draft', [T, U.thvA, d, 'N-02', 'x', true]),
    ).toMatchObject({ ok: false, code: 'DOCUMENT_NOT_DRAFT' });
    expect(await op(T, 'dms_case_record', [T, U.thvA, c])).toMatchObject({
      ok: false,
      code: 'CASE_NOT_DRAFT',
    });
    expect(await op(T, 'dms_case_cancel_draft', [T, U.thvA, c, 'lý do'])).toMatchObject({
      ok: false,
      code: 'CASE_NOT_DRAFT',
    });

    // Chặn tận CSDL: ngay cả chủ bảng cũng không sửa/xoá được hàng đã ghi sổ.
    await expect(
      owner.query(`UPDATE dms_case_files SET title = 'hack' WHERE id = $1`, [c]),
    ).rejects.toThrow(/immutable/);
    await expect(
      owner.query(`UPDATE dms_documents SET title = 'hack' WHERE id = $1`, [d]),
    ).rejects.toThrow(/immutable/);
  });

  it('không có đường xoá ở bất kỳ bảng lõi nào, kể cả TRUNCATE', async () => {
    const c = (await createCase(U.thvA)).label!;
    await attach(U.thvA, (await addDoc(U.thvA, c)).label!);
    await expect(owner.query(`DELETE FROM dms_case_files WHERE id = $1`, [c])).rejects.toThrow(
      /cannot be deleted/,
    );
    await expect(owner.query(`TRUNCATE dms_case_files CASCADE`)).rejects.toThrow(/append-only/);
    await expect(owner.query(`DELETE FROM dms_documents`)).rejects.toThrow(/cannot be deleted/);
    await expect(owner.query(`DELETE FROM dms_document_files`)).rejects.toThrow(/append-only/);
    await expect(owner.query(`DELETE FROM dms_document_versions`)).rejects.toThrow(/append-only/);
    await expect(owner.query(`DELETE FROM dms_audit_records`)).rejects.toThrow(/append-only/);
  });

  it('hủy nháp giữ lịch sử, cần lý do, không khôi phục được, tài liệu nháp theo hồ sơ', async () => {
    const c = (await createCase(U.thvA)).label!;
    const d = (await addDoc(U.thvA, c)).label!;
    expect(await op(T, 'dms_case_cancel_draft', [T, U.thvA, c, '  '])).toMatchObject({
      ok: false,
      code: 'REASON_REQUIRED',
    });
    expect(await op(T, 'dms_case_cancel_draft', [T, U.thvA, c, 'nhập nhầm'])).toMatchObject({
      ok: true,
    });
    const rows = await owner.query(
      `SELECT status FROM dms_case_files WHERE id = $1 UNION ALL SELECT status FROM dms_documents WHERE id = $2`,
      [c, d],
    );
    expect(rows.rows.map((r) => r.status)).toEqual(['CANCELLED', 'CANCELLED']);
    await expect(
      owner.query(`UPDATE dms_case_files SET status = 'DRAFT' WHERE id = $1`, [c]),
    ).rejects.toThrow(/immutable/);
    expect(await addDoc(U.thvA, c)).toMatchObject({ ok: false, code: 'CASE_CANCELLED' });
    expect((await cases(U.thvA)).find((r) => r.id === c)).toBeUndefined();
    expect((await cases(U.thvA, null, 'CANCELLED')).some((r) => r.id === c)).toBe(true);
  });

  it('đếm tài liệu logic và tệp scan; thêm tệp mới không đổi tệp cũ, bản cũ giữ nguyên', async () => {
    const c = (await createCase(U.thvA, 'vibang', 'Đếm')).label!;
    const d1 = (await addDoc(U.thvA, c, 'Vi bằng')).label!;
    const d2 = (await addDoc(U.thvA, c, 'Phụ lục')).label!;
    const f1 = await attach(U.thvA, d1, true);
    await attach(U.thvA, d1, true);
    await attach(U.thvA, d2, false);
    expect(f1.ok).toBe(true);
    const row = (await cases(U.thvA, 'vibang')).find((r) => r.id === c)!;
    expect(row).toMatchObject({ document_count: 2, scan_count: 2, status: 'DRAFT' });

    expect((await op(T, 'dms_case_record', [T, U.thvA, c])).ok).toBe(true);
    // Hồ sơ đã ghi sổ: vẫn bổ sung được tài liệu/tệp MỚI (không sửa cái cũ).
    const d3 = (await addDoc(U.thvA, c, 'Bổ sung')).label!;
    expect((await attach(U.thvA, d3)).ok).toBe(true);
    const after = (await cases(U.thvA, 'vibang')).find((r) => r.id === c)!;
    expect(after).toMatchObject({ document_count: 3, scan_count: 3, status: 'RECORDED' });
    const docs = await call(T, 'SELECT * FROM dms_list_documents($1,$2,$3)', [T, U.thvA, c]);
    expect(docs.map((r) => [r.title, r.status, r.file_count, r.scan_count])).toEqual([
      ['Vi bằng', 'RECORDED', 2, 2],
      ['Phụ lục', 'RECORDED', 1, 0],
      ['Bổ sung', 'RECORDED', 1, 1],
    ]);
    // Không có đường ghi phiên bản thứ 2 hay sửa tệp.
    await expect(
      owner.query(
        `INSERT INTO dms_document_versions (tenant_id, file_id, version, object_key, sha256, mime, size_bytes, created_by)
         SELECT tenant_id, id, 2, 'obj/v2', $1, 'application/pdf', 10, created_by FROM dms_document_files LIMIT 1`,
        [sha('b')],
      ),
    ).rejects.toThrow();
    await expect(
      owner.query(`UPDATE dms_document_versions SET sha256 = $1`, [sha('c')]),
    ).rejects.toThrow(/append-only/);
  });

  it('khoá đối tượng không được dùng lại; băm và kích thước sai bị từ chối', async () => {
    const c = (await createCase(U.thvA)).label!;
    const d = (await addDoc(U.thvA, c)).label!;
    expect(
      (
        await op(T, 'dms_file_attach', [
          T,
          U.thvA,
          d,
          'a',
          true,
          'obj/dup',
          sha('a'),
          'application/pdf',
          5,
        ])
      ).ok,
    ).toBe(true);
    expect(
      await op(T, 'dms_file_attach', [
        T,
        U.thvA,
        d,
        'b',
        true,
        'obj/dup',
        sha('a'),
        'application/pdf',
        5,
      ]),
    ).toMatchObject({ code: 'OBJECT_KEY_IN_USE' });
    expect(
      await op(T, 'dms_file_attach', [
        T,
        U.thvA,
        d,
        'b',
        true,
        'obj/x1',
        'zz',
        'application/pdf',
        5,
      ]),
    ).toMatchObject({ code: 'INVALID_INPUT' });
    expect(
      await op(T, 'dms_file_attach', [
        T,
        U.thvA,
        d,
        'b',
        true,
        'obj/x2',
        sha('a'),
        'application/pdf',
        0,
      ]),
    ).toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('A1: THV B không thấy, không liệt kê, không tải, không ghi vào hồ sơ của THV A', async () => {
    const c = (await createCase(U.thvA, 'vibang', 'Riêng của A')).label!;
    const d = (await addDoc(U.thvA, c)).label!;
    expect((await attach(U.thvA, d)).ok).toBe(true);
    expect((await op(T, 'dms_case_record', [T, U.thvA, c])).ok).toBe(true);
    const fileId = (await call(T, 'SELECT * FROM dms_list_files($1,$2,$3)', [T, U.thvA, d]))[0].id;

    expect((await cases(U.thvB)).some((r) => r.id === c)).toBe(false);
    expect(await call(T, 'SELECT * FROM dms_list_documents($1,$2,$3)', [T, U.thvB, c])).toEqual([]);
    expect(await call(T, 'SELECT * FROM dms_list_files($1,$2,$3)', [T, U.thvB, d])).toEqual([]);
    expect(await call(T, 'SELECT * FROM dms_file_download($1,$2,$3)', [T, U.thvB, fileId])).toEqual(
      [],
    );
    // Không lộ sự tồn tại: lỗi giống hệt hồ sơ không có thật.
    expect(await addDoc(U.thvB, c)).toMatchObject({ ok: false, code: 'CASE_NOT_FOUND' });
    expect(
      await op(T, 'dms_file_attach', [
        T,
        U.thvB,
        d,
        'x',
        true,
        'obj/b',
        sha('a'),
        'application/pdf',
        5,
      ]),
    ).toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
    // Chủ hồ sơ tải được.
    const dl = await call(T, 'SELECT * FROM dms_file_download($1,$2,$3)', [T, U.thvA, fileId]);
    expect(dl).toHaveLength(1);
    expect(dl[0]).toMatchObject({ mime: 'application/pdf', sha256: sha('a') });
  });

  it('nhóm quyền ".all" cho thấy hồ sơ đã ghi sổ nhưng không thấy nháp; thiếu quyền ghi/tải thì bị chặn', async () => {
    const draft = (await createCase(U.thvA, 'vibang', 'Nháp của A')).label!;
    const rec = (await createCase(U.thvA, 'vibang', 'Đã ghi sổ của A')).label!;
    const d = (await addDoc(U.thvA, rec)).label!;
    const f = await attach(U.thvA, d);
    await op(T, 'dms_case_record', [T, U.thvA, rec]);
    const seen = (await cases(U.reader, 'vibang')).map((r) => r.id);
    expect(seen).toContain(rec);
    expect(seen).not.toContain(draft);
    // Người xem chỉ có read/download: không tạo, không thêm tài liệu, không ghi sổ.
    expect(await createCase(U.reader)).toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(await addDoc(U.reader, rec)).toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(await op(T, 'dms_case_record', [T, U.reader, draft])).toMatchObject({
      code: 'CASE_NOT_FOUND',
    });
    const dl = await call(T, 'SELECT * FROM dms_file_download($1,$2,$3)', [
      T,
      U.reader,
      (await call(T, 'SELECT * FROM dms_list_files($1,$2,$3)', [T, U.reader, d]))[0].id,
    ]);
    expect(dl).toHaveLength(1);
    expect(f.ok).toBe(true);
    // Miền khác: nhóm chỉ có quyền vibang, không đọc được hồ sơ tongdat của người khác.
    const td = (await createCase(U.thvA, 'tongdat', 'Tống đạt riêng')).label!;
    await op(T, 'dms_case_record', [T, U.thvA, td]);
    expect((await cases(U.reader)).some((r) => r.id === td)).toBe(false);
  });

  it('A2: thu hồi quyền có hiệu lực ngay', async () => {
    const c = (await createCase(U.thvB, 'tochuc', 'Thu hồi')).label!;
    await op(T, 'dms_case_record', [T, U.thvB, c]);
    expect((await cases(U.thvB, 'tochuc')).some((r) => r.id === c)).toBe(true);
    await owner.query(`DELETE FROM dms_group_members WHERE user_id = $1`, [U.thvB]);
    expect((await cases(U.thvB, 'tochuc')).some((r) => r.id === c)).toBe(false);
    expect(await createCase(U.thvB)).toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('cô lập tenant: tenant khác không thấy gì; RLS chặn truy cập chéo', async () => {
    const c = (await createCase(U.thvA, 'xacminh', 'Của tenant A')).label!;
    await op(T, 'dms_case_record', [T, U.thvA, c]);
    expect(
      await call(T2, 'SELECT * FROM dms_list_cases($1,$2,$3,NULL,NULL,100,0)', [
        T2,
        U.foreign,
        OFF2,
      ]),
    ).toEqual([]);
    expect(await call(T2, 'SELECT id FROM dms_case_files', [])).toEqual([]);
    // Dùng tenant B nhưng trỏ vào hồ sơ tenant A: coi như không có.
    expect(await op(T2, 'dms_document_add', [T2, U.foreign, c, 'N', 't', false])).toMatchObject({
      ok: false,
      code: 'CASE_NOT_FOUND',
    });
    // Nhóm quyền của tenant A không áp sang văn phòng tenant B.
    expect(await createCase(U.thvA, 'vibang', 'x', T2, OFF2)).toMatchObject({ ok: false });
  });

  it('ghi nhật ký: mọi thao tác thành công vào dms_audit_records (không PII); từ chối vào audit_log', async () => {
    const c = (await createCase(U.thvA, 'vibang', 'Nhật ký')).label!;
    const d = (await addDoc(U.thvA, c)).label!;
    await attach(U.thvA, d);
    await op(T, 'dms_case_record', [T, U.thvA, c]);
    await addDoc(U.thvB, c); // bị từ chối
    const rec = await owner.query(
      `SELECT action FROM dms_audit_records WHERE detail ->> 'case_id' = $1::text OR target_id = $1::uuid OR target_id = $2::uuid ORDER BY id`,
      [c, d],
    );
    expect(rec.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['dms.case.create_draft', 'dms.document.add', 'dms.case.record']),
    );
    const deny = await owner.query(
      `SELECT 1 FROM audit_log WHERE action = 'dms.document.add' AND outcome = 'deny' AND actor_id = $1`,
      [U.thvB],
    );
    expect(deny.rowCount).toBeGreaterThan(0);
    const file = await owner.query(
      `SELECT detail FROM dms_audit_records WHERE action = 'dms.file.attach' AND detail ->> 'document_id' = $1`,
      [d],
    );
    expect(file.rows[0].detail).toMatchObject({ sha256: sha('a'), is_scan: true });
    expect(JSON.stringify(file.rows[0].detail)).not.toContain('Nhật ký');
  });

  it('mã quyền lạ bị từ chối ở CSDL (không tạo quyền ngoài danh mục, không có quyền duyệt/xoá)', async () => {
    const g = (await owner.query(`SELECT id FROM dms_permission_groups LIMIT 1`)).rows[0].id;
    for (const bad of [
      'vibang.delete.all',
      'vibang.amendment.approve',
      'admin.read.all',
      'vibang.read.any',
    ]) {
      await expect(
        owner.query(
          `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
          [T, g, bad],
        ),
      ).rejects.toThrow(/check/);
    }
  });
});
