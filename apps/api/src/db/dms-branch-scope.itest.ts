import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Phạm vi theo địa điểm (0092): chỉ thấy hồ sơ và bản ghi của chi nhánh được cấp, kể cả Văn thư xem sổ. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsb_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS phạm vi theo chi nhánh (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const OFF = id(); // có chi nhánh
  const OFF_PLAIN = id(); // chưa tạo chi nhánh nào
  const OFF_OTHER = id(); // có chi nhánh B_OTHER
  const B1 = id();
  const B2 = id();
  const B_OTHER = id();
  const U = { admin: id(), a: id(), b: id(), c: id(), legacy: id() };
  const YEAR = new Date().getFullYear();

  const call = async (sql: string, args: unknown[], pool: pg.Pool = app) => {
    const client = await pool.connect();
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
  const create = (u: string, domain: string, office = OFF, branch: string | null = null) =>
    op('dms_case_create_draft', [
      T,
      u,
      office,
      domain,
      `Hồ sơ ${domain}`,
      '{}',
      ...(branch ? [branch] : []),
    ]);
  const grant = (actor: string, user: string, branch: string, on = true, reason = 'phân công') =>
    op('dms_branch_access_set', [T, actor, OFF, user, branch, on, reason]);
  const list = async (u: string, domain: string) =>
    (await call('SELECT id FROM dms_list_cases($1,$2,$3,$4,NULL,100,0)', [T, u, OFF, domain])).map(
      (r) => r.id as string,
    );
  const book = (u: string, code: string) =>
    call('SELECT * FROM dms_book_rows($1,$2,$3,$4,$5,500,0)', [T, u, OFF, code, YEAR]);
  const branchOf = async (caseId: string) =>
    (await owner.query(`SELECT branch_id FROM dms_case_files WHERE id = $1`, [caseId])).rows[0]
      .branch_id as string | null;

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
      `INSERT INTO offices (id, tenant_id, name) VALUES ($1,$4,'VP A'),($2,$4,'VP trống'),($3,$4,'VP khác')`,
      [OFF, OFF_PLAIN, OFF_OTHER, T],
    );
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$4,$5,'Chi nhánh 1'),($2,$4,$5,'Chi nhánh 2'),($3,$4,$6,'Khác văn phòng')`,
      [B1, B2, B_OTHER, T, OFF, OFF_OTHER],
    );
    for (const u of Object.values(U)) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        u,
        T,
        u,
      ]);
      for (const office of [OFF, OFF_PLAIN]) {
        await owner.query(
          `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4)`,
          [T, u, office, u === U.admin ? 'ADMIN' : 'THANH_VIEN'],
        );
      }
    }
    // Nhóm "Văn thư": xem/tạo/lưu mọi bản ghi sổ trong phạm vi chi nhánh; nhóm "Thừa hành viên": hồ sơ của mình.
    const group = async (office: string, name: string, perms: string[], users: string[]) => {
      const g = await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,$3) RETURNING id`,
        [T, office, name],
      );
      for (const p of perms)
        await owner.query(
          `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
          [T, g.rows[0].id, p],
        );
      for (const u of users)
        await owner.query(
          `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
          [T, g.rows[0].id, u],
        );
    };
    const clerk = ['vtden', 'vibang'].flatMap((d) =>
      ['read', 'draft', 'confirm'].map((a) => `${d}.${a}.all`),
    );
    for (const office of [OFF, OFF_PLAIN])
      await group(office, 'Văn thư', clerk, [U.a, U.b, U.c, U.legacy]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('văn phòng chưa có chi nhánh: tạo hồ sơ như cũ, không gắn chi nhánh', async () => {
    const r = await create(U.a, 'vtden', OFF_PLAIN);
    expect(r.code).toBe('CASE_DRAFT_CREATED');
    expect(await branchOf(r.label!)).toBeNull();
  });

  it('văn phòng có chi nhánh: người chưa được cấp không tạo được', async () => {
    const r = await create(U.a, 'vtden');
    expect(r).toMatchObject({ ok: false, code: 'BRANCH_NOT_GRANTED' });
  });

  it('chỉ người có quyền duyệt phân quyền mới cấp; cần lý do; chi nhánh phải thuộc văn phòng', async () => {
    expect(await grant(U.a, U.b, B1)).toMatchObject({ ok: false, code: 'ADMIN_ONLY' });
    expect(await grant(U.admin, U.b, B1, true, '  ')).toMatchObject({
      ok: false,
      code: 'REASON_REQUIRED',
    });
    expect(await grant(U.admin, U.b, B_OTHER)).toMatchObject({
      ok: false,
      code: 'BRANCH_NOT_FOUND',
    });
    expect(await grant(U.admin, id(), B1)).toMatchObject({ ok: false, code: 'USER_NOT_FOUND' });
  });

  it('cấp một chi nhánh: tạo hồ sơ tự gắn chi nhánh đó, và người đó thấy; người chi nhánh khác không thấy', async () => {
    expect(await grant(U.admin, U.a, B1)).toMatchObject({
      ok: true,
      code: 'BRANCH_ACCESS_GRANTED',
    });
    expect(await grant(U.admin, U.a, B1)).toMatchObject({ ok: false, code: 'NO_CHANGE' });
    expect(await grant(U.admin, U.b, B2)).toMatchObject({ ok: true });

    const c = await create(U.a, 'vtden');
    expect(c.ok).toBe(true);
    expect(await branchOf(c.label!)).toBe(B1);
    expect((await op('dms_case_record', [T, U.a, c.label])).ok).toBe(true);

    expect(await list(U.a, 'vtden')).toContain(c.label);
    expect(await list(U.b, 'vtden')).not.toContain(c.label); // đúng quyền .all nhưng khác chi nhánh
    expect(await list(U.admin, 'vtden')).toContain(c.label); // người duyệt phân quyền thấy mọi chi nhánh
    const detail = await call('SELECT * FROM dms_get_case($1,$2,$3)', [T, U.b, c.label]);
    expect(detail).toHaveLength(0);
  });

  it('sổ Văn thư và báo cáo chỉ gồm bản ghi của chi nhánh được cấp', async () => {
    const mine = await create(U.b, 'vtden'); // chi nhánh 2
    await op('dms_case_record', [T, U.b, mine.label]);
    const sA = await book(U.a, 'VT-DEN');
    const sB = await book(U.b, 'VT-DEN');
    const sAdmin = await book(U.admin, 'VT-DEN');
    expect(sA).toHaveLength(1);
    expect(sB).toHaveLength(1);
    expect(sAdmin).toHaveLength(2);
    const rep = (u: string) =>
      call('SELECT * FROM dms_report_summary($1,$2,$3,$4)', [T, u, OFF, YEAR]);
    const count = async (u: string) =>
      (await rep(u)).find((r) => r.domain === 'vtden')!.recorded_cases as number;
    expect(await count(U.a)).toBe(1);
    expect(await count(U.b)).toBe(1);
    expect(await count(U.admin)).toBe(2);
  });

  it('nhiều chi nhánh phải chọn; chọn chi nhánh chưa được cấp bị từ chối', async () => {
    expect(await grant(U.admin, U.c, B1)).toMatchObject({ ok: true });
    expect(await grant(U.admin, U.c, B2)).toMatchObject({ ok: true });
    expect(await create(U.c, 'vtden')).toMatchObject({ ok: false, code: 'BRANCH_REQUIRED' });
    const picked = await create(U.c, 'vtden', OFF, B2);
    expect(picked.ok).toBe(true);
    expect(await branchOf(picked.label!)).toBe(B2);
    expect(await create(U.a, 'vtden', OFF, B2)).toMatchObject({
      ok: false,
      code: 'BRANCH_NOT_GRANTED',
    });
    expect(await create(U.a, 'vtden', OFF, B_OTHER)).toMatchObject({
      ok: false,
      code: 'BRANCH_NOT_FOUND',
    });
  });

  it('không có quyền tạo nháp thì vẫn nhận mã PERMISSION_DENIED, không lộ chuyện chi nhánh', async () => {
    const r = await create(U.a, 'tongdat');
    expect(r).toMatchObject({ ok: false, code: 'PERMISSION_DENIED' });
  });

  it('thu hồi có hiệu lực ngay, giữ lịch sử, không xoá', async () => {
    const before = await list(U.a, 'vtden');
    expect(before.length).toBeGreaterThan(0);
    expect(await grant(U.admin, U.a, B1, false, 'chuyển công tác')).toMatchObject({
      ok: true,
      code: 'BRANCH_ACCESS_REVOKED',
    });
    expect(await grant(U.admin, U.a, B1, false)).toMatchObject({ ok: false, code: 'NO_CHANGE' });
    expect(await list(U.a, 'vtden')).toHaveLength(0);
    const rows = (
      await owner.query(
        `SELECT revoked_at, revoke_reason FROM dms_branch_access WHERE user_id = $1 AND branch_id = $2`,
        [U.a, B1],
      )
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].revoke_reason).toBe('chuyển công tác');
    // Cấp lại sau thu hồi tạo dòng mới, dòng cũ vẫn còn.
    expect(await grant(U.admin, U.a, B1)).toMatchObject({ ok: true });
    expect(
      (
        await owner.query(`SELECT 1 FROM dms_branch_access WHERE user_id = $1 AND branch_id = $2`, [
          U.a,
          B1,
        ])
      ).rowCount,
    ).toBe(2);
  });

  it('chi nhánh của hồ sơ bất biến; bảng cấp quyền không xoá được', async () => {
    const c = await create(U.c, 'vtden', OFF, B1);
    await expect(
      owner.query(`UPDATE dms_case_files SET branch_id = $2 WHERE id = $1`, [c.label, B2]),
    ).rejects.toThrow(/cannot change/);
    await expect(owner.query(`DELETE FROM dms_branch_access`)).rejects.toThrow();
    await expect(
      owner.query(`UPDATE dms_branch_access SET branch_id = $1 WHERE branch_id = $2`, [B2, B1]),
    ).rejects.toThrow(/append-only/);
  });

  it('hồ sơ chưa có chi nhánh chỉ Admin thấy; Admin gắn chi nhánh xong thì người của chi nhánh đó mới thấy', async () => {
    const legacy = (
      await owner.query(
        `INSERT INTO dms_case_files (tenant_id, office_id, domain, title, created_by, status, recorded_by, recorded_at)
         VALUES ($1,$2,'vtden','Cũ',$3,'RECORDED',$3,now()) RETURNING id`,
        [T, OFF, U.admin],
      )
    ).rows[0].id as string;
    expect(await list(U.admin, 'vtden')).toContain(legacy);
    expect(await list(U.b, 'vtden')).not.toContain(legacy);
    expect(await list(U.legacy, 'vtden')).not.toContain(legacy);

    // Chỉ Admin thấy danh sách "chưa gắn chi nhánh" và gắn được.
    const asAdmin = await call('SELECT id FROM dms_cases_without_branch($1,$2,$3)', [
      T,
      U.admin,
      OFF,
    ]);
    expect(asAdmin.map((r) => r.id)).toContain(legacy);
    expect(
      await call('SELECT id FROM dms_cases_without_branch($1,$2,$3)', [T, U.b, OFF]),
    ).toHaveLength(0);
    expect((await op('dms_cases_assign_branch', [T, U.b, OFF, [legacy], B2])).code).toBe(
      'ADMIN_ONLY',
    );
    expect((await op('dms_cases_assign_branch', [T, U.admin, OFF, [legacy], B_OTHER])).code).toBe(
      'BRANCH_NOT_FOUND',
    );
    expect(await op('dms_cases_assign_branch', [T, U.admin, OFF, [legacy], B2])).toMatchObject({
      ok: true,
      code: 'BRANCH_ASSIGNED',
    });
    expect(await branchOf(legacy)).toBe(B2);
    expect(await list(U.b, 'vtden')).toContain(legacy); // b được cấp B2
    expect(await list(U.a, 'vtden')).not.toContain(legacy); // a chỉ B1
    // Gắn một lần: đã có chi nhánh thì không đổi, kể cả Admin; hồ sơ đã ghi sổ không đổi gì khác.
    expect((await op('dms_cases_assign_branch', [T, U.admin, OFF, [legacy], B1])).code).toBe(
      'CASE_NOT_UNASSIGNED',
    );
    await expect(
      owner.query(`UPDATE dms_case_files SET branch_id = $2 WHERE id = $1`, [legacy, B1]),
    ).rejects.toThrow();
    await expect(
      owner.query(`UPDATE dms_case_files SET title = 'Sửa' WHERE id = $1`, [legacy]),
    ).rejects.toThrow(/immutable/);
    const audit = await call(
      `SELECT 1 FROM dms_audit_records WHERE target_id = $1 AND action = 'dms.case.set_branch'`,
      [legacy],
    );
    expect(audit.length).toBeGreaterThan(0);
  });

  it('văn phòng chưa tạo chi nhánh: không áp dụng phạm vi, hồ sơ không chi nhánh vẫn thấy bình thường', async () => {
    const r = await op('dms_case_create_draft', [T, U.a, OFF_PLAIN, 'vtden', 'Thường', '{}']);
    expect(r.ok).toBe(true);
    expect(
      await call('SELECT dms_cases_without_branch_count($1,$2,$3) AS n', [T, U.admin, OFF_PLAIN]),
    ).toEqual([{ n: '0' }]);
  });

  it('cấp phát cũ theo vai vẫn được tính', async () => {
    const m = (
      await owner.query(`SELECT id FROM memberships WHERE user_id = $1 AND office_id = $2`, [
        U.legacy,
        OFF,
      ])
    ).rows[0].id as string;
    await owner.query(
      `INSERT INTO branch_grants (tenant_id, membership_id, branch_id) VALUES ($1,$2,$3)`,
      [T, m, B2],
    );
    const mine = await call('SELECT branch_id, branch_name FROM dms_my_branches($1,$2,$3)', [
      T,
      U.legacy,
      OFF,
    ]);
    expect(mine.map((r) => r.branch_id)).toEqual([B2]);
    const c = await create(U.legacy, 'vtden'); // một chi nhánh (cũ) -> tự chọn
    expect(await branchOf(c.label!)).toBe(B2);
  });

  it('danh sách cấp phát và chi nhánh của tôi', async () => {
    const mineAdmin = await call('SELECT branch_id FROM dms_my_branches($1,$2,$3)', [
      T,
      U.admin,
      OFF,
    ]);
    expect(mineAdmin.map((r) => r.branch_id).sort()).toEqual([B1, B2].sort());
    const asAdmin = await call('SELECT * FROM dms_branch_access_list($1,$2,$3)', [T, U.admin, OFF]);
    expect(asAdmin.some((r) => r.user_id === U.b && r.branch_id === B2 && r.source === 'DMS')).toBe(
      true,
    );
    expect(asAdmin.some((r) => r.user_id === U.legacy && r.source === 'LEGACY')).toBe(true);
    const asClerk = await call('SELECT * FROM dms_branch_access_list($1,$2,$3)', [T, U.a, OFF]);
    expect(asClerk).toHaveLength(0);
  });

  it('tạm khóa: không còn chi nhánh nào', async () => {
    await owner.query(`UPDATE users SET suspended_at = now(), suspend_reason = 'x' WHERE id = $1`, [
      U.b,
    ]);
    const mine = await call('SELECT * FROM dms_my_branches($1,$2,$3)', [T, U.b, OFF]);
    expect(mine).toHaveLength(0);
  });
});
