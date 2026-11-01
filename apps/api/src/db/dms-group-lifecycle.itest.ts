import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// 0088: vòng đời nhóm quyền (phiên bản, ngừng dùng, nhóm mẫu được bảo vệ, sao chép). PostgreSQL thật, dữ liệu giả lập.
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

describe.skipIf(!ADMIN_URL)('DMS vòng đời nhóm quyền (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  const U = { adm: id(), proposer: id(), member: id(), approver2: id() };
  let G: { work: string; tmpl: string; approvers: string };

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
  const propose = (
    u: string,
    group: string,
    kind: string,
    perm: string | null,
    user: string | null,
  ) => op('dms_permission_propose', [T, u, group, kind, perm, user, 'lý do thử']);
  const setStatus = (u: string, group: string, status: string, reason: string | null = 'lý do') =>
    op('dms_group_set_status', [T, u, group, status, reason]);
  const mine = async (u: string) =>
    (await call('SELECT permission FROM dms_my_permissions($1,$2,$3)', [T, u, OFF])).map(
      (r) => r.permission as string,
    );
  const group = async (gid: string) =>
    (await owner.query(`SELECT * FROM dms_permission_groups WHERE id = $1`, [gid])).rows[0];

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
    const mk = async (name: string, kind = 'CUSTOM') =>
      (
        await owner.query(
          `INSERT INTO dms_permission_groups (tenant_id, office_id, name, kind) VALUES ($1,$2,$3,$4) RETURNING id`,
          [T, OFF, name, kind],
        )
      ).rows[0].id as string;
    G = {
      work: await mk('Văn thư'),
      tmpl: await mk('Mẫu', 'TEMPLATE'),
      approvers: await mk('Người duyệt'),
    };
    const perm = (g: string, p: string) =>
      owner.query(
        `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
        [T, g, p],
      );
    await perm(G.work, 'vtden.read.all');
    await perm(G.work, 'vtden.draft.all');
    await perm(G.tmpl, 'vibang.read.own');
    await perm(G.approvers, 'dms.permission.approve');
    await perm(G.approvers, 'dms.permission.propose');
    const join = (g: string, u: string) =>
      owner.query(
        `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
        [T, g, u],
      );
    await join(G.work, U.member);
    await join(G.approvers, U.approver2);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('phiên bản tăng khi đổi quyền của nhóm, không tăng khi đổi thành viên', async () => {
    expect((await group(G.work)).version).toBe(1);
    expect((await propose(U.adm, G.work, 'GRANT', 'vtden.confirm.all', null)).code).toBe(
      'REQUEST_APPLIED',
    );
    expect((await group(G.work)).version).toBe(2);
    expect((await propose(U.adm, G.work, 'REVOKE', 'vtden.confirm.all', null)).code).toBe(
      'REQUEST_APPLIED',
    );
    expect((await group(G.work)).version).toBe(3);
    expect((await propose(U.adm, G.work, 'ADD_MEMBER', null, U.proposer)).code).toBe(
      'REQUEST_APPLIED',
    );
    expect((await propose(U.adm, G.work, 'REMOVE_MEMBER', null, U.proposer)).code).toBe(
      'REQUEST_APPLIED',
    );
    expect((await group(G.work)).version).toBe(3);
  });

  it('nhóm ngừng dùng thì thành viên mất quyền hiệu lực, dùng lại thì có lại; không xoá gì', async () => {
    expect(await mine(U.member)).toContain('vtden.read.all');
    expect((await setStatus(U.adm, G.work, 'RETIRED')).code).toBe('GROUP_RETIRED');
    expect(await mine(U.member)).not.toContain('vtden.read.all');
    const has = await call(`SELECT dms_has_permission($1,$2,$3,'vtden.read.all') AS ok`, [
      T,
      U.member,
      OFF,
    ]);
    expect(has[0].ok).toBe(false);
    expect((await group(G.work)).retired_at).not.toBeNull();
    const kept = await owner.query(
      `SELECT (SELECT count(*) FROM dms_group_members WHERE group_id = $1)::int AS m,
              (SELECT count(*) FROM dms_group_permissions WHERE group_id = $1)::int AS p`,
      [G.work],
    );
    expect(kept.rows[0]).toEqual({ m: 1, p: 2 });
    expect((await setStatus(U.adm, G.work, 'ACTIVE')).code).toBe('GROUP_REACTIVATED');
    expect(await mine(U.member)).toContain('vtden.read.all');
    expect((await group(G.work)).retired_at).toBeNull();
  });

  it('ngừng dùng cần quyền duyệt, lý do, và đổi trạng thái thật; nhóm đã ngừng không nhận thay đổi', async () => {
    expect((await setStatus(U.member, G.work, 'RETIRED')).code).toBe('GROUP_NOT_FOUND');
    expect((await setStatus(U.adm, G.work, 'RETIRED', ' ')).code).toBe('INVALID_INPUT');
    expect((await setStatus(U.adm, G.work, 'ACTIVE')).code).toBe('NO_CHANGE');
    expect((await setStatus(U.adm, G.work, 'KHAC')).code).toBe('INVALID_INPUT');
    await setStatus(U.adm, G.work, 'RETIRED');
    expect((await propose(U.adm, G.work, 'GRANT', 'vtden.confirm.all', null)).code).toBe(
      'GROUP_RETIRED',
    );
    expect((await propose(U.adm, G.work, 'ADD_MEMBER', null, U.proposer)).code).toBe(
      'GROUP_RETIRED',
    );
    await setStatus(U.adm, G.work, 'ACTIVE');
  });

  it('không ngừng dùng nhóm giữ người duyệt cuối cùng', async () => {
    const r = await setStatus(U.adm, G.approvers, 'RETIRED');
    expect(r.code).toBe('WOULD_REMOVE_LAST_APPROVER');
    expect((await group(G.approvers)).status).toBe('ACTIVE');
  });

  it('nhóm mẫu được bảo vệ: không đổi quyền trực tiếp, không ngừng dùng; vẫn thêm thành viên được', async () => {
    expect((await propose(U.adm, G.tmpl, 'GRANT', 'vibang.draft.own', null)).code).toBe(
      'TEMPLATE_PROTECTED',
    );
    expect((await propose(U.adm, G.tmpl, 'REVOKE', 'vibang.read.own', null)).code).toBe(
      'TEMPLATE_PROTECTED',
    );
    expect((await setStatus(U.adm, G.tmpl, 'RETIRED')).code).toBe('TEMPLATE_PROTECTED');
    expect((await propose(U.adm, G.tmpl, 'ADD_MEMBER', null, U.proposer)).code).toBe(
      'REQUEST_APPLIED',
    );
    expect((await group(G.tmpl)).version).toBe(1);
  });

  it('sao chép tạo nhóm tùy chỉnh mới, bỏ quyền quản trị phân quyền, chưa có thành viên', async () => {
    const c = await op('dms_group_copy', [T, U.adm, G.approvers, 'Bản sao quản trị']);
    expect(c.code).toBe('GROUP_CREATED');
    const g = await group(c.label as string);
    expect(g).toMatchObject({
      kind: 'CUSTOM',
      status: 'ACTIVE',
      version: 1,
      source_group_id: G.approvers,
      description: 'Sao chép từ Người duyệt',
    });
    const perms = await owner.query(
      `SELECT permission FROM dms_group_permissions WHERE group_id = $1`,
      [g.id],
    );
    expect(perms.rowCount).toBe(0);
    const c2 = await op('dms_group_copy', [T, U.adm, G.work, 'Bản sao văn thư']);
    const p2 = await owner.query(
      `SELECT permission FROM dms_group_permissions WHERE group_id = $1 ORDER BY 1`,
      [c2.label],
    );
    expect(p2.rows.map((r) => r.permission)).toEqual(['vtden.draft.all', 'vtden.read.all']);
    const members = await owner.query(`SELECT 1 FROM dms_group_members WHERE group_id = $1`, [
      c2.label,
    ]);
    expect(members.rowCount).toBe(0);
    // Sao chép từ nhóm mẫu cũng được (nguồn của việc bắt đầu từ mẫu).
    expect((await op('dms_group_copy', [T, U.adm, G.tmpl, 'Từ mẫu'])).code).toBe('GROUP_CREATED');
  });

  it('sao chép: tên trùng/rỗng bị từ chối; người không có quyền không thấy nhóm', async () => {
    expect((await op('dms_group_copy', [T, U.adm, G.work, 'Văn thư'])).code).toBe(
      'GROUP_NAME_IN_USE',
    );
    expect((await op('dms_group_copy', [T, U.adm, G.work, '  '])).code).toBe('INVALID_INPUT');
    expect((await op('dms_group_copy', [T, U.member, G.work, 'X'])).code).toBe('GROUP_NOT_FOUND');
    expect((await op('dms_group_copy', [T, U.adm, id(), 'X'])).code).toBe('GROUP_NOT_FOUND');
  });

  it('danh sách nhóm trả loại, mô tả, trạng thái, phiên bản và nguồn', async () => {
    const rows = await call('SELECT * FROM dms_list_groups($1,$2,$3)', [T, U.adm, OFF]);
    const tmpl = rows.find((r) => r.id === G.tmpl);
    expect(tmpl).toMatchObject({ kind: 'TEMPLATE', status: 'ACTIVE', version: 1 });
    const copy = rows.find((r) => r.name === 'Từ mẫu');
    expect(copy).toMatchObject({ kind: 'CUSTOM', source_group_id: G.tmpl });
  });

  it('thêm thành viên chỉ vào nhóm đang dùng', async () => {
    await setStatus(U.adm, G.work, 'RETIRED');
    const r = await op('ad_member_create', [
      T,
      U.adm,
      OFF,
      'moi@x.test',
      'Mới',
      [G.work],
      'hash',
      'lý do',
    ]);
    expect(r.code).toBe('GROUP_NOT_FOUND');
    await setStatus(U.adm, G.work, 'ACTIVE');
    const ok = await op('ad_member_create', [
      T,
      U.adm,
      OFF,
      'moi@x.test',
      'Mới',
      [G.work],
      'hash',
      'lý do',
    ]);
    expect(ok.code).toBe('ALLOWED');
  });
});
