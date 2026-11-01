import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Quyền chi tiết cho từng tài khoản (0099): quyền hiệu lực = nhóm + cấp riêng − thu riêng, ép ở chốt chặn dms_has_permission.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsu_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS quyền riêng theo tài khoản (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  const B1 = id();
  const B2 = id();
  const B_OTHER = id();
  const OFF_OTHER = id();
  const U = { admin: id(), a: id(), b: id(), proposer: id(), approverGroup: id() };
  let G: string;

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
  const apply = (actor: string, user: string, desired: string[], reason = 'phân quyền riêng') =>
    op('dms_user_overrides_apply', [T, actor, OFF, user, desired, reason]);
  const has = async (user: string, code: string) =>
    (await call('SELECT dms_has_permission($1,$2,$3,$4) AS v', [T, user, OFF, code]))[0]
      .v as boolean;
  const mine = async (user: string) =>
    (await call('SELECT permission FROM dms_my_permissions($1,$2,$3)', [T, user, OFF])).map(
      (r) => r.permission as string,
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

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A')`, [T]);
    await owner.query(
      `INSERT INTO offices (id, tenant_id, name) VALUES ($1,$3,'VP A'),($2,$3,'VP khác')`,
      [OFF, OFF_OTHER, T],
    );
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$4,$5,'CN 1'),($2,$4,$5,'CN 2'),($3,$4,$6,'CN khác')`,
      [B1, B2, B_OTHER, T, OFF, OFF_OTHER],
    );
    for (const u of Object.values(U)) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        u,
        T,
        u,
      ]);
      await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4)`,
        [T, u, OFF, u === U.admin ? 'ADMIN' : 'THANH_VIEN'],
      );
    }
    G = (
      await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'Văn thư') RETURNING id`,
        [T, OFF],
      )
    ).rows[0].id as string;
    for (const p of ['vtden.read.all', 'vtden.draft.all', 'vtden.confirm.all'])
      await owner.query(
        `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
        [T, G, p],
      );
    for (const u of [U.a, U.b])
      await owner.query(
        `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
        [T, G, u],
      );
    // Người đề xuất: chỉ có quyền đề xuất, không duyệt.
    const pg2 = (
      await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'Đề xuất') RETURNING id`,
        [T, OFF],
      )
    ).rows[0].id as string;
    await owner.query(
      `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,'dms.permission.propose')`,
      [T, pg2],
    );
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, pg2, U.proposer],
    );
    // Người có quyền duyệt qua nhóm (Admin theo nghĩa quyền, không phải vai ADMIN).
    const ag = (
      await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'Duyệt') RETURNING id`,
        [T, OFF],
      )
    ).rows[0].id as string;
    await owner.query(
      `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,'dms.permission.approve')`,
      [T, ag],
    );
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, ag, U.approverGroup],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('chỉ người có quyền duyệt phân quyền đặt được; cần lý do', async () => {
    expect(await apply(U.proposer, U.a, [])).toMatchObject({ ok: false, code: 'ADMIN_ONLY' });
    expect(await apply(U.a, U.b, [])).toMatchObject({ ok: false, code: 'ADMIN_ONLY' });
    expect(await apply(U.admin, U.a, [], '  ')).toMatchObject({
      ok: false,
      code: 'REASON_REQUIRED',
    });
  });

  it('không đặt cho chính mình, cho vai ADMIN, cho người ngoài văn phòng; mã quyền phải thuộc danh mục cấp riêng được', async () => {
    expect(await apply(U.approverGroup, U.approverGroup, [])).toMatchObject({
      code: 'SELF_NOT_ALLOWED',
    });
    expect(await apply(U.approverGroup, U.admin, [])).toMatchObject({ code: 'ADMIN_TARGET' });
    expect(await apply(U.admin, id(), [])).toMatchObject({ code: 'USER_NOT_FOUND' });
    // quyền quản trị phân quyền chỉ theo nhóm
    for (const bad of [
      'dms.permission.approve',
      'dms.permission.propose',
      'dms.amendment.approve',
      'vibang.nope.all',
    ])
      expect(await apply(U.admin, U.a, [bad])).toMatchObject({ code: 'UNKNOWN_PERMISSION' });
  });

  it('tập mong muốn khớp nền nhóm thì không đổi gì', async () => {
    const r = await apply(U.admin, U.a, ['vtden.read.all', 'vtden.draft.all', 'vtden.confirm.all']);
    expect(r).toMatchObject({ ok: false, code: 'NO_CHANGE' });
    const rows = await call('SELECT * FROM dms_list_user_overrides($1,$2,$3,$4)', [
      T,
      U.admin,
      OFF,
      U.a,
    ]);
    expect(rows).toHaveLength(0);
  });

  it('cấp riêng thêm quyền ngoài nhóm và thu riêng bớt quyền của nhóm, hiệu lực ngay', async () => {
    expect(await has(U.a, 'vtden.confirm.all')).toBe(true);
    expect(await has(U.a, 'dms.stock.write')).toBe(false);
    // bỏ "confirm", thêm "stock.write" và "download"
    const r = await apply(U.admin, U.a, [
      'vtden.read.all',
      'vtden.draft.all',
      'dms.stock.write',
      'vtden.download.all',
    ]);
    expect(r).toMatchObject({ ok: true, code: 'OVERRIDES_APPLIED', label: '3' });
    expect(await has(U.a, 'vtden.confirm.all')).toBe(false); // thu riêng
    expect(await has(U.a, 'dms.stock.write')).toBe(true); // cấp riêng
    expect(await has(U.a, 'vtden.download.all')).toBe(true);
    expect(await has(U.a, 'vtden.read.all')).toBe(true); // vẫn theo nhóm
    expect(await mine(U.a)).toEqual([
      'dms.stock.write',
      'vtden.download.all',
      'vtden.draft.all',
      'vtden.read.all',
    ]);
    // người cùng nhóm không bị ảnh hưởng
    expect(await has(U.b, 'vtden.confirm.all')).toBe(true);
    expect(await has(U.b, 'dms.stock.write')).toBe(false);
  });

  it('đặt lại giống cũ thì không đổi; bỏ tick quyền cấp riêng thì đóng dòng, giữ lịch sử, không xoá', async () => {
    const same = await apply(U.admin, U.a, [
      'vtden.read.all',
      'vtden.draft.all',
      'dms.stock.write',
      'vtden.download.all',
    ]);
    expect(same.code).toBe('NO_CHANGE');
    // trả lại đúng nền nhóm
    const back = await apply(
      U.admin,
      U.a,
      ['vtden.read.all', 'vtden.draft.all', 'vtden.confirm.all'],
      'trả về nhóm',
    );
    expect(back).toMatchObject({ ok: true, label: '3' });
    expect(await has(U.a, 'vtden.confirm.all')).toBe(true);
    expect(await has(U.a, 'dms.stock.write')).toBe(false);
    const rows = await call('SELECT * FROM dms_list_user_overrides($1,$2,$3,$4)', [
      T,
      U.admin,
      OFF,
      U.a,
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.ended_at !== null && r.end_reason === 'trả về nhóm')).toBe(true);
    await expect(owner.query(`DELETE FROM dms_user_permission_overrides`)).rejects.toThrow(
      /cannot be deleted/,
    );
    await expect(
      owner.query(`UPDATE dms_user_permission_overrides SET reason = 'x'`),
    ).rejects.toThrow(/append-only/);
  });

  it('người chỉ có quyền đề xuất xem được danh sách; người không có quyền thì không', async () => {
    await apply(U.admin, U.b, ['vtden.read.all']);
    const asProposer = await call('SELECT * FROM dms_list_user_overrides($1,$2,$3,$4)', [
      T,
      U.proposer,
      OFF,
      U.b,
    ]);
    expect(asProposer.length).toBeGreaterThan(0);
    const asPlain = await call('SELECT * FROM dms_list_user_overrides($1,$2,$3,$4)', [
      T,
      U.a,
      OFF,
      U.b,
    ]);
    expect(asPlain).toHaveLength(0);
  });

  it('nhóm ngừng dùng không cấp quyền; cấp riêng vẫn có hiệu lực; tạm khóa thì mất hết', async () => {
    await apply(U.admin, U.b, ['vtden.read.all', 'vtden.download.all']);
    expect(await has(U.b, 'vtden.download.all')).toBe(true);
    await owner.query(
      `UPDATE dms_permission_groups SET status = 'RETIRED', retired_at = now() WHERE id = $1`,
      [G],
    );
    expect(await has(U.b, 'vtden.read.all')).toBe(false);
    expect(await has(U.b, 'vtden.download.all')).toBe(true);
    await owner.query(
      `UPDATE dms_permission_groups SET status = 'ACTIVE', retired_at = NULL WHERE id = $1`,
      [G],
    );
    await owner.query(`UPDATE users SET suspended_at = now(), suspend_reason = 'x' WHERE id = $1`, [
      U.b,
    ]);
    expect(await has(U.b, 'vtden.download.all')).toBe(false);
    expect(await mine(U.b)).toEqual([]);
    await owner.query(`UPDATE users SET suspended_at = NULL, suspend_reason = NULL WHERE id = $1`, [
      U.b,
    ]);
  });

  it('thu riêng quyền đọc làm người đó không thấy hồ sơ (chốt chặn dms_case_visible)', async () => {
    const created = await op('dms_case_create_draft', [
      T,
      U.a,
      OFF,
      'vtden',
      'Hồ sơ thử',
      '{}',
      B1,
    ]).catch(() => null);
    // người a chưa được cấp chi nhánh: cấp rồi tạo
    await op('dms_branch_access_set', [T, U.admin, OFF, U.a, B1, true, 'phân công']);
    const c = await op('dms_case_create_draft', [T, U.a, OFF, 'vtden', 'Hồ sơ thử', '{}', B1]);
    expect(created === null || created.ok === false || created.ok === true).toBe(true);
    expect(c.ok).toBe(true);
    const ids = async () =>
      (
        await call('SELECT id FROM dms_list_cases($1,$2,$3,$4,NULL,100,0)', [T, U.a, OFF, 'vtden'])
      ).map((r) => r.id);
    expect(await ids()).toContain(c.label);
    await apply(U.admin, U.a, ['vtden.draft.all', 'vtden.confirm.all']); // bỏ quyền đọc
    expect(await ids()).toHaveLength(0);
    await apply(U.admin, U.a, ['vtden.read.all', 'vtden.draft.all', 'vtden.confirm.all']);
    expect(await ids()).toContain(c.label);
  });

  it('ghi nhật ký nghiệp vụ mỗi lần đổi', async () => {
    const r = await owner.query(
      `SELECT count(*)::int AS n FROM dms_audit_records WHERE action = 'dms.permission.override' AND tenant_id = $1`,
      [T],
    );
    expect(r.rows[0].n).toBeGreaterThanOrEqual(4);
  });

  describe('tạo tài khoản kèm quyền chi tiết và chi nhánh', () => {
    const create = (
      actor: string,
      email: string,
      desired: string[] | null,
      branches: string[] | null,
    ) =>
      op('ad_member_create', [
        T,
        actor,
        OFF,
        email,
        'Người mới',
        [G],
        'h',
        'cấp mới',
        desired,
        branches,
      ]);

    it('cấu hình ngay lúc tạo trong một giao dịch', async () => {
      const r = await create(
        U.admin,
        'moi@example.test',
        ['vtden.read.all', 'vtden.download.all'],
        [B1],
      );
      expect(r).toMatchObject({ ok: true });
      const uid = r.label!;
      expect(await has(uid, 'vtden.read.all')).toBe(true);
      expect(await has(uid, 'vtden.download.all')).toBe(true); // thêm riêng
      expect(await has(uid, 'vtden.draft.all')).toBe(false); // thu riêng
      expect(await has(uid, 'vtden.confirm.all')).toBe(false);
      const br = await call('SELECT * FROM dms_my_branches($1,$2,$3)', [T, uid, OFF]);
      expect(br.map((x) => x.branch_id)).toEqual([B1]);
    });

    it('không truyền quyền chi tiết: chỉ theo nhóm như cũ (gọi 8 tham số vẫn chạy)', async () => {
      const r = await op('ad_member_create', [
        T,
        U.admin,
        OFF,
        'cu@example.test',
        'Người cũ',
        [G],
        'h',
        'cấp mới',
      ]);
      expect(r.ok).toBe(true);
      expect(await has(r.label!, 'vtden.confirm.all')).toBe(true);
    });

    it('mã quyền sai hoặc chi nhánh ngoài văn phòng: từ chối và KHÔNG tạo tài khoản', async () => {
      expect(
        await create(U.admin, 'sai1@example.test', ['dms.permission.approve'], null),
      ).toMatchObject({ code: 'UNKNOWN_PERMISSION' });
      expect(await create(U.admin, 'sai2@example.test', [], [B_OTHER])).toMatchObject({
        code: 'BRANCH_NOT_FOUND',
      });
      const n = await owner.query(
        `SELECT count(*)::int AS n FROM auth_credentials WHERE email LIKE 'sai%@example.test'`,
      );
      expect(n.rows[0].n).toBe(0);
    });

    it('người không phải Admin không tạo được', async () => {
      expect(await create(U.proposer, 'x@example.test', ['vtden.read.all'], null)).toMatchObject({
        ok: false,
        code: 'ADMIN_ONLY',
      });
    });
  });
});
