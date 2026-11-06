import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS (0115): nhật ký phân quyền gộp vào Lịch sử hoạt động. PostgreSQL thật, dữ liệu giả lập.
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

describe.skipIf(!ADMIN_URL)('DMS nhật ký phân quyền (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  // boss: vai ADMIN; member: thành viên thường; inAdminGroup: thuộc nhóm Admin hệ thống; proposer: chỉ có quyền đề xuất.
  const U = { boss: id(), member: id(), inAdminGroup: id(), proposer: id() };
  let adminGroup = '';

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
    // Văn phòng tạo SAU migration cũng tự có nhóm Admin (trigger).
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [OFF, T]);
    for (const [name, uid] of Object.entries(U)) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        uid,
      ]);
      await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4)`,
        [T, uid, OFF, name === 'boss' ? 'ADMIN' : 'THANH_VIEN'],
      );
    }
    adminGroup = (
      await owner.query(
        `SELECT id FROM dms_permission_groups WHERE tenant_id = $1 AND office_id = $2 AND kind = 'SYSTEM'`,
        [T, OFF],
      )
    ).rows[0].id;
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, adminGroup, U.inAdminGroup],
    );
    const proposerGroup = (
      await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'Đề xuất') RETURNING id`,
        [T, OFF],
      )
    ).rows[0].id;
    await owner.query(
      `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,'dms.permission.propose')`,
      [T, proposerGroup],
    );
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, proposerGroup, U.proposer],
    );
    const staff = (
      await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'Nhân viên') RETURNING id`,
        [T, OFF],
      )
    ).rows[0].id;
    for (const p of ['vibang.read.own', 'vibang.draft.own'])
      await owner.query(
        `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
        [T, staff, p],
      );
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, staff, U.member],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const activity = (actor: string, group: string | null) =>
    call(`SELECT action, target_type FROM dms_activity_list($1,$2,$3,$4,NULL,100,0)`, [
      T,
      actor,
      OFF,
      group,
    ]);

  it('thao tác quản trị thành công được chép vào Lịch sử hoạt động (nhóm permission)', async () => {
    const b = await op('ad_branch_create', [T, U.boss, OFF, 'Chi nhánh Một']);
    expect(b.ok).toBe(true);
    const rows = await activity(U.boss, 'permission');
    const row = rows.find((r) => r.action === 'ad.branch.create');
    expect(row?.target_type).toBe('branch');
    // Không chép lần thất bại.
    await op('ad_branch_create', [T, U.member, OFF, 'Chi nhánh Hai']);
    expect(
      (await activity(U.boss, 'permission')).filter((r) => r.action === 'ad.branch.create'),
    ).toHaveLength(1);
  });

  it('người có quyền duyệt thay đổi quyền xem được nhật ký; người chỉ có quyền đề xuất thì không', async () => {
    expect((await activity(U.inAdminGroup, 'permission')).length).toBeGreaterThan(0);
    expect(await activity(U.proposer, 'permission')).toEqual([]);
    expect(await activity(U.member, null)).toEqual([]);
  });

  it('đổi quyền nhóm trực tiếp chỉ dành cho người có quyền duyệt và có dòng nhật ký', async () => {
    const g = (
      await call(
        `SELECT id FROM dms_permission_groups WHERE tenant_id = $1 AND name = 'Nhân viên'`,
        [T],
      )
    )[0].id as string;
    const denied = await op('dms_group_change', [
      T,
      U.proposer,
      g,
      'GRANT',
      'vibang.read.all',
      null,
      'x',
    ]);
    expect(denied.ok).toBe(false);
    const done = await op('dms_group_change', [
      T,
      U.boss,
      g,
      'GRANT',
      'vibang.read.all',
      null,
      'cần xem toàn bộ',
    ]);
    expect(done.ok).toBe(true);
    expect(
      (await activity(U.boss, 'permission')).some((r) => r.action === 'dms.permission.apply'),
    ).toBe(true);
  });
});
