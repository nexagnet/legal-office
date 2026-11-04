import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS (0111): người tạo luôn thấy hồ sơ mình tạo, vượt cả ràng buộc chi nhánh; có Lịch sử hồ sơ.
// PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsc_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS người tạo thấy hồ sơ mình tạo (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  const B1 = id();
  const B2 = id();
  // cre: chỉ có quyền tạo nháp; other: cũng chỉ tạo nháp; reader: xem mọi hồ sơ của B2; boss: vai ADMIN.
  const U = { boss: id(), cre: id(), other: id(), reader: id(), sus: id() };

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
  const grant = (user: string, branch: string, on = true) =>
    op('dms_branch_access_set', [T, U.boss, OFF, user, branch, on, 'phân công']);
  const mkCase = async (u: string, domain = 'vibang') =>
    (await op('dms_case_create_draft', [T, u, OFF, domain, `Hồ sơ ${domain}`, '{}'])).label!;
  const list = async (u: string, domain: string | null = null) =>
    (await call('SELECT id FROM dms_list_cases($1,$2,$3,$4,NULL,200,0)', [T, u, OFF, domain])).map(
      (r) => r.id as string,
    );
  const search = async (u: string) =>
    (
      await call(
        'SELECT id FROM dms_search_cases($1,$2,$3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,$4,NULL,200,0,true)',
        [T, u, OFF, 'newest'],
      )
    ).map((r) => r.id as string);
  const get = async (u: string, c: string) =>
    call('SELECT id FROM dms_get_case($1,$2,$3)', [T, u, c]);
  const history = (u: string, c: string) =>
    call('SELECT action, actor_label FROM dms_case_history($1,$2,$3)', [T, u, c]);

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
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$3,$4,'Chi nhánh 1'),($2,$3,$4,'Chi nhánh 2')`,
      [B1, B2, T, OFF],
    );
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
    const group = async (name: string, perms: string[], users: string[]) => {
      const g = await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,$3) RETURNING id`,
        [T, OFF, name],
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
    // Chỉ quyền tạo nháp: KHÔNG có quyền xem.
    await group('Chỉ tạo nháp', ['vibang.draft.own', 'tongdat.draft.own'], [U.cre, U.other, U.sus]);
    await group('Xem chi nhánh 2', ['vibang.read.all'], [U.reader]);
    for (const u of [U.cre, U.other, U.sus]) expect((await grant(u, B1)).ok).toBe(true);
    expect((await grant(U.reader, B2)).ok).toBe(true);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('chỉ có quyền tạo nháp vẫn thấy hồ sơ mình tạo: danh sách, tìm kiếm, chi tiết', async () => {
    const c = await mkCase(U.cre);
    expect(await list(U.cre, 'vibang')).toContain(c);
    expect(await search(U.cre)).toContain(c);
    expect(await get(U.cre, c)).toHaveLength(1);
  });

  it('người khác không thấy bản nháp, kể cả Admin và người có quyền xem toàn chi nhánh', async () => {
    const c = await mkCase(U.cre);
    for (const who of [U.other, U.reader, U.boss]) {
      expect(await list(who, 'vibang'), who).not.toContain(c);
      expect(await search(who), who).not.toContain(c);
      expect(await get(who, c), who).toHaveLength(0);
    }
  });

  it('bị thu hồi chi nhánh vẫn thấy hồ sơ mình đã tạo', async () => {
    const c = await mkCase(U.cre);
    expect((await grant(U.cre, B1, false)).ok).toBe(true);
    try {
      expect(await list(U.cre, 'vibang')).toContain(c);
      expect(await search(U.cre)).toContain(c);
      expect(await get(U.cre, c)).toHaveLength(1);
    } finally {
      expect((await grant(U.cre, B1, true)).ok).toBe(true);
    }
  });

  it('hồ sơ đã ghi sổ: người tạo thấy dù không có quyền xem; người khác chưa có quyền thì không', async () => {
    // Nhóm tạm có đủ quyền để ghi sổ, sau đó bị rút hết quyền.
    const g = await owner.query(
      `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'Tạm') RETURNING id`,
      [T, OFF],
    );
    const gid = g.rows[0].id as string;
    for (const p of ['vibang.draft.own', 'vibang.confirm.own'])
      await owner.query(
        `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
        [T, gid, p],
      );
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, gid, U.cre],
    );
    const c = await mkCase(U.cre);
    expect((await op('dms_case_record', [T, U.cre, c])).ok).toBe(true);
    await owner.query(`DELETE FROM dms_group_members WHERE group_id = $1`, [gid]);
    expect(await list(U.cre, 'vibang')).toContain(c);
    expect(await search(U.cre)).toContain(c);
    expect(await list(U.other, 'vibang')).not.toContain(c);
  });

  it('tài khoản đang bị tạm khóa không thấy gì kể cả hồ sơ mình tạo', async () => {
    const c = await mkCase(U.sus);
    expect(await list(U.sus, 'vibang')).toContain(c);
    await owner.query(
      `UPDATE users SET suspended_at = now(), suspend_reason = 'thử' WHERE id = $1`,
      [U.sus],
    );
    try {
      expect(await list(U.sus, 'vibang')).toHaveLength(0);
      expect(await search(U.sus)).toHaveLength(0);
      expect(await get(U.sus, c)).toHaveLength(0);
    } finally {
      await owner.query(
        `UPDATE users SET suspended_at = NULL, suspend_reason = NULL WHERE id = $1`,
        [U.sus],
      );
    }
  });

  it('danh sách cũ và tìm kiếm mới cho cùng một tập hồ sơ với mọi người', async () => {
    await mkCase(U.cre, 'tongdat');
    for (const who of Object.values(U)) {
      expect(new Set(await search(who)), who).toEqual(new Set(await list(who)));
    }
  });

  it('Lịch sử hồ sơ: người xem được hồ sơ thấy việc đã làm kèm người làm; người khác nhận rỗng', async () => {
    const c = await mkCase(U.cre);
    const mine = await history(U.cre, c);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.map((r) => r.action)).toContain('dms.case.create_draft');
    expect(mine.every((r) => typeof r.actor_label === 'string')).toBe(true);
    expect(await history(U.other, c)).toHaveLength(0);
    expect(await history(U.boss, c)).toHaveLength(0);
    expect(await history(U.cre, id())).toHaveLength(0);
  });

  it('thẻ số "việc còn dở" kiểm cả chi nhánh (đã vá 0102)', async () => {
    const def = (
      await owner.query(
        `SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p WHERE p.proname = 'dms_domain_pending_counts'`,
      )
    ).rows[0].d as string;
    expect(def).toContain('c.created_by, c.branch_id)');
  });
});
