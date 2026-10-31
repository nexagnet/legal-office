import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS Phase 1 lát 2a (0072): đổi Nhóm quyền chỉ qua yêu cầu có duyệt. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsp_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS đổi quyền có duyệt (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF2 = id();
  const U = { p1: id(), p2: id(), thv: id(), outsider: id(), foreign: id() };
  let adminGroup = '';
  let thvGroup = '';

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
  const op = async (fn: string, args: unknown[], tenant = T) => {
    const rows = await call(
      tenant,
      `SELECT (r).ok, (r).code, (r).label FROM (SELECT ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS r) q`,
      args,
    );
    return rows[0] as { ok: boolean; code: string; label: string | null };
  };
  const propose = (
    u: string,
    group: string,
    kind: string,
    permission: string | null,
    user: string | null,
  ) => op('dms_permission_propose', [T, u, group, kind, permission, user, 'lý do thử']);
  const review = (u: string, req: string, approve: boolean, reason: string | null = null) =>
    op('dms_permission_review', [T, u, req, approve, reason]);
  const mine = async (u: string) =>
    (await call(T, 'SELECT permission FROM dms_my_permissions($1,$2,$3)', [T, u, OFF])).map(
      (r) => r.permission,
    );

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
      [U.p1, T],
      [U.p2, T],
      [U.thv, T],
      [U.outsider, T],
      [U.foreign, T2],
    ]) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        tenant,
        uid,
      ]);
    }
    // Gieo bởi vận hành (kết nối chủ CSDL): nhóm quản trị phân quyền với hai người, và một nhóm THV rỗng.
    const mk = async (tenant: string, office: string, name: string) =>
      (
        await owner.query(
          `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,$3) RETURNING id`,
          [tenant, office, name],
        )
      ).rows[0].id as string;
    adminGroup = await mk(T, OFF, 'Quản trị phân quyền');
    thvGroup = await mk(T, OFF, 'THV tạo');
    const foreignGroup = await mk(T2, OFF2, 'Quản trị B');
    for (const p of ['dms.permission.propose', 'dms.permission.approve']) {
      await owner.query(
        `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
        [T, adminGroup, p],
      );
    }
    await owner.query(
      `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,'dms.permission.approve')`,
      [T2, foreignGroup],
    );
    for (const u of [U.p1, U.p2]) {
      await owner.query(
        `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
        [T, adminGroup, u],
      );
    }
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T2, foreignGroup, U.foreign],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('đề xuất cần quyền đề xuất; người ngoài không biết nhóm có tồn tại', async () => {
    expect(await propose(U.outsider, thvGroup, 'GRANT', 'vibang.read.own', null)).toMatchObject({
      ok: false,
      code: 'GROUP_NOT_FOUND',
    });
    expect(await op('dms_group_create', [T, U.outsider, OFF, 'x'])).toMatchObject({
      ok: false,
      code: 'PERMISSION_DENIED',
    });
    expect((await op('dms_group_create', [T, U.p1, OFF, 'Nhóm mới'])).ok).toBe(true);
    expect(await op('dms_group_create', [T, U.p1, OFF, 'Nhóm mới'])).toMatchObject({
      code: 'GROUP_NAME_IN_USE',
    });
  });

  it('chưa duyệt thì chưa có quyền; duyệt bởi người khác thì có hiệu lực ngay; thu hồi cũng ngay', async () => {
    expect(await mine(U.thv)).toEqual([]);
    const add = (await propose(U.p1, thvGroup, 'ADD_MEMBER', null, U.thv)).label!;
    const grant = (await propose(U.p1, thvGroup, 'GRANT', 'vibang.read.own', null)).label!;
    expect(await mine(U.thv)).toEqual([]);
    expect((await review(U.p2, add, true)).ok).toBe(true);
    expect((await review(U.p2, grant, true)).ok).toBe(true);
    expect(await mine(U.thv)).toEqual(['vibang.read.own']);

    const revoke = (await propose(U.p2, thvGroup, 'REVOKE', 'vibang.read.own', null)).label!;
    expect((await review(U.p1, revoke, true)).ok).toBe(true);
    expect(await mine(U.thv)).toEqual([]);
  });

  it('người đề xuất không tự duyệt; người không có quyền duyệt cũng không duyệt được', async () => {
    const r = (await propose(U.p1, thvGroup, 'GRANT', 'vibang.draft.own', null)).label!;
    expect(await review(U.p1, r, true)).toMatchObject({
      ok: false,
      code: 'SELF_APPROVAL_NOT_ALLOWED',
    });
    expect(await review(U.thv, r, true)).toMatchObject({ ok: false, code: 'REQUEST_NOT_FOUND' });
    expect(await mine(U.thv)).toEqual([]);
    // Chặn tận CSDL: kể cả chủ bảng không ghi được reviewed_by = proposed_by.
    await expect(
      owner.query(
        `UPDATE dms_permission_requests SET status = 'APPROVED', reviewed_by = proposed_by, reviewed_at = now() WHERE id = $1`,
        [r],
      ),
    ).rejects.toThrow(/dms_perm_req_no_self_review_chk/);
    expect((await review(U.p2, r, false, 'chưa cần')).ok).toBe(true);
  });

  it('từ chối cần lý do và không đổi gì; yêu cầu đã duyệt bất biến; không xoá', async () => {
    const r = (await propose(U.p1, thvGroup, 'GRANT', 'vibang.download.own', null)).label!;
    expect(await review(U.p2, r, false, '  ')).toMatchObject({
      ok: false,
      code: 'REASON_REQUIRED',
    });
    expect((await review(U.p2, r, false, 'không phù hợp')).ok).toBe(true);
    expect(await mine(U.thv)).toEqual([]);
    expect(await review(U.p2, r, true)).toMatchObject({ code: 'REQUEST_NOT_PENDING' });
    await expect(
      owner.query(`UPDATE dms_permission_requests SET reason = 'x' WHERE id = $1`, [r]),
    ).rejects.toThrow(/immutable/);
    await expect(
      owner.query(`DELETE FROM dms_permission_requests WHERE id = $1`, [r]),
    ).rejects.toThrow(/cannot be deleted/);
    await expect(owner.query(`TRUNCATE dms_permission_requests`)).rejects.toThrow(/append-only/);
  });

  it('kiểm tra đầu vào: mã quyền lạ, không đổi gì, trùng yêu cầu chờ, người dùng lạ', async () => {
    expect(await propose(U.p1, thvGroup, 'GRANT', 'vibang.delete.all', null)).toMatchObject({
      code: 'UNKNOWN_PERMISSION',
    });
    expect(await propose(U.p1, thvGroup, 'GRANT', 'dms.amendment.approve', null)).toMatchObject({
      code: 'UNKNOWN_PERMISSION',
    });
    expect(await propose(U.p1, thvGroup, 'REVOKE', 'vibang.read.own', null)).toMatchObject({
      code: 'NO_CHANGE',
    });
    expect(await propose(U.p1, thvGroup, 'ADD_MEMBER', null, id())).toMatchObject({
      code: 'USER_NOT_FOUND',
    });
    expect(await propose(U.p1, thvGroup, 'ADD_MEMBER', 'vibang.read.own', U.thv)).toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(await propose(U.p1, thvGroup, 'LẠ', null, null)).toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect((await propose(U.p1, thvGroup, 'GRANT', 'tongdat.read.own', null)).ok).toBe(true);
    expect(await propose(U.p2, thvGroup, 'GRANT', 'tongdat.read.own', null)).toMatchObject({
      code: 'ALREADY_PENDING',
    });
  });

  it('yêu cầu cũ hết hiệu lực khi trạng thái đã đổi (REQUEST_STALE)', async () => {
    const a = (await propose(U.p1, thvGroup, 'GRANT', 'xacminh.read.own', null)).label!;
    // Cùng nội dung nhưng do người khác đề xuất sau khi đã được áp trực tiếp qua yêu cầu khác không thể trùng; giả lập bằng gieo trực tiếp.
    await owner.query(
      `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,'xacminh.read.own')`,
      [T, thvGroup],
    );
    expect(await review(U.p2, a, true)).toMatchObject({ ok: false, code: 'REQUEST_STALE' });
  });

  it('không cho thay đổi làm văn phòng mất hết người có quyền duyệt', async () => {
    const r1 = (await propose(U.p1, adminGroup, 'REMOVE_MEMBER', null, U.p2)).label!;
    expect((await review(U.p2, r1, true)).code).not.toBe('WOULD_REMOVE_LAST_APPROVER'); // còn p1 thì được phép
    // Giờ chỉ còn p1: p2 đã bị gỡ nên không thể duyệt; thêm người duyệt thứ hai rồi thử gỡ nhóm quyền duyệt.
    expect(await mine(U.p2)).toEqual([]);
    expect(await mine(U.p1)).toEqual(['dms.permission.approve', 'dms.permission.propose']);
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, adminGroup, U.p2],
    );
    const revokeAll = (await propose(U.p1, adminGroup, 'REVOKE', 'dms.permission.approve', null))
      .label!;
    expect(await review(U.p2, revokeAll, true)).toMatchObject({
      ok: false,
      code: 'WOULD_REMOVE_LAST_APPROVER',
    });
    expect(await mine(U.p1)).toContain('dms.permission.approve');
  });

  it('danh sách yêu cầu và nhóm cần quyền; tenant khác cô lập', async () => {
    const reqs = await call(T, 'SELECT * FROM dms_list_permission_requests($1,$2,$3,NULL)', [
      T,
      U.p1,
      OFF,
    ]);
    expect(reqs.length).toBeGreaterThan(3);
    expect(
      await call(T, 'SELECT * FROM dms_list_permission_requests($1,$2,$3,NULL)', [
        T,
        U.outsider,
        OFF,
      ]),
    ).toEqual([]);
    expect(await call(T, 'SELECT * FROM dms_list_groups($1,$2,$3)', [T, U.outsider, OFF])).toEqual(
      [],
    );
    const groups = await call(T, 'SELECT * FROM dms_list_groups($1,$2,$3)', [T, U.p1, OFF]);
    expect(groups.map((g) => g.name)).toContain('Quản trị phân quyền');
    // Tenant B không duyệt được yêu cầu của tenant A và không thấy chúng.
    const r = (await propose(U.p1, thvGroup, 'GRANT', 'tochuc.read.own', null)).label!;
    expect(await op('dms_permission_review', [T2, U.foreign, r, true, null], T2)).toMatchObject({
      ok: false,
      code: 'REQUEST_NOT_FOUND',
    });
    expect(await call(T2, 'SELECT id FROM dms_permission_requests', [])).toEqual([]);
  });

  it('nhật ký: đề xuất và duyệt đều có dấu vết, từ chối nằm ở audit_log', async () => {
    const rows = await owner.query(
      `SELECT DISTINCT action FROM dms_audit_records WHERE action LIKE 'dms.permission.%' OR action = 'dms.group.create'`,
    );
    expect(rows.rows.map((r) => r.action).sort()).toEqual([
      'dms.group.create',
      'dms.permission.propose',
      'dms.permission.review',
    ]);
    const deny = await owner.query(
      `SELECT 1 FROM audit_log WHERE action = 'dms.permission.review' AND outcome = 'deny' AND reason = 'SELF_APPROVAL_NOT_ALLOWED'`,
    );
    expect(deny.rowCount).toBeGreaterThan(0);
  });
});
