import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS (0138): Admin hủy hồ sơ đã ghi sổ (4 nghiệp vụ). PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsv_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS Admin hủy hồ sơ (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  const U = { a: id(), admin: id() };

  const call = async (sql: string, args: unknown[]) => {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [T]);
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
  const op = async (fn: string, args: unknown[]) => {
    const rows = await call(
      `SELECT (r).ok, (r).code, (r).label FROM (SELECT ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS r) q`,
      args,
    );
    return rows[0] as { ok: boolean; code: string; label: string | null };
  };
  const mkRecorded = async (domain: string, attrs: Record<string, string> = {}) => {
    const c = (
      await op('dms_case_create_draft', [
        T,
        U.a,
        OFF,
        domain,
        `Hồ sơ ${domain}`,
        JSON.stringify(attrs),
      ])
    ).label!;
    expect(await op('dms_case_record', [T, U.a, c])).toMatchObject({ ok: true });
    return c;
  };
  const extras = async (u: string, c: string) =>
    (await call('SELECT * FROM dms_case_extras($1,$2,$3)', [T, u, [c]]))[0];

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
    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A')`, [T]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [OFF, T]);
    for (const uid of [U.a, U.admin])
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        uid,
      ]);
    const domains = ['vibang', 'tongdat', 'xacminh', 'tochuc'];
    const group = async (name: string, perms: string[], user: string) => {
      const g = await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,$3) RETURNING id`,
        [T, OFF, name],
      );
      for (const p of perms)
        await owner.query(
          `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
          [T, g.rows[0].id, p],
        );
      await owner.query(
        `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
        [T, g.rows[0].id, user],
      );
    };
    const all = domains.flatMap((d) =>
      ['read', 'draft', 'confirm', 'add_document', 'download'].map((a) => `${d}.${a}.all`),
    );
    await group('THV', all, U.a);
    await group('Quản trị thử', [...all, 'dms.permission.approve'], U.admin);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const NOTE: Record<string, string> = {
    vibang: 'Đã hủy vi bằng',
    tongdat: 'Đã hủy tống đạt',
    xacminh: 'Đã hủy xác minh',
    tochuc: 'Đã hủy tổ chức thi hành án',
  };

  it.each(['vibang', 'tongdat', 'xacminh', 'tochuc'])(
    '%s: Admin hủy, hàng hồ sơ và STT giữ nguyên, ghi chú hiện chữ hủy',
    async (domain) => {
      const c = await mkRecorded(domain);
      const before = (await call('SELECT * FROM dms_case_files WHERE id = $1', [c]))[0];
      const sttBefore = await call('SELECT stt FROM dms_book_entries WHERE case_id = $1', [c]);
      expect(await op('dms_case_void', [T, U.admin, c, 'Nhập nhầm'])).toMatchObject({ ok: true });
      expect((await call('SELECT * FROM dms_case_files WHERE id = $1', [c]))[0]).toEqual(before);
      expect(await call('SELECT stt FROM dms_book_entries WHERE case_id = $1', [c])).toEqual(
        sttBefore,
      );
      expect(await extras(U.admin, c)).toMatchObject({
        voided: true,
        void_note: NOTE[domain],
        void_reason: 'Nhập nhầm',
      });
      expect(await extras(U.a, c)).toMatchObject({ voided: true });
      const log = await call(
        `SELECT 1 FROM dms_audit_records WHERE target_id = $1 AND action = 'dms.case.void'`,
        [c],
      );
      expect(log).toHaveLength(1);
    },
  );

  it('người không phải Admin bị từ chối, hồ sơ chưa bị đánh dấu', async () => {
    const c = await mkRecorded('vibang');
    expect(await op('dms_case_void', [T, U.a, c, 'x'])).toMatchObject({
      ok: false,
      code: 'ADMIN_ONLY',
    });
    expect((await extras(U.a, c)).voided).toBe(false);
  });

  it('bản nháp, thiếu lý do, hủy lần hai đều bị từ chối', async () => {
    const d = (await op('dms_case_create_draft', [T, U.a, OFF, 'vibang', 'Nháp', '{}'])).label!;
    expect(await op('dms_case_void', [T, U.admin, d, 'x'])).toMatchObject({ ok: false });
    const c = await mkRecorded('vibang');
    expect(await op('dms_case_void', [T, U.admin, c, '  '])).toMatchObject({
      ok: false,
      code: 'REASON_REQUIRED',
    });
    expect(await op('dms_case_void', [T, U.admin, c, 'ok'])).toMatchObject({ ok: true });
    expect(await op('dms_case_void', [T, U.admin, c, 'ok'])).toMatchObject({
      ok: false,
      code: 'CASE_VOIDED',
    });
  });

  it('hồ sơ đã hủy bị chặn thêm tài liệu và đánh dấu trả kết quả; dòng hủy chỉ ghi thêm', async () => {
    const c = await mkRecorded('vibang');
    expect(await op('dms_case_void', [T, U.admin, c, 'ok'])).toMatchObject({ ok: true });
    expect(await op('dms_document_add', [T, U.a, c, 'Khác', 'Tệp', false])).toMatchObject({
      ok: false,
      code: 'CASE_VOIDED',
    });
    expect(await op('dms_case_set_returned', [T, U.a, c, true])).toMatchObject({
      ok: false,
      code: 'CASE_VOIDED',
    });
    await expect(
      owner.query('DELETE FROM dms_case_voids WHERE case_id = $1', [c]),
    ).rejects.toThrow();
    await expect(
      owner.query(`UPDATE dms_case_voids SET reason = 'y' WHERE case_id = $1`, [c]),
    ).rejects.toThrow();
  });
});
