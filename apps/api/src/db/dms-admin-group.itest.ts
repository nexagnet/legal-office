import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS (0112): nhóm Admin hệ thống, chỉ Admin tạo/xóa nhóm, quyền riêng không cần lý do. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsg_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS nhóm Admin và quyền riêng (PostgreSQL)', () => {
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

  it('mỗi văn phòng có đúng một nhóm Admin hệ thống, đủ quyền gán được trừ quyền chỉ cấp riêng', async () => {
    const perms = (
      await owner.query(`SELECT permission FROM dms_group_permissions WHERE group_id = $1`, [
        adminGroup,
      ])
    ).rows.map((r) => r.permission as string);
    expect(perms).toHaveLength(91); // 84 quyền nghiệp vụ + 7 quyền đặc biệt (trừ dms.scan.delete)
    expect(perms).not.toContain('dms.scan.delete');
    expect(perms).toContain('dms.permission.approve');
    const n = await owner.query(
      `SELECT count(*)::int AS n FROM dms_permission_groups WHERE tenant_id = $1 AND office_id = $2 AND kind = 'SYSTEM'`,
      [T, OFF],
    );
    expect(n.rows[0].n).toBe(1);
  });

  it('nhóm Admin không xóa được, không đổi tên / trạng thái, quyền cố định', async () => {
    expect(await op('dms_group_delete', [T, U.boss, adminGroup])).toMatchObject({
      ok: false,
      code: 'ADMIN_GROUP_PROTECTED',
    });
    await expect(
      owner.query(`DELETE FROM dms_permission_groups WHERE id = $1`, [adminGroup]),
    ).rejects.toThrow(/không xóa được/);
    await expect(
      owner.query(`UPDATE dms_permission_groups SET name = 'X' WHERE id = $1`, [adminGroup]),
    ).rejects.toThrow(/không đổi tên/);
    await expect(
      owner.query(
        `UPDATE dms_permission_groups SET status = 'RETIRED', retired_at = now() WHERE id = $1`,
        [adminGroup],
      ),
    ).rejects.toThrow(/không đổi tên/);
    await expect(
      owner.query(`DELETE FROM dms_group_permissions WHERE group_id = $1`, [adminGroup]),
    ).rejects.toThrow(/cố định/);
  });

  it('tài khoản vai ADMIN và tài khoản thuộc nhóm Admin không chỉnh quyền riêng được', async () => {
    expect(
      await op('dms_user_overrides_apply', [T, U.proposer, OFF, U.boss, [], null]),
    ).toMatchObject({ ok: false, code: 'ADMIN_ONLY' });
    expect(
      await op('dms_user_overrides_apply', [
        T,
        U.boss,
        OFF,
        U.inAdminGroup,
        ['vibang.read.all'],
        null,
      ]),
    ).toMatchObject({ ok: false, code: 'ADMIN_TARGET' });
    // Người khác vẫn chỉnh được, và không cần lý do.
    expect(
      await op('dms_user_overrides_apply', [
        T,
        U.boss,
        OFF,
        U.member,
        ['vibang.read.own', 'vibang.draft.own', 'vibang.read.all'],
        null,
      ]),
    ).toMatchObject({ ok: true, code: 'OVERRIDES_APPLIED' });
  });

  it('lý do trống được thay bằng câu mặc định; có lý do thì lưu đúng lý do', async () => {
    const rows = await owner.query(
      `SELECT reason FROM dms_user_permission_overrides WHERE user_id = $1 AND ended_at IS NULL`,
      [U.member],
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    expect(rows.rows[0].reason).toBe('Quản trị viên điều chỉnh quyền riêng');
    const withReason = await op('dms_user_overrides_apply', [
      T,
      U.boss,
      OFF,
      U.member,
      ['vibang.read.own', 'vibang.draft.own'],
      'Chuyển bộ phận',
    ]);
    expect(withReason).toMatchObject({ ok: true });
    const ended = await owner.query(
      `SELECT end_reason FROM dms_user_permission_overrides WHERE user_id = $1 AND ended_at IS NOT NULL`,
      [U.member],
    );
    expect(ended.rows[0].end_reason).toBe('Chuyển bộ phận');
  });

  it('chỉ Admin tạo, sao chép, xóa nhóm; nhóm trống tự tạo xóa được; có thành viên thì không', async () => {
    expect(
      await op('dms_group_create', [T, U.proposer, OFF, 'Nhóm của người đề xuất']),
    ).toMatchObject({ ok: false, code: 'PERMISSION_DENIED' });
    const made = await op('dms_group_create', [T, U.boss, OFF, 'Nhóm mới']);
    expect(made).toMatchObject({ ok: true, code: 'GROUP_CREATED' });
    expect(await op('dms_group_copy', [T, U.proposer, adminGroup, 'Bản sao'])).toMatchObject({
      ok: false,
      code: 'GROUP_NOT_FOUND',
    });
    expect(await op('dms_group_delete', [T, U.proposer, made.label])).toMatchObject({
      ok: false,
      code: 'GROUP_NOT_FOUND',
    });
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, made.label, U.member],
    );
    expect(await op('dms_group_delete', [T, U.boss, made.label])).toMatchObject({
      ok: false,
      code: 'GROUP_HAS_MEMBERS',
    });
    await owner.query(`DELETE FROM dms_group_members WHERE group_id = $1`, [made.label]);
    expect(await op('dms_group_delete', [T, U.boss, made.label])).toMatchObject({
      ok: true,
      code: 'GROUP_DELETED',
    });
    const gone = await owner.query(`SELECT 1 FROM dms_permission_groups WHERE id = $1`, [
      made.label,
    ]);
    expect(gone.rowCount).toBe(0);
  });

  it('sao chép nhóm Admin không mang theo quyền quản trị phân quyền', async () => {
    const copy = await op('dms_group_copy', [T, U.boss, adminGroup, 'Bản sao Admin']);
    expect(copy).toMatchObject({ ok: true });
    const perms = (
      await owner.query(`SELECT permission FROM dms_group_permissions WHERE group_id = $1`, [
        copy.label,
      ])
    ).rows.map((r) => r.permission as string);
    expect(perms.length).toBeGreaterThan(80);
    expect(
      perms.filter(
        (p) =>
          p.startsWith('dms.permission.') ||
          p === 'dms.amendment.approve' ||
          p === 'dms.audit.export',
      ),
    ).toEqual([]);
  });
});
