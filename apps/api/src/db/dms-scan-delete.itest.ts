import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS GĐ 1 (0105): xóa mềm file scan, Scan đã xóa 30 ngày, dọn, quyền dms.scan.delete. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsx_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS xóa mềm file scan (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF_B = id();
  const OFF2 = id();
  const U = {
    admin: id(),
    adminB: id(),
    thv: id(),
    clerk: id(),
    deleter: id(),
    outsider: id(),
    foreign: id(),
  };
  let seq = 0;
  const key = () => `scan/${randomUUID()}.pdf`;
  const sha = () => String(++seq % 10).repeat(64);

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

  /** Tạo hồ sơ vi bằng có 1 tài liệu, 2 file scan + 1 file không phải scan, rồi ghi sổ. */
  const mkRecordedCase = async () => {
    const c = (
      await op(T, 'dms_case_create_draft', [T, U.thv, OFF, 'vibang', 'Hồ sơ có scan', '{}'])
    ).label!;
    const d = (await op(T, 'dms_document_add', [T, U.thv, c, 'Vi bằng', 'Bản chính', true, null]))
      .label!;
    const attach = async (label: string, isScan: boolean) =>
      (
        await op(T, 'dms_file_attach', [
          T,
          U.thv,
          d,
          label,
          isScan,
          key(),
          sha(),
          'application/pdf',
          2048,
        ])
      ).label!;
    const scanA = await attach('scan-a.pdf', true);
    const scanB = await attach('scan-b.pdf', true);
    const plain = await attach('bien-ban.docx', false);
    expect((await op(T, 'dms_case_record', [T, U.thv, c])).ok).toBe(true);
    return { c, d, scanA, scanB, plain };
  };
  const del = (u: string, kind: string, file: string, reason: string | null = 'Scan nhầm hồ sơ') =>
    op(T, 'dms_scan_delete', [T, u, kind, file, reason]);
  const caseRow = async (u: string, c: string) =>
    (await call(T, 'SELECT * FROM dms_get_case($1,$2,$3)', [T, u, c]))[0];
  const listFiles = (u: string, d: string) =>
    call(T, 'SELECT * FROM dms_list_files($1,$2,$3)', [T, u, d]);
  const deletedList = (u: string, office = OFF) =>
    call(T, 'SELECT * FROM dms_deleted_scans_list($1,$2,$3,50,0)', [T, u, office]);
  const dlDeleted = (u: string, kind: string, file: string) =>
    call(T, 'SELECT * FROM dms_deleted_scan_download($1,$2,$3,$4)', [T, u, kind, file]);
  const auditCount = async (action: string, target: string) =>
    Number(
      (
        await call(
          T,
          'SELECT count(*) AS n FROM dms_audit_records WHERE action = $1 AND target_id = $2',
          [action, target],
        )
      )[0].n,
    );
  /** Lùi hạn dọn của một file về quá khứ (chỉ để thử: tắt trigger bất biến trong giao dịch của chủ bảng). */
  const backdate = async (table: string, file: string) => {
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await c.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
      await c.query(
        `UPDATE ${table} SET deleted_at = deleted_at - interval '31 days', purge_after = purge_after - interval '31 days' WHERE id = $1`,
        [file],
      );
      await c.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
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
      `INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A'),($3,$2,'VP A2'),($4,$5,'VP B')`,
      [OFF, T, OFF_B, OFF2, T2],
    );
    for (const [uid, tenant] of [
      [U.admin, T],
      [U.adminB, T],
      [U.thv, T],
      [U.clerk, T],
      [U.deleter, T],
      [U.outsider, T],
      [U.foreign, T2],
    ]) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        tenant,
        uid,
      ]);
    }
    const member = (tenant: string, user: string, office: string, role: string) =>
      owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4)`,
        [tenant, user, office, role],
      );
    await member(T, U.admin, OFF, 'ADMIN');
    await member(T, U.adminB, OFF_B, 'ADMIN');
    await member(T, U.thv, OFF, 'THV');
    await member(T, U.clerk, OFF, 'VAN_THU');
    await member(T, U.deleter, OFF, 'THU_KY');
    await member(T2, U.foreign, OFF2, 'ADMIN');
    const group = async (name: string, perms: string[], users: string[]) => {
      const g = await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,$3) RETURNING id`,
        [T, OFF, name],
      );
      for (const p of perms)
        await owner.query(
          `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
          [T, g.rows[0].id, p],
        );
      for (const u of users)
        await owner.query(
          `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
          [T, g.rows[0].id, u],
        );
    };
    await group(
      'THV tạo',
      ['read', 'draft', 'confirm', 'add_document', 'download'].map((a) => `vibang.${a}.own`),
      [U.thv],
    );
    await group('Chỉ đọc', ['vibang.read.all', 'vibang.download.all'], [U.clerk, U.deleter]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('Admin xóa scan: file biến khỏi danh sách/đếm/chỉ mục; hồ sơ, tài liệu, STT, số hồ sơ không đổi', async () => {
    const k = await mkRecordedCase();
    const before = await caseRow(U.admin, k.c);
    expect(before).toMatchObject({ document_count: 1, scan_count: 2, status: 'RECORDED' });
    const stt = await call(T, 'SELECT stt FROM dms_book_entries WHERE case_id = $1', [k.c]);
    const num = (await call(T, 'SELECT case_number FROM dms_case_files WHERE id = $1', [k.c]))[0]
      .case_number;
    expect((await listFiles(U.admin, k.d)).length).toBe(3);

    const r = await del(U.admin, 'document', k.scanA);
    expect(r.code).toBe('SCAN_DELETED');

    expect((await listFiles(U.admin, k.d)).map((f) => f.label).sort()).toEqual([
      'bien-ban.docx',
      'scan-b.pdf',
    ]);
    expect(await caseRow(U.admin, k.c)).toMatchObject({
      document_count: 1,
      scan_count: 1,
      status: 'RECORDED',
    });
    const docs = await call(T, 'SELECT * FROM dms_list_documents($1,$2,$3)', [T, U.admin, k.c]);
    expect(docs[0]).toMatchObject({ file_count: 2, scan_count: 1 });
    const cases = await call(
      T,
      `SELECT * FROM dms_list_cases($1,$2,$3,'vibang','RECORDED',200,0) WHERE id = $4`,
      [T, U.admin, OFF, k.c],
    );
    expect(cases[0].scan_count).toBe(1);
    const idx = await owner.query(`SELECT scan_count FROM dms_case_index WHERE case_id = $1`, [
      k.c,
    ]);
    expect(idx.rows[0].scan_count).toBe(1);
    // Tải qua đường thường không còn.
    expect(
      await call(T, 'SELECT * FROM dms_file_download($1,$2,$3)', [T, U.admin, k.scanA]),
    ).toEqual([]);
    // STT, số hồ sơ, dòng sổ, tài liệu: nguyên vẹn.
    expect(await call(T, 'SELECT stt FROM dms_book_entries WHERE case_id = $1', [k.c])).toEqual(
      stt,
    );
    expect(
      (await call(T, 'SELECT case_number FROM dms_case_files WHERE id = $1', [k.c]))[0].case_number,
    ).toBe(num);
    expect(await auditCount('dms.scan.delete', k.scanA)).toBe(1);
  });

  it('chỉ người có quyền xóa: người tạo hồ sơ, người chỉ đọc, người ngoài đều bị từ chối; lý do bắt buộc', async () => {
    const k = await mkRecordedCase();
    expect((await del(U.thv, 'document', k.scanA)).code).toBe('PERMISSION_DENIED');
    expect((await del(U.clerk, 'document', k.scanA)).code).toBe('PERMISSION_DENIED');
    expect((await del(U.outsider, 'document', k.scanA)).code).toBe('FILE_NOT_FOUND');
    expect((await del(U.foreign, 'document', k.scanA)).code).toBe('FILE_NOT_FOUND');
    expect((await del(U.adminB, 'document', k.scanA)).code).toBe('FILE_NOT_FOUND');
    expect((await del(U.admin, 'document', k.scanA, '   ')).code).toBe('REASON_REQUIRED');
    expect((await del(U.admin, 'document', k.scanA, null)).code).toBe('REASON_REQUIRED');
    expect((await del(U.admin, 'document', k.scanA, 'x'.repeat(1001))).code).toBe(
      'REASON_REQUIRED',
    );
    expect((await del(U.admin, 'folder', k.scanA)).code).toBe('INVALID_INPUT');
    expect((await del(U.admin, 'document', randomUUID())).code).toBe('FILE_NOT_FOUND');
    expect((await caseRow(U.admin, k.c)).scan_count).toBe(2);
    expect((await del(U.admin, 'document', k.plain)).code).toBe('NOT_A_SCAN');
    expect((await listFiles(U.admin, k.d)).length).toBe(3);
    expect((await del(U.admin, 'document', k.scanA)).ok).toBe(true);
    expect((await del(U.admin, 'document', k.scanA)).code).toBe('ALREADY_DELETED');
  });

  it('cấp riêng quyền xóa: có hiệu lực, thu lại thì hết; nhóm quyền không giữ được mã này', async () => {
    const apply = (desired: string[], reason = 'Phụ trách dọn scan nhầm') =>
      op(T, 'dms_user_overrides_apply', [T, U.admin, OFF, U.deleter, desired, reason]);
    const base = ['vibang.read.all', 'vibang.download.all'];
    const k = await mkRecordedCase();
    expect((await del(U.deleter, 'document', k.scanA)).code).toBe('PERMISSION_DENIED');
    expect((await apply([...base, 'dms.scan.delete'])).ok).toBe(true);
    const mine = await call(T, 'SELECT permission FROM dms_my_permissions($1,$2,$3)', [
      T,
      U.deleter,
      OFF,
    ]);
    expect(mine.map((r) => r.permission)).toContain('dms.scan.delete');
    expect((await del(U.deleter, 'document', k.scanA)).code).toBe('SCAN_DELETED');
    // Người được cấp riêng vẫn KHÔNG vào được mục Scan đã xóa (chỉ Admin).
    expect(await deletedList(U.deleter)).toEqual([]);
    expect(await dlDeleted(U.deleter, 'document', k.scanA)).toEqual([]);
    expect((await apply(base)).ok).toBe(true);
    expect((await del(U.deleter, 'document', k.scanB)).code).toBe('PERMISSION_DENIED');
    // Admin có mặc nhiên và thấy mã trong danh mục.
    const adminPerms = await call(T, 'SELECT permission FROM dms_my_permissions($1,$2,$3)', [
      T,
      U.admin,
      OFF,
    ]);
    expect(adminPerms.map((r) => r.permission)).toContain('dms.scan.delete');
    // Nhóm quyền không được chứa mã này.
    const g = await owner.query(
      `SELECT id FROM dms_permission_groups WHERE tenant_id = $1 LIMIT 1`,
      [T],
    );
    await expect(
      owner.query(
        `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,'dms.scan.delete')`,
        [T, g.rows[0].id],
      ),
    ).rejects.toThrow();
    // Cấp riêng phải có lý do (luật cũ của quyền riêng giữ nguyên).
    expect((await apply([...base, 'dms.scan.delete'], '  ')).code).toBe('REASON_REQUIRED');
  });

  it('Scan đã xóa: chỉ Admin văn phòng xem và tải trong 30 ngày; có lý do, hạn, số ngày còn lại; không có khôi phục', async () => {
    const k = await mkRecordedCase();
    expect((await del(U.admin, 'document', k.scanB, 'Quét nhầm giấy khác')).ok).toBe(true);
    const rows = await deletedList(U.admin);
    const mine = rows.find((r) => r.file_id === k.scanB)!;
    expect(mine).toMatchObject({
      kind: 'document',
      label: 'scan-b.pdf',
      delete_reason: 'Quét nhầm giấy khác',
      deleted_by: U.admin,
      case_id: k.c,
      domain: 'vibang',
      days_left: 30,
    });
    expect(mine.case_number).toMatch(/\/VB-TPL$/);
    expect(await deletedList(U.thv)).toEqual([]);
    expect(await deletedList(U.clerk)).toEqual([]);
    expect(await deletedList(U.adminB, OFF)).toEqual([]);

    const dl = await dlDeleted(U.admin, 'document', k.scanB);
    expect(dl.length).toBe(1);
    expect(dl[0]).toMatchObject({ label: 'scan-b.pdf', mime: 'application/pdf', version: 1 });
    expect(await dlDeleted(U.thv, 'document', k.scanB)).toEqual([]);
    expect(await dlDeleted(U.adminB, 'document', k.scanB)).toEqual([]);
    expect(await dlDeleted(U.admin, 'document', k.scanA)).toEqual([]); // chưa xóa: không phải file đã xóa
    expect(await auditCount('dms.scan.download_deleted', k.scanB)).toBe(1);
    // Không có đường khôi phục: không hàm nào tên restore/undelete, và không bỏ được dấu vết xóa.
    const fns = await owner.query(
      `SELECT proname FROM pg_proc WHERE proname ~ '(restore|undelete|recover)' AND pronamespace = 'public'::regnamespace`,
    );
    expect(fns.rows).toEqual([]);
    await expect(
      call(T, `UPDATE dms_document_files SET deleted_at = NULL WHERE id = $1`, [k.scanB]),
    ).rejects.toThrow();
  });

  it('OCR: file đã xóa bị loại khỏi chỉ mục tìm kiếm và không được nhận dạng nữa', async () => {
    const k = await mkRecordedCase();
    const ver = async (file: string) =>
      (await call(T, 'SELECT id FROM dms_document_versions WHERE file_id = $1', [file]))[0]
        .id as string;
    const va = await ver(k.scanA);
    const vb = await ver(k.scanB);
    for (const v of [va, vb])
      await owner.query(
        `INSERT INTO dms_ocr_results (tenant_id, version_id, status, search_text, ocr_text) VALUES ($1,$2,'DONE','cong van mat','Công văn mật')`,
        [T, v],
      );
    const inIndex = async (v: string) =>
      Number(
        (
          await owner.query(
            `SELECT count(*) AS n FROM dms_ocr_search_index WHERE version_id = $1`,
            [v],
          )
        ).rows[0].n,
      );
    expect(await inIndex(va)).toBe(1);
    expect(await inIndex(vb)).toBe(1);
    const search = () =>
      call(T, `SELECT * FROM dms_ocr_search($1,$2,$3,NULL,'mat',20)`, [T, U.admin, OFF]);
    expect((await search()).filter((r) => r.case_id === k.c).length).toBe(2);

    expect((await del(U.admin, 'document', k.scanA)).ok).toBe(true);
    expect(await inIndex(va)).toBe(0);
    expect(await inIndex(vb)).toBe(1);
    expect((await search()).filter((r) => r.case_id === k.c).map((r) => r.file_label)).toEqual([
      'scan-b.pdf',
    ]);
    // OCR hoàn tất muộn cho file đã xóa cũng không vào chỉ mục.
    await owner.query(
      `UPDATE dms_ocr_results SET search_text = 'cong van mat 2' WHERE version_id = $1`,
      [va],
    );
    expect(await inIndex(va)).toBe(0);
    // Hàng đợi OCR không nhận việc của file đã xóa.
    const sc = await mkRecordedCase();
    const sv = await ver(sc.scanA);
    await owner.query(
      `INSERT INTO dms_ocr_results (tenant_id, version_id, status) VALUES ($1,$2,'PENDING')`,
      [T, sv],
    );
    expect((await del(U.admin, 'document', sc.scanA)).ok).toBe(true);
    for (let i = 0; i < 6; i += 1) {
      const got = await call(T, 'SELECT * FROM dms_ocr_claim($1)', [T]);
      expect(got.map((g) => g.version_id)).not.toContain(sv);
      expect(got.map((g) => g.version_id)).not.toContain(va);
      if (!got.length) break;
    }
  });

  it('bất biến: không xóa/sửa dòng tệp; chỉ đi một chiều chưa xóa -> đã xóa -> đã dọn', async () => {
    const k = await mkRecordedCase();
    await expect(
      call(T, 'DELETE FROM dms_document_files WHERE id = $1', [k.scanA]),
    ).rejects.toThrow();
    await expect(
      call(T, `UPDATE dms_document_files SET label = 'đổi tên' WHERE id = $1`, [k.scanA]),
    ).rejects.toThrow();
    await expect(
      call(T, `UPDATE dms_document_files SET is_scan = false WHERE id = $1`, [k.scanA]),
    ).rejects.toThrow();
    // Không tự đặt cột xóa sai cách (thiếu người/lý do vi phạm ràng buộc; đặt purged_at khi chưa xóa bị chặn).
    await expect(
      call(T, `UPDATE dms_document_files SET deleted_at = now() WHERE id = $1`, [k.scanA]),
    ).rejects.toThrow();
    await expect(
      call(T, `UPDATE dms_document_files SET purged_at = now() WHERE id = $1`, [k.scanA]),
    ).rejects.toThrow();
    expect((await del(U.admin, 'document', k.scanA)).ok).toBe(true);
    for (const set of [
      `delete_reason = 'sửa lý do'`,
      `purge_after = purge_after + interval '10 days'`,
      `deleted_by = '${U.thv}'`,
      `deleted_at = NULL`,
    ])
      await expect(
        call(T, `UPDATE dms_document_files SET ${set} WHERE id = $1`, [k.scanA]),
      ).rejects.toThrow();
    // Dọn sớm (chưa đến hạn) bị từ chối.
    expect(
      await call(T, `SELECT dms_scan_purge_done($1,'document',$2) AS ok`, [T, k.scanA]),
    ).toEqual([{ ok: false }]);
    // Phiên bản tệp vẫn chỉ ghi thêm.
    await expect(
      call(T, `UPDATE dms_document_versions SET object_key = 'x' WHERE file_id = $1`, [k.scanA]),
    ).rejects.toThrow();
    await expect(
      call(T, 'DELETE FROM dms_document_versions WHERE file_id = $1', [k.scanA]),
    ).rejects.toThrow();
  });

  it('dọn sau 30 ngày: chỉ tệp quá hạn, trả khoá của mọi phiên bản, idempotent, ghi nhật ký, rồi không tải được nữa', async () => {
    const k = await mkRecordedCase();
    const keyOf = async (file: string) =>
      (
        await call(T, 'SELECT object_key FROM dms_document_versions WHERE file_id = $1', [file])
      ).map((r) => r.object_key as string);
    expect((await del(U.admin, 'document', k.scanA)).ok).toBe(true);
    expect((await del(U.admin, 'document', k.scanB)).ok).toBe(true);
    const due = () => call(T, 'SELECT * FROM dms_scan_purge_due($1,100)', [T]);
    expect((await due()).filter((r) => r.file_id === k.scanA)).toEqual([]);
    expect(
      await call(T, `SELECT dms_scan_purge_done($1,'document',$2) AS ok`, [T, k.scanA]),
    ).toEqual([{ ok: false }]);

    await backdate('dms_document_files', k.scanA);
    const d1 = (await due()).filter((r) => r.file_id === k.scanA);
    expect(d1.map((r) => r.object_key)).toEqual(await keyOf(k.scanA));
    expect((await due()).filter((r) => r.file_id === k.scanB)).toEqual([]);
    // Đã quá hạn: không còn tải được.
    expect(await dlDeleted(U.admin, 'document', k.scanA)).toEqual([]);

    expect(
      await call(T, `SELECT dms_scan_purge_done($1,'document',$2) AS ok`, [T, k.scanA]),
    ).toEqual([{ ok: true }]);
    expect(
      await call(T, `SELECT dms_scan_purge_done($1,'document',$2) AS ok`, [T, k.scanA]),
    ).toEqual([{ ok: false }]);
    expect(await auditCount('dms.scan.purge', k.scanA)).toBe(1);
    expect((await due()).filter((r) => r.file_id === k.scanA)).toEqual([]);
    expect((await deletedList(U.admin)).find((r) => r.file_id === k.scanA)).toBeUndefined();
    expect((await deletedList(U.admin)).find((r) => r.file_id === k.scanB)).toBeDefined();
    // Đã dọn là cuối cùng.
    await expect(
      call(T, `UPDATE dms_document_files SET purged_at = NULL WHERE id = $1`, [k.scanA]),
    ).rejects.toThrow();
    // Dòng ghi nhận còn mãi; hồ sơ không đổi.
    expect(
      (await call(T, 'SELECT id FROM dms_document_files WHERE id = $1', [k.scanA])).length,
    ).toBe(1);
    expect((await caseRow(U.admin, k.c)).status).toBe('RECORDED');
    // Loại không hợp lệ.
    expect(await call(T, `SELECT dms_scan_purge_done($1,'khac',$2) AS ok`, [T, k.scanA])).toEqual([
      { ok: false },
    ]);
  });

  it('file của bản trình: người trình không tự xóa; Admin xóa; biến khỏi đếm/danh sách/tải; vào Scan đã xóa; dọn được', async () => {
    const stage = async (u: string) =>
      (await op(T, 'dms_stage_upload', [T, u, key(), sha(), 'application/pdf', 99])).label!;
    const s1 = await stage(U.thv);
    const s2 = await stage(U.thv);
    const sub = (
      await op(T, 'dms_submission_create', [
        T,
        U.thv,
        OFF,
        'Tờ trình có scan',
        'mô tả',
        null,
        [s1, s2],
        ['t1.pdf', 't2.pdf'],
      ])
    ).label!;
    const files = () =>
      call(T, 'SELECT * FROM dms_submission_files_list($1,$2,$3)', [T, U.thv, sub]);
    const f1 = (await files()).find((f) => f.label === 't1.pdf')!.id as string;

    expect((await del(U.thv, 'submission', f1)).code).toBe('PERMISSION_DENIED');
    expect((await del(U.clerk, 'submission', f1)).code).toBe('FILE_NOT_FOUND');
    expect((await del(U.admin, 'submission', f1, ' ')).code).toBe('REASON_REQUIRED');
    expect((await del(U.admin, 'submission', f1, 'Đính kèm nhầm')).code).toBe('SCAN_DELETED');
    expect((await del(U.admin, 'submission', f1)).code).toBe('ALREADY_DELETED');

    expect((await files()).map((f) => f.label)).toEqual(['t2.pdf']);
    const detail = (
      await call(T, 'SELECT * FROM dms_submission_get($1,$2,$3)', [T, U.admin, sub])
    )[0];
    expect(detail).toMatchObject({ file_count: 1, status: 'PENDING', title: 'Tờ trình có scan' });
    const lst = await call(T, 'SELECT * FROM dms_submission_list($1,$2,$3,NULL,NULL,50,0)', [
      T,
      U.admin,
      OFF,
    ]);
    expect(lst.find((r) => r.id === sub).file_count).toBe(1);
    expect(
      await call(T, 'SELECT * FROM dms_submission_file_download($1,$2,$3)', [T, U.admin, f1]),
    ).toEqual([]);

    const mine = (await deletedList(U.admin)).find((r) => r.file_id === f1)!;
    expect(mine).toMatchObject({
      kind: 'submission',
      submission_id: sub,
      submission_title: 'Tờ trình có scan',
      delete_reason: 'Đính kèm nhầm',
      case_id: null,
    });
    expect((await dlDeleted(U.admin, 'submission', f1))[0]).toMatchObject({
      label: 't1.pdf',
      version: 1,
    });
    expect(await dlDeleted(U.thv, 'submission', f1)).toEqual([]);

    await backdate('dms_submission_files', f1);
    const due = await call(T, 'SELECT * FROM dms_scan_purge_due($1,100)', [T]);
    expect(due.filter((r) => r.file_id === f1).map((r) => r.kind)).toEqual(['submission']);
    expect(await call(T, `SELECT dms_scan_purge_done($1,'submission',$2) AS ok`, [T, f1])).toEqual([
      { ok: true },
    ]);
    expect((await deletedList(U.admin)).find((r) => r.file_id === f1)).toBeUndefined();
    // Bản trình không bị xóa, tệp còn lại nguyên.
    expect((await call(T, 'SELECT id FROM dms_submissions WHERE id = $1', [sub])).length).toBe(1);
    expect((await files()).length).toBe(1);
  });

  it('cô lập tenant: tenant khác không xóa, không xem, không dọn được tệp của tenant này', async () => {
    const k = await mkRecordedCase();
    expect((await op(T2, 'dms_scan_delete', [T2, U.foreign, 'document', k.scanA, 'x'])).code).toBe(
      'FILE_NOT_FOUND',
    );
    expect((await del(U.admin, 'document', k.scanA)).ok).toBe(true);
    expect(
      await call(T2, 'SELECT * FROM dms_deleted_scans_list($1,$2,$3,50,0)', [T2, U.foreign, OFF2]),
    ).toEqual([]);
    expect(
      await call(T2, 'SELECT * FROM dms_deleted_scan_download($1,$2,$3,$4)', [
        T2,
        U.foreign,
        'document',
        k.scanA,
      ]),
    ).toEqual([]);
    expect(await call(T2, 'SELECT * FROM dms_scan_purge_due($1,100)', [T2])).toEqual([]);
    expect(
      await call(T2, `SELECT dms_scan_purge_done($1,'document',$2) AS ok`, [T2, k.scanA]),
    ).toEqual([{ ok: false }]);
  });
});
