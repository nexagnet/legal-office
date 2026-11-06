import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purgeScansForTenant, purgeScansForTenants, purgeTenantIds } from '../dms/scan-purge';
import { LocalFileStore, type FileStore } from '../storage/file-store';

// DMS GĐ 2c: job dọn file scan đã xóa quá 30 ngày (xóa khỏi kho rồi đánh dấu trong DB). PostgreSQL thật, kho tệp trên đĩa.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmspg_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS job dọn scan hết hạn (PostgreSQL + kho tệp)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const storeDir = mkdtempSync(join(tmpdir(), 'lo-purge-'));
  const store = new LocalFileStore(storeDir);
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF2 = id();
  const U = { admin: id(), member: id(), admin2: id() };
  const logs: string[] = [];
  const log = {
    info: (m: string) => logs.push(`I ${m}`),
    error: (m: string) => logs.push(`E ${m}`),
  };

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
  /** Đặt một đối tượng thật vào kho và tạo bản trình có đúng một scan trỏ vào nó; trả id file và khóa. */
  const mkScan = async (tenant: string, user: string, office: string, tag: string) => {
    const key = `t/${tenant}/dms/staged/${randomUUID()}.pdf`;
    await store.put(key, Buffer.from(`%PDF-1.4\n% ${tag}\n`));
    const staged = (
      await op(tenant, 'dms_stage_upload', [
        tenant,
        user,
        key,
        'a'.repeat(64),
        'application/pdf',
        20,
      ])
    ).label!;
    const sub = (
      await op(tenant, 'dms_submission_create', [
        tenant,
        user,
        office,
        `Bản trình ${tag}`,
        null,
        null,
        [staged],
        [`${tag}.pdf`],
      ])
    ).label!;
    const file = (
      await call(tenant, 'SELECT * FROM dms_submission_files_list($1,$2,$3)', [tenant, user, sub])
    )[0].id as string;
    return { sub, file, key };
  };
  const softDelete = (tenant: string, adminUser: string, file: string) =>
    op(tenant, 'dms_scan_delete', [tenant, adminUser, 'submission', file, 'Dọn thử']);
  /** Chạy một câu lệnh của chủ bảng khi đã tắt trigger bất biến (chỉ để dựng dữ liệu thử). */
  const asOwnerNoTriggers = async (sql: string, args: unknown[]) => {
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await c.query('ALTER TABLE dms_submission_files DISABLE TRIGGER USER');
      await c.query(sql, args);
      await c.query('ALTER TABLE dms_submission_files ENABLE TRIGGER USER');
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  };
  /** Lùi hạn về quá khứ để file được coi là quá 30 ngày. */
  const backdate = (file: string) =>
    asOwnerNoTriggers(
      `UPDATE dms_submission_files SET deleted_at = deleted_at - interval '31 days', purge_after = purge_after - interval '31 days' WHERE id = $1`,
      [file],
    );
  const purgedAt = async (file: string) =>
    (await owner.query('SELECT purged_at FROM dms_submission_files WHERE id = $1', [file])).rows[0]
      .purged_at as Date | null;
  const purgeAudit = async (file: string) =>
    (
      await owner.query(
        `SELECT count(*)::int AS n FROM dms_audit_records WHERE action = 'dms.scan.purge' AND target_id = $1`,
        [file],
      )
    ).rows[0].n as number;

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
    for (const [u, t] of [
      [U.admin, T],
      [U.member, T],
      [U.admin2, T2],
    ]) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        u,
        t,
        u,
      ]);
    }
    await owner.query(
      `INSERT INTO memberships (tenant_id, user_id, office_id, role)
       VALUES ($1,$2,$3,'ADMIN'),($1,$4,$3,'THV'),($5,$6,$7,'ADMIN')`,
      [T, U.admin, OFF, U.member, T2, U.admin2, OFF2],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
    rmSync(storeDir, { recursive: true, force: true });
  });

  it('chưa đủ 30 ngày thì không dọn: đối tượng còn trong kho, DB chưa đánh dấu', async () => {
    const s = await mkScan(T, U.member, OFF, 'chua-het-han');
    expect((await softDelete(T, U.admin, s.file)).ok).toBe(true);
    const r = await purgeScansForTenant(app, store, T, log);
    expect(r).toEqual({ purged: 0, failed: 0 });
    expect(await store.get(s.key)).not.toBeNull();
    expect(await purgedAt(s.file)).toBeNull();
  });

  it('quá hạn: xóa đối tượng khỏi kho, đánh dấu đã dọn, có nhật ký; chạy lại không làm gì; file khác giữ nguyên', async () => {
    const gone = await mkScan(T, U.member, OFF, 'het-han');
    const keep = await mkScan(T, U.member, OFF, 'con-han');
    const live = await mkScan(T, U.member, OFF, 'khong-xoa');
    await softDelete(T, U.admin, gone.file);
    await softDelete(T, U.admin, keep.file);
    await backdate(gone.file);

    const r = await purgeScansForTenant(app, store, T, log);
    expect(r.failed).toBe(0);
    expect(r.purged).toBeGreaterThanOrEqual(1);
    expect(await store.get(gone.key)).toBeNull();
    expect(await purgedAt(gone.file)).not.toBeNull();
    // Chưa hết hạn hoặc chưa xóa thì còn nguyên.
    expect(await store.get(keep.key)).not.toBeNull();
    expect(await store.get(live.key)).not.toBeNull();
    expect(await purgedAt(keep.file)).toBeNull();
    // Bản trình vẫn còn (chỉ file scan bị dọn).
    expect(
      (await owner.query('SELECT 1 FROM dms_submissions WHERE id = $1', [gone.sub])).rowCount,
    ).toBe(1);
    expect(await purgeAudit(gone.file)).toBe(1);
    // Mục Scan đã xóa không còn dòng đã dọn.
    const listed = await call(T, 'SELECT * FROM dms_deleted_scans_list($1,$2,$3,50,0)', [
      T,
      U.admin,
      OFF,
    ]);
    expect(listed.find((x) => x.file_id === gone.file)).toBeUndefined();
    expect(listed.find((x) => x.file_id === keep.file)).toBeDefined();

    const again = await purgeScansForTenant(app, store, T, log);
    expect(again).toEqual({ purged: 0, failed: 0 });
    expect(await purgeAudit(gone.file)).toBe(1);
  });

  it('lỗi kho ở một file: không đánh dấu, các file khác vẫn dọn, lượt sau thử lại thành công', async () => {
    const bad = await mkScan(T, U.member, OFF, 'loi-kho');
    const ok = await mkScan(T, U.member, OFF, 'on-kho');
    for (const s of [bad, ok]) {
      await softDelete(T, U.admin, s.file);
      await backdate(s.file);
    }
    let broken = true;
    const flaky: FileStore = {
      put: (k, b) => store.put(k, b),
      get: (k) => store.get(k),
      delete: async (k) => {
        if (broken && k === bad.key) throw new Error('kho tạm thời lỗi');
        await store.delete(k);
      },
    };
    const first = await purgeScansForTenant(app, flaky, T, log);
    expect(first.failed).toBe(1);
    expect(first.purged).toBeGreaterThanOrEqual(1);
    expect(await purgedAt(bad.file)).toBeNull();
    expect(await purgedAt(ok.file)).not.toBeNull();
    expect(await store.get(ok.key)).toBeNull();
    expect(logs.some((l) => l.startsWith('E') && l.includes(bad.file))).toBe(true);

    broken = false;
    const second = await purgeScansForTenant(app, flaky, T, log);
    expect(second).toEqual({ purged: 1, failed: 0 });
    expect(await purgedAt(bad.file)).not.toBeNull();
    expect(await store.get(bad.key)).toBeNull();
  });

  it('khóa đối tượng ngoài vùng tenant không bao giờ bị xóa', async () => {
    const s = await mkScan(T, U.member, OFF, 'khoa-la');
    const foreign = `t/${T2}/dms/staged/${randomUUID()}.pdf`;
    await store.put(foreign, Buffer.from('%PDF-1.4\n% của tenant khác\n'));
    await asOwnerNoTriggers(`UPDATE dms_submission_files SET object_key = $2 WHERE id = $1`, [
      s.file,
      foreign,
    ]);
    await softDelete(T, U.admin, s.file);
    await backdate(s.file);

    const r = await purgeScansForTenant(app, store, T, log);
    expect(r.failed).toBe(1);
    expect(await store.get(foreign)).not.toBeNull();
    expect(await purgedAt(s.file)).toBeNull();
    // Dọn dẹp để các test sau không vướng dòng lỗi này.
    await asOwnerNoTriggers(`UPDATE dms_submission_files SET purged_at = now() WHERE id = $1`, [
      s.file,
    ]);
  });

  it('cô lập tenant: dọn tenant A không đụng file đã hết hạn của tenant B', async () => {
    const b = await mkScan(T2, U.admin2, OFF2, 'tenant-b');
    await softDelete(T2, U.admin2, b.file);
    await backdate(b.file);
    await purgeScansForTenants(app, store, [T], log);
    expect(await store.get(b.key)).not.toBeNull();
    expect(await purgedAt(b.file)).toBeNull();
    const rb = await purgeScansForTenant(app, store, T2, log);
    expect(rb.purged).toBe(1);
    expect(await store.get(b.key)).toBeNull();
  });

  it('danh sách tenant lấy từ biến môi trường, bỏ ô trống', () => {
    expect(purgeTenantIds({ SCAN_PURGE_TENANT_IDS: ' a, b ,, c ' })).toEqual(['a', 'b', 'c']);
    expect(purgeTenantIds({ REMINDER_TENANT_IDS: 'x' })).toEqual(['x']);
    expect(purgeTenantIds({})).toEqual([]);
  });
});
