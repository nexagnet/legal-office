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
  const U = {
    p1: id(),
    p2: id(),
    pr1: id(),
    pr2: id(),
    pr3: id(),
    thv: id(),
    outsider: id(),
    foreign: id(),
  };
  let proposerGroup = '';
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
      [U.pr1, T],
      [U.pr2, T],
      [U.pr3, T],
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
    proposerGroup = await mk(T, OFF, 'Người đề xuất');
    await owner.query(
      `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,'dms.permission.propose')`,
      [T, proposerGroup],
    );
    for (const u of [U.pr1, U.pr2, U.pr3]) {
      await owner.query(
        `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
        [T, proposerGroup, u],
      );
    }
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
    const add = (await propose(U.pr1, thvGroup, 'ADD_MEMBER', null, U.thv)).label!;
    const grant = (await propose(U.pr1, thvGroup, 'GRANT', 'vibang.read.own', null)).label!;
    expect(await mine(U.thv)).toEqual([]);
    expect((await review(U.p2, add, true)).ok).toBe(true);
    expect((await review(U.p2, grant, true)).ok).toBe(true);
    expect(await mine(U.thv)).toEqual(['vibang.read.own']);

    const revoke = (await propose(U.pr2, thvGroup, 'REVOKE', 'vibang.read.own', null)).label!;
    expect((await review(U.p1, revoke, true)).ok).toBe(true);
    expect(await mine(U.thv)).toEqual([]);
  });

  it('người không phải Admin không tự duyệt; người không có quyền duyệt cũng không duyệt được', async () => {
    const r = (await propose(U.pr1, thvGroup, 'GRANT', 'vibang.draft.own', null)).label!;
    expect(await review(U.pr1, r, true)).toMatchObject({ ok: false, code: 'REQUEST_NOT_FOUND' });
    expect(await review(U.thv, r, true)).toMatchObject({ ok: false, code: 'REQUEST_NOT_FOUND' });
    expect(await mine(U.thv)).toEqual([]);
    // Người đề xuất sau này thành Admin vẫn không tự duyệt yêu cầu CŨ của chính mình.
    const r3 = (await propose(U.pr3, thvGroup, 'GRANT', 'vibang.draft.all', null)).label!;
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, adminGroup, U.pr3],
    );
    expect(await review(U.pr3, r3, true)).toMatchObject({
      ok: false,
      code: 'SELF_APPROVAL_NOT_ALLOWED',
    });
    await owner.query(`DELETE FROM dms_group_members WHERE group_id = $1 AND user_id = $2`, [
      adminGroup,
      U.pr3,
    ]);
    expect((await review(U.p2, r3, false, 'chưa cần')).ok).toBe(true);
    // Chặn tận CSDL: yêu cầu thường không thể có reviewed_by = proposed_by.
    await expect(
      owner.query(
        `UPDATE dms_permission_requests SET status = 'APPROVED', reviewed_by = proposed_by, reviewed_at = now() WHERE id = $1`,
        [r],
      ),
    ).rejects.toThrow(/dms_perm_req_no_self_review_chk/);
    expect((await review(U.p2, r, false, 'chưa cần')).ok).toBe(true);
  });

  it('từ chối cần lý do và không đổi gì; yêu cầu đã duyệt bất biến; không xoá', async () => {
    const r = (await propose(U.pr1, thvGroup, 'GRANT', 'vibang.download.own', null)).label!;
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
    expect(await propose(U.pr1, thvGroup, 'GRANT', 'vibang.delete.all', null)).toMatchObject({
      code: 'UNKNOWN_PERMISSION',
    });
    expect(await propose(U.pr1, thvGroup, 'GRANT', 'dms.amendment.approve', null)).toMatchObject({
      code: 'UNKNOWN_PERMISSION',
    });
    expect(await propose(U.pr1, thvGroup, 'REVOKE', 'vibang.read.own', null)).toMatchObject({
      code: 'NO_CHANGE',
    });
    expect(await propose(U.pr1, thvGroup, 'ADD_MEMBER', null, id())).toMatchObject({
      code: 'USER_NOT_FOUND',
    });
    expect(await propose(U.pr1, thvGroup, 'ADD_MEMBER', 'vibang.read.own', U.thv)).toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(await propose(U.pr1, thvGroup, 'LẠ', null, null)).toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect((await propose(U.pr1, thvGroup, 'GRANT', 'tongdat.read.own', null)).ok).toBe(true);
    expect(await propose(U.pr2, thvGroup, 'GRANT', 'tongdat.read.own', null)).toMatchObject({
      code: 'ALREADY_PENDING',
    });
  });

  it('yêu cầu cũ hết hiệu lực khi trạng thái đã đổi (REQUEST_STALE)', async () => {
    const a = (await propose(U.pr1, thvGroup, 'GRANT', 'xacminh.read.own', null)).label!;
    // Cùng nội dung nhưng do người khác đề xuất sau khi đã được áp trực tiếp qua yêu cầu khác không thể trùng; giả lập bằng gieo trực tiếp.
    await owner.query(
      `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,'xacminh.read.own')`,
      [T, thvGroup],
    );
    expect(await review(U.p2, a, true)).toMatchObject({ ok: false, code: 'REQUEST_STALE' });
  });

  it('không cho thay đổi làm văn phòng mất hết người có quyền duyệt', async () => {
    // Admin gỡ Admin khác: có hiệu lực ngay (thu hồi khẩn cấp), không cần duyệt.
    expect(await propose(U.p1, adminGroup, 'REMOVE_MEMBER', null, U.p2)).toMatchObject({
      ok: true,
      code: 'REQUEST_APPLIED',
    });
    expect(await mine(U.p2)).toEqual([]);
    expect(await mine(U.p1)).toEqual(['dms.permission.approve', 'dms.permission.propose']);
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, adminGroup, U.p2],
    );
    const before = await owner.query(`SELECT count(*)::int AS n FROM dms_permission_requests`);
    expect(await propose(U.p1, adminGroup, 'REVOKE', 'dms.permission.approve', null)).toMatchObject(
      {
        ok: false,
        code: 'WOULD_REMOVE_LAST_APPROVER',
      },
    );
    // Bị chặn thì không để lại yêu cầu nào.
    const after = await owner.query(`SELECT count(*)::int AS n FROM dms_permission_requests`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
    expect(await mine(U.p1)).toContain('dms.permission.approve');
  });

  it('Admin áp dụng thẳng, không qua duyệt, có dấu vết; thu hồi khẩn cấp có hiệu lực ngay', async () => {
    const grant = await propose(U.p1, thvGroup, 'GRANT', 'tochuc.download.own', null);
    expect(grant).toMatchObject({ ok: true, code: 'REQUEST_APPLIED' });
    const row = await owner.query(
      `SELECT status, auto_applied, reviewed_by, proposed_by FROM dms_permission_requests WHERE id = $1`,
      [grant.label],
    );
    expect(row.rows[0]).toMatchObject({ status: 'APPROVED', auto_applied: true });
    expect(row.rows[0].reviewed_by).toBe(row.rows[0].proposed_by);
    await propose(U.p1, thvGroup, 'REMOVE_MEMBER', null, U.thv); // làm sạch thành viên từ các test trước
    const add = await propose(U.p1, thvGroup, 'ADD_MEMBER', null, U.thv);
    expect(add.code).toBe('REQUEST_APPLIED');
    expect(await mine(U.thv)).toContain('tochuc.download.own');
    expect((await propose(U.p2, thvGroup, 'REMOVE_MEMBER', null, U.thv)).code).toBe(
      'REQUEST_APPLIED',
    );
    expect(await mine(U.thv)).toEqual([]);
    const audit = await owner.query(
      `SELECT 1 FROM dms_audit_records WHERE action = 'dms.permission.apply' AND detail->>'by_admin' = 'true'`,
    );
    expect(audit.rowCount).toBeGreaterThan(0);
    // Người không phải Admin vẫn phải chờ duyệt.
    expect((await propose(U.pr1, thvGroup, 'ADD_MEMBER', null, U.thv)).code).toBe(
      'REQUEST_PROPOSED',
    );
  });

  it('gieo Admin đầu tiên: chỉ khi văn phòng chưa có Admin, vai ứng dụng không gọi được', async () => {
    const T3 = id();
    const OFF3 = id();
    const first = id();
    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'C')`, [T3]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP C')`, [
      OFF3,
      T3,
    ]);
    await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
      first,
      T3,
      first,
    ]);
    await expect(
      call(T3, `SELECT dms_bootstrap_admin($1,$2,$3,'Quản trị')`, [T3, OFF3, first]),
    ).rejects.toThrow(/permission denied/);
    const ok = await owner.query(
      `SELECT (r).ok, (r).code FROM (SELECT dms_bootstrap_admin($1,$2,$3,'Quản trị') AS r) q`,
      [T3, OFF3, first],
    );
    expect(ok.rows[0]).toMatchObject({ ok: true, code: 'ADMIN_BOOTSTRAPPED' });
    const perms = await call(T3, 'SELECT permission FROM dms_my_permissions($1,$2,$3)', [
      T3,
      first,
      OFF3,
    ]);
    expect(perms.map((x) => x.permission)).toEqual([
      'dms.permission.approve',
      'dms.permission.propose',
    ]);
    const again = await owner.query(
      `SELECT (r).ok, (r).code FROM (SELECT dms_bootstrap_admin($1,$2,$3,'Quản trị') AS r) q`,
      [T3, OFF3, first],
    );
    expect(again.rows[0]).toMatchObject({ ok: false, code: 'ADMIN_ALREADY_EXISTS' });
  });

  it('bản nháp đã hủy không khôi phục được: không có hàm khôi phục nào', async () => {
    const fns = await owner.query(
      `SELECT proname FROM pg_proc WHERE proname LIKE 'dms%' AND (proname ILIKE '%restore%' OR proname ILIKE '%reopen%' OR proname ILIKE '%undelete%' OR proname ILIKE '%delete%')`,
    );
    expect(fns.rows).toEqual([]);
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
    const r = (await propose(U.pr1, thvGroup, 'GRANT', 'tochuc.read.own', null)).label!;
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
      'dms.permission.apply',
      'dms.permission.propose',
      'dms.permission.review',
    ]);
    const deny = await owner.query(
      `SELECT 1 FROM audit_log WHERE action = 'dms.permission.review' AND outcome = 'deny' AND reason = 'SELF_APPROVAL_NOT_ALLOWED'`,
    );
    expect(deny.rowCount).toBeGreaterThan(0);
  });
});
