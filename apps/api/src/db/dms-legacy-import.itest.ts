import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Nhập tài liệu cũ (0085): đợt nhập, đăng ký tệp, chống trùng, bất biến, quyền theo Nhóm quyền. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsl_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const sha = (c: string) => c.repeat(64).slice(0, 64);

describe.skipIf(!ADMIN_URL)('Nhập tài liệu cũ (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF2 = id();
  const OFFB = id();
  const U = { imp: id(), rd: id(), none: id(), foreign: id() };

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
  const key = async (tenant: string, office: string, h: string) =>
    (await call(tenant, `SELECT dms_legacy_object_key($1,$2,$3) AS k`, [tenant, office, h]))[0]
      .k as string;
  const register = async (
    actor: string,
    batch: string,
    path: string,
    h: string,
    size = 10,
    office = OFF,
  ) =>
    op(T, 'dms_legacy_register', [
      T,
      actor,
      batch,
      path,
      size,
      h,
      'application/pdf',
      '2020-05-01T00:00:00Z',
      await key(T, office, h),
    ]);
  const openBatch = async (actor = U.imp, office = OFF) =>
    (await op(T, 'dms_legacy_batch_open', [T, actor, office, 'Kho cũ 2015-2020', 'D:\\Luu tru']))
      .label!;

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
      [OFF, T, OFFB, OFF2, T2],
    );
    for (const [uid, tenant] of [
      [U.imp, T],
      [U.rd, T],
      [U.none, T],
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
    await group(T, OFF, 'Nhập cũ', ['dms.legacy.import'], [U.imp]);
    await group(T, OFF, 'Xem cũ', ['dms.legacy.read'], [U.rd]);
    await group(T2, OFF2, 'Nhập cũ B', ['dms.legacy.import', 'dms.legacy.read'], [U.foreign]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('chỉ người có dms.legacy.import mới mở được đợt; người khác và văn phòng khác bị từ chối', async () => {
    expect((await op(T, 'dms_legacy_batch_open', [T, U.none, OFF, 'x', null])).code).toBe(
      'PERMISSION_DENIED',
    );
    expect((await op(T, 'dms_legacy_batch_open', [T, U.rd, OFF, 'x', null])).code).toBe(
      'PERMISSION_DENIED',
    );
    expect((await op(T, 'dms_legacy_batch_open', [T, U.imp, OFFB, 'x', null])).code).toBe(
      'PERMISSION_DENIED',
    );
    expect((await op(T, 'dms_legacy_batch_open', [T, U.imp, OFF, '  ', null])).code).toBe(
      'INVALID_INPUT',
    );
    const r = await op(T, 'dms_legacy_batch_open', [T, U.imp, OFF, 'Kho cũ', 'D:\\Luu tru']);
    expect(r).toMatchObject({ ok: true, code: 'LEGACY_BATCH_OPENED' });
  });

  it('đăng ký tệp giữ nguyên cấu trúc thư mục và đánh dấu tài liệu cũ', async () => {
    const b = await openBatch();
    const r = await register(U.imp, b, '2016/Vi bang/HS-001/bien-ban.pdf', sha('a'));
    expect(r).toMatchObject({ ok: true, code: 'LEGACY_FILE_REGISTERED' });
    const row = (
      await call(
        T,
        `SELECT rel_path, file_name, is_legacy, object_key FROM dms_legacy_files WHERE id = $1`,
        [r.label],
      )
    )[0];
    expect(row.rel_path).toBe('2016/Vi bang/HS-001/bien-ban.pdf');
    expect(row.file_name).toBe('bien-ban.pdf');
    expect(row.is_legacy).toBe(true);
    expect(row.object_key).toBe(await key(T, OFF, sha('a')));
  });

  it('đăng ký lại cùng đường dẫn cùng nội dung là thành công không ghi lại; khác nội dung bị từ chối, không ghi đè', async () => {
    const b = await openBatch();
    const first = await register(U.imp, b, 'a/b.pdf', sha('1'));
    const again = await register(U.imp, b, 'a/b.pdf', sha('1'));
    expect(again).toMatchObject({
      ok: true,
      code: 'LEGACY_FILE_ALREADY_REGISTERED',
      label: first.label,
    });
    expect((await register(U.imp, b, 'a/b.pdf', sha('2'))).code).toBe('PATH_CONFLICT');
    const n = await call(T, `SELECT count(*)::int AS n FROM dms_legacy_files WHERE batch_id = $1`, [
      b,
    ]);
    expect(n[0].n).toBe(1);
  });

  it('từ chối đường dẫn nguy hiểm và khoá đối tượng do client tự chọn', async () => {
    const b = await openBatch();
    for (const p of ['/abs.pdf', '../x.pdf', 'a/../x.pdf', 'a\\b.pdf', 'dir/', ' ']) {
      expect((await register(U.imp, b, p, sha('3'))).code).toBe('INVALID_INPUT');
    }
    const bad = await op(T, 'dms_legacy_register', [
      T,
      U.imp,
      b,
      'ok.pdf',
      1,
      sha('3'),
      'application/pdf',
      null,
      't/x/evil',
    ]);
    expect(bad.code).toBe('INVALID_OBJECT_KEY');
    // Khoá của văn phòng khác cũng bị từ chối.
    const other = await op(T, 'dms_legacy_register', [
      T,
      U.imp,
      b,
      'ok.pdf',
      1,
      sha('3'),
      'application/pdf',
      null,
      await key(T, OFFB, sha('3')),
    ]);
    expect(other.code).toBe('INVALID_OBJECT_KEY');
  });

  it('hash đã có trong văn phòng được báo để bỏ qua tải lại; không lộ hash của tenant/văn phòng khác', async () => {
    const b = await openBatch();
    await register(U.imp, b, 'x/1.pdf', sha('4'), 77);
    const rows = await call(
      T,
      `SELECT sha256, size_bytes::int AS s FROM dms_legacy_known_hashes($1,$2,$3,$4)`,
      [T, U.imp, OFF, [sha('4'), sha('5')]],
    );
    expect(rows).toEqual([{ sha256: sha('4'), s: 77 }]);
    expect(
      await call(T, `SELECT * FROM dms_legacy_known_hashes($1,$2,$3,$4)`, [
        T,
        U.none,
        OFF,
        [sha('4')],
      ]),
    ).toEqual([]);
  });

  it('đóng đợt: không thêm tệp được nữa, không đóng lại, không xoá hay sửa', async () => {
    const b = await openBatch();
    await register(U.imp, b, 'k/1.pdf', sha('6'));
    expect((await op(T, 'dms_legacy_batch_close', [T, U.none, b])).ok).toBe(false);
    expect(await op(T, 'dms_legacy_batch_close', [T, U.imp, b])).toMatchObject({
      ok: true,
      code: 'LEGACY_BATCH_CLOSED',
    });
    expect((await op(T, 'dms_legacy_batch_close', [T, U.imp, b])).code).toBe('BATCH_CLOSED');
    expect((await register(U.imp, b, 'k/2.pdf', sha('7'))).code).toBe('BATCH_CLOSED');
    // Chặn cả khi ghi thẳng bảng.
    await expect(
      call(
        T,
        `INSERT INTO dms_legacy_files (tenant_id, office_id, batch_id, rel_path, file_name, size_bytes, sha256, mime, object_key, created_by)
               VALUES ($1,$2,$3,'z.pdf','z.pdf',1,$4,'application/pdf','k',$5)`,
        [T, OFF, b, sha('8'), U.imp],
      ),
    ).rejects.toThrow(/closed legacy batch/);
    await expect(
      call(T, `DELETE FROM dms_legacy_files WHERE batch_id = $1`, [b]),
    ).rejects.toThrow();
    await expect(
      call(T, `UPDATE dms_legacy_files SET rel_path = 'q' WHERE batch_id = $1`, [b]),
    ).rejects.toThrow();
    await expect(call(T, `DELETE FROM dms_legacy_batches WHERE id = $1`, [b])).rejects.toThrow();
    await expect(
      call(T, `UPDATE dms_legacy_batches SET label = 'đổi' WHERE id = $1`, [b]),
    ).rejects.toThrow();
    await expect(
      call(T, `UPDATE dms_legacy_batches SET status = 'OPEN' WHERE id = $1`, [b]),
    ).rejects.toThrow();
    await expect(call(T, `TRUNCATE dms_legacy_files`, [])).rejects.toThrow();
    const rep = await call(
      T,
      `SELECT status, file_count::int AS n, total_bytes::int AS t, unique_objects::int AS u FROM dms_legacy_batch_report($1,$2,$3)`,
      [T, U.imp, b],
    );
    expect(rep[0]).toEqual({ status: 'CLOSED', n: 1, t: 10, u: 1 });
  });

  it('xem danh sách và mở tệp cần dms.legacy.read, mỗi lần mở có nhật ký', async () => {
    const b = await openBatch();
    const f = await register(U.imp, b, 'list/2017/h.pdf', sha('9'));
    await register(U.imp, b, 'list/2018/h.pdf', sha('b'));
    await register(U.imp, b, 'other/h.pdf', sha('c'));
    // Người nhập không tự động được xem; người chỉ xem thì không nhập được.
    expect(
      await call(T, `SELECT * FROM dms_legacy_list($1,$2,$3,'list/',50,0)`, [T, U.imp, OFF]),
    ).toEqual([]);
    const rows = await call(T, `SELECT rel_path FROM dms_legacy_list($1,$2,$3,$4,50,0)`, [
      T,
      U.rd,
      OFF,
      'list/',
    ]);
    expect(rows.map((r) => r.rel_path)).toEqual(['list/2017/h.pdf', 'list/2018/h.pdf']);
    // Ký tự đại diện trong tiền tố không khớp lung tung.
    expect(
      await call(T, `SELECT * FROM dms_legacy_list($1,$2,$3,'%',50,0)`, [T, U.rd, OFF]),
    ).toEqual([]);

    const denied = await call(T, `SELECT ok, code FROM dms_legacy_open($1,$2,$3)`, [
      T,
      U.imp,
      f.label,
    ]);
    expect(denied[0]).toEqual({ ok: false, code: 'FILE_NOT_FOUND' });
    const opened = await call(
      T,
      `SELECT ok, object_key, file_name FROM dms_legacy_open($1,$2,$3)`,
      [T, U.rd, f.label],
    );
    expect(opened[0]).toMatchObject({
      ok: true,
      object_key: await key(T, OFF, sha('9')),
      file_name: 'h.pdf',
    });
    const audit = await call(
      T,
      `SELECT count(*)::int AS n FROM dms_audit_records WHERE action = 'dms.legacy.open' AND target_id = $1`,
      [f.label],
    );
    expect(audit[0].n).toBe(1);
    expect(
      (
        await op(T, 'dms_legacy_register', [
          T,
          U.rd,
          b,
          'n.pdf',
          1,
          sha('d'),
          'application/pdf',
          null,
          await key(T, OFF, sha('d')),
        ])
      ).ok,
    ).toBe(false);
  });

  it('cô lập tenant: tenant khác không thấy đợt/tệp của tenant này', async () => {
    const b = await openBatch();
    const f = await register(U.imp, b, 'iso/1.pdf', sha('e'));
    const seen = await call(T2, `SELECT count(*)::int AS n FROM dms_legacy_files`, []);
    expect(seen[0].n).toBe(0);
    const foreignOpen = await call(T2, `SELECT ok FROM dms_legacy_open($1,$2,$3)`, [
      T2,
      U.foreign,
      f.label,
    ]);
    expect(foreignOpen[0].ok).toBe(false);
  });

  it('mã quyền mới được chấp nhận trong Nhóm quyền, mã lạ thì không', async () => {
    const g = await owner.query(
      `SELECT id FROM dms_permission_groups WHERE tenant_id = $1 LIMIT 1`,
      [T],
    );
    await expect(
      owner.query(
        `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,'dms.legacy.delete')`,
        [T, g.rows[0].id],
      ),
    ).rejects.toThrow();
  });
});
