import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// 0089: Tạm khóa / mở khóa tài khoản. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_susp_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const HASH = (c: string) => c.repeat(64);

describe.skipIf(!ADMIN_URL)('Tạm khóa tài khoản (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  const U = { adm: id(), staff: id(), approver2: id(), outsider: id() };

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
  const op = async (fn: string, args: unknown[]) =>
    (
      await call(
        `SELECT (r).ok, (r).code, (r).label FROM (SELECT ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS r) q`,
        args,
      )
    )[0] as { ok: boolean; code: string; label: string | null };
  const suspend = (actor: string, user: string, on: boolean, reason: string | null = 'lý do') =>
    op('ad_member_suspend', [T, actor, OFF, user, on, reason]);
  const mine = async (u: string) =>
    (await call('SELECT permission FROM dms_my_permissions($1,$2,$3)', [T, u, OFF])).map(
      (r) => r.permission as string,
    );
  const session = async (token: string) =>
    (await call('SELECT user_id FROM au_session($1,$2)', [T, token])).length;
  const login = (user: string, token: string) => op('au_login_ok', [T, user, token, 60]);
  let work: string;

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
    for (const u of Object.values(U)) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        u,
        T,
        u,
      ]);
    }
    await owner.query(
      `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,'ADMIN')`,
      [T, U.adm, OFF],
    );
    for (const u of [U.staff, U.approver2]) {
      await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,'THANH_VIEN')`,
        [T, u, OFF],
      );
    }
    work = (
      await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name, kind) VALUES ($1,$2,'Văn thư','CUSTOM') RETURNING id`,
        [T, OFF],
      )
    ).rows[0].id as string;
    const approvers = (
      await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name, kind) VALUES ($1,$2,'Người duyệt','CUSTOM') RETURNING id`,
        [T, OFF],
      )
    ).rows[0].id as string;
    for (const [g, p] of [
      [work, 'vtden.read.all'],
      [approvers, 'dms.permission.approve'],
    ] as const) {
      await owner.query(
        `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
        [T, g, p],
      );
    }
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3),($1,$4,$5)`,
      [T, work, U.staff, approvers, U.approver2],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('khóa: thu hồi phiên và quyền hiệu lực, giữ nguyên nhóm; mở khóa thì quyền trở lại', async () => {
    expect((await login(U.staff, HASH('a'))).ok).toBe(true);
    expect(await session(HASH('a'))).toBe(1);
    expect(await mine(U.staff)).toEqual(['vtden.read.all']);

    const r = await suspend(U.adm, U.staff, true, 'Nghỉ việc');
    expect(r).toMatchObject({ ok: true, code: 'MEMBER_SUSPENDED' });
    expect(await session(HASH('a'))).toBe(0);
    expect(await mine(U.staff)).toEqual([]);
    expect(
      (
        await call(`SELECT dms_has_permission($1,$2,$3,'vtden.read.all') AS ok`, [T, U.staff, OFF])
      )[0].ok,
    ).toBe(false);
    // Không xoá gì: nhóm giữ nguyên.
    const groups = await owner.query(`SELECT 1 FROM dms_group_members WHERE user_id = $1`, [
      U.staff,
    ]);
    expect(groups.rowCount).toBe(1);

    const members = await call('SELECT user_id, suspended FROM of_search_members($1,$2,$3)', [
      T,
      U.adm,
      OFF,
    ]);
    expect(members.find((m) => m.user_id === U.staff)?.suspended).toBe(true);
    expect(members.find((m) => m.user_id === U.adm)?.suspended).toBe(false);

    const back = await suspend(U.adm, U.staff, false, 'Quay lại');
    expect(back).toMatchObject({ ok: true, code: 'MEMBER_REACTIVATED' });
    expect(await mine(U.staff)).toEqual(['vtden.read.all']);
    expect((await login(U.staff, HASH('b'))).ok).toBe(true);

    const audit = await owner.query(
      `SELECT action FROM dms_audit_records WHERE target_id = $1 ORDER BY id`,
      [U.staff],
    );
    expect(audit.rows.map((x) => x.action)).toEqual(['ad.member.suspend', 'ad.member.reactivate']);
  });

  it('đang khóa thì không đăng nhập được, kể cả qua link email', async () => {
    await suspend(U.adm, U.staff, true);
    const r = await login(U.staff, HASH('c'));
    expect(r).toMatchObject({ ok: false, code: 'ACCOUNT_SUSPENDED' });
    expect(await session(HASH('c'))).toBe(0);
    expect((await call('SELECT au_email_login_allowed($1,$2) AS ok', [T, U.staff]))[0].ok).toBe(
      false,
    );
    await suspend(U.adm, U.staff, false);
  });

  it('chỉ người có quyền duyệt phân quyền; lý do bắt buộc; đúng văn phòng; không đổi trạng thái thừa', async () => {
    expect((await suspend(U.staff, U.approver2, true)).code).toBe('ADMIN_ONLY');
    expect((await suspend(U.adm, U.staff, true, '  ')).code).toBe('REASON_REQUIRED');
    expect((await suspend(U.adm, U.outsider, true)).code).toBe('USER_NOT_FOUND');
    expect((await suspend(U.adm, U.staff, false)).code).toBe('NO_CHANGE');
  });

  it('không tự khóa mình; người bị khóa không còn quyền duyệt nên không khóa được ai', async () => {
    expect((await suspend(U.adm, U.adm, true)).code).toBe('SELF_TARGET_NOT_ALLOWED');
    // Hai người duyệt: khóa Admin gốc bởi người duyệt thứ hai được (còn người duyệt là chính người khóa).
    expect((await suspend(U.approver2, U.adm, true)).ok).toBe(true);
    // Admin gốc đã bị khóa: mất quyền duyệt hiệu lực nên không thao tác được nữa.
    expect((await suspend(U.adm, U.approver2, true)).code).toBe('ADMIN_ONLY');
    expect((await suspend(U.approver2, U.adm, false)).ok).toBe(true);
  });
});
