import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS (0116): hồ sơ lao động gắn với tài khoản. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_plink_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('Hồ sơ lao động gắn tài khoản (PostgreSQL)', () => {
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

  let branch = '';
  const save = (actor: string, person: string | null, name: string, user: string | null) =>
    op('of_personnel_save', [
      T,
      actor,
      OFF,
      person,
      branch,
      name,
      'M',
      null,
      null,
      null,
      false,
      false,
      null,
      null,
      null,
      null,
      null,
      null,
      'ACTIVE',
      user,
    ]);
  const forUser = (actor: string, user: string) =>
    call(`SELECT * FROM of_personnel_for_user($1,$2,$3,$4)`, [T, actor, OFF, user]);

  it('lưu hồ sơ kèm tài khoản, giữ liên kết khi sửa, một tài khoản chỉ một hồ sơ', async () => {
    branch = (await op('ad_branch_create', [T, U.boss, OFF, 'Chi nhánh lao động'])).label as string;
    const first = await save(U.boss, null, 'Nguyễn Văn A', U.member);
    expect(first.ok).toBe(true);
    const person = first.label as string;
    expect((await forUser(U.boss, U.member))[0]?.full_name).toBe('Nguyễn Văn A');
    // Sửa không nêu tài khoản thì vẫn giữ liên kết, version tăng.
    expect((await save(U.boss, person, 'Nguyễn Văn A (sửa)', null)).ok).toBe(true);
    const again = await forUser(U.boss, U.member);
    expect(again[0]?.version).toBe(2);
    // Hồ sơ khác không gắn trùng tài khoản.
    const dup = await save(U.boss, null, 'Người khác', U.member);
    expect(dup.ok).toBe(false);
    expect(dup.code).toBe('USER_ALREADY_LINKED');
  });

  it('ghép tay hồ sơ cũ chưa có tài khoản, rồi gỡ ra; người thường không đọc/ghép được', async () => {
    const old = await save(U.boss, null, 'Hồ sơ cũ', null);
    const person = old.label as string;
    const unlinked = await call(`SELECT * FROM of_personnel_unlinked($1,$2,$3)`, [T, U.boss, OFF]);
    expect(unlinked.some((r) => r.person_id === person)).toBe(true);
    expect((await op('of_personnel_link', [T, U.member, OFF, person, U.inAdminGroup])).ok).toBe(
      false,
    );
    expect((await op('of_personnel_link', [T, U.boss, OFF, person, U.inAdminGroup])).ok).toBe(true);
    expect((await forUser(U.boss, U.inAdminGroup))[0]?.person_id).toBe(person);
    expect((await op('of_personnel_link', [T, U.boss, OFF, person, null])).ok).toBe(true);
    expect(await forUser(U.boss, U.inAdminGroup)).toEqual([]);
    expect(await forUser(U.member, U.inAdminGroup)).toEqual([]);
  });
});
