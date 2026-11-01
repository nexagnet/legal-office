import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// 0091: mã quyền amend_request / dms.amendment.approve, bù quyền cho nhóm đang chạy, 6 nhóm mẫu Figma P0. PostgreSQL thật.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const FILES = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const sqlOf = (files: string[]) =>
  files.map((f) => readFileSync(resolve(DIR, f), 'utf8')).join('\n');
const DB = `lo_cat_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const DB_OLD = `lo_cato_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const SHA = 'a'.repeat(64);

describe.skipIf(!ADMIN_URL)('Danh mục quyền và nhóm mẫu (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  const OFF_CONFLICT = id();
  const U = { adm: id(), clerk: id(), drafter: id(), reviewer: id(), approver: id() };

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
  const perms = async (group: string) =>
    (
      await owner.query(
        `SELECT permission FROM dms_group_permissions WHERE group_id = $1 ORDER BY permission`,
        [group],
      )
    ).rows.map((r) => r.permission as string);
  const template = async (office: string, name: string) =>
    (
      await owner.query(
        `SELECT id, kind, status, version FROM dms_permission_groups WHERE office_id = $1 AND name = $2`,
        [office, name],
      )
    ).rows[0] as { id: string; kind: string; status: string; version: number };

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${DB}`);
    await admin.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legal_app') THEN CREATE ROLE legal_app LOGIN; END IF; END $$`,
    );
    owner = new pg.Pool({ connectionString: withDb(ADMIN_URL!, DB), max: 2 });
    await owner.query(sqlOf(FILES));
    await owner.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO legal_app');
    await owner.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO legal_app');
    const appUrl = new URL(withDb(ADMIN_URL!, DB));
    appUrl.username = 'legal_app';
    appUrl.password = '';
    app = new pg.Pool({ connectionString: appUrl.toString(), max: 4 });

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A')`, [T]);
    await owner.query(
      `INSERT INTO offices (id, tenant_id, name) VALUES ($1,$3,'VP A'),($2,$3,'VP B')`,
      [OFF, OFF_CONFLICT, T],
    );
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
    // Văn phòng B đã có nhóm tên "Văn thư" (tùy chỉnh) trước khi gieo mẫu.
    await owner.query(
      `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'Văn thư')`,
      [T, OFF_CONFLICT],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.query(`DROP DATABASE IF EXISTS ${DB_OLD}`);
    await admin.end();
  });

  it('gieo đúng 6 nhóm mẫu theo bảng quy đổi, được bảo vệ, chưa có thành viên; gieo lại không đổi gì', async () => {
    expect((await call('SELECT dms_seed_template_groups($1,$2) AS n', [T, OFF]))[0].n).toBe(6);
    expect((await call('SELECT dms_seed_template_groups($1,$2) AS n', [T, OFF]))[0].n).toBe(0);

    const admGroup = await template(OFF, 'Admin hệ thống');
    expect(admGroup).toMatchObject({ kind: 'TEMPLATE', status: 'ACTIVE', version: 1 });
    expect(await perms(admGroup.id)).toEqual([
      'dms.amendment.approve',
      'dms.permission.approve',
      'dms.permission.propose',
    ]);

    const thv = await perms((await template(OFF, 'Thừa hành viên')).id);
    expect(thv).toHaveLength(24);
    expect(thv.every((p) => p.endsWith('.own'))).toBe(true);
    expect(thv).toContain('vibang.confirm.own');
    expect(thv).toContain('tochuc.amend_request.own');

    const secretary = await perms((await template(OFF, 'Thư ký / Trợ lý hồ sơ')).id);
    expect(secretary).toHaveLength(16);
    expect(secretary.some((p) => p.includes('.confirm.') || p.includes('.download.'))).toBe(false);
    expect(secretary).toContain('vibang.amend_request.own');

    const clerk = await perms((await template(OFF, 'Văn thư')).id);
    expect(clerk).toHaveLength(15);
    expect(clerk.every((p) => /^vt(den|di|nb)\..*\.all$/.test(p))).toBe(true);
    expect(clerk.some((p) => p.includes('.download.'))).toBe(false);

    expect(await perms((await template(OFF, 'Kế toán')).id)).toEqual(['dms.stock.write']);
    const report = await perms((await template(OFF, 'Báo cáo tổng hợp')).id);
    expect(report).toHaveLength(7);
    expect(report.every((p) => p.endsWith('.read.all'))).toBe(true);

    const members = await owner.query(
      `SELECT 1 FROM dms_group_members m JOIN dms_permission_groups g ON g.id = m.group_id WHERE g.office_id = $1`,
      [OFF],
    );
    expect(members.rowCount).toBe(0);
  });

  it('nhóm mẫu được bảo vệ: không đổi quyền trực tiếp, không ngừng dùng; trùng tên thì thêm hậu tố', async () => {
    const thv = await template(OFF, 'Thừa hành viên');
    const r = await op('dms_permission_propose', [
      T,
      U.adm,
      thv.id,
      'GRANT',
      'vibang.read.all',
      null,
      'thử',
    ]);
    expect(r.code).toBe('TEMPLATE_PROTECTED');
    expect((await op('dms_group_set_status', [T, U.adm, thv.id, 'RETIRED', 'thử'])).code).toBe(
      'TEMPLATE_PROTECTED',
    );

    await call('SELECT dms_seed_template_groups($1,$2)', [T, OFF_CONFLICT]);
    expect((await template(OFF_CONFLICT, 'Văn thư')).kind).toBe('CUSTOM');
    expect((await template(OFF_CONFLICT, 'Văn thư (mẫu)')).kind).toBe('TEMPLATE');
  });

  it('sao chép nhóm mẫu thành nhóm tùy chỉnh, không chép dms.permission.* và dms.amendment.approve', async () => {
    const src = await template(OFF, 'Admin hệ thống');
    const copy = await op('dms_group_copy', [T, U.adm, src.id, 'Quản trị bản sao']);
    expect(copy.ok).toBe(true);
    expect(await perms(copy.label!)).toEqual([]);
    const thv = await template(OFF, 'Thừa hành viên');
    const c2 = await op('dms_group_copy', [T, U.adm, thv.id, 'THV của tôi']);
    expect(await perms(c2.label!)).toHaveLength(24);
  });

  it('mã mới được nhận ở yêu cầu đổi quyền, mã lạ vẫn bị từ chối', async () => {
    const g = (
      await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'Tùy chỉnh') RETURNING id`,
        [T, OFF],
      )
    ).rows[0].id as string;
    const propose = (p: string) =>
      op('dms_permission_propose', [T, U.adm, g, 'GRANT', p, null, 'thử']);
    expect((await propose('vibang.amend_request.own')).code).toBe('REQUEST_APPLIED');
    expect((await propose('vtden.amend_request.all')).code).toBe('REQUEST_APPLIED');
    expect((await propose('dms.amendment.approve')).code).toBe('REQUEST_APPLIED');
    expect((await propose('vibang.amend.own')).code).toBe('UNKNOWN_PERMISSION');
    expect((await propose('dms.amendment.delete')).code).toBe('UNKNOWN_PERMISSION');
    expect((await perms(g)).sort()).toEqual([
      'dms.amendment.approve',
      'vibang.amend_request.own',
      'vtden.amend_request.all',
    ]);
  });

  describe('đề nghị và duyệt sửa đổi theo hai quyền riêng', () => {
    let caseId: string;
    const mkGroup = async (name: string, ps: string[], users: string[]) => {
      const g = (
        await owner.query(
          `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,$3) RETURNING id`,
          [T, OFF, name],
        )
      ).rows[0].id as string;
      for (const p of ps)
        await owner.query(
          `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
          [T, g, p],
        );
      for (const u of users)
        await owner.query(
          `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
          [T, g, u],
        );
    };
    const proposeAmend = (u: string) =>
      op('dms_amendment_propose', [
        T,
        u,
        caseId,
        null,
        null,
        'CASE_FIELDS',
        JSON.stringify({ title: `Sửa bởi ${u.slice(0, 4)}` }),
        'Văn bản sửa đổi số 01',
        false,
        `obj/${randomUUID()}`,
        SHA,
        'application/pdf',
        100,
      ]);

    beforeAll(async () => {
      await mkGroup(
        'Tạo và đọc',
        ['vibang.read.all', 'vibang.draft.own', 'vibang.confirm.own'],
        [U.clerk],
      );
      // Chỉ amend_request (không có draft): đủ để đề nghị sửa đổi.
      await mkGroup('Chỉ đề nghị', ['vibang.read.all', 'vibang.amend_request.all'], [U.drafter]);
      // Chỉ quyền duyệt sửa đổi, không duyệt đổi quyền.
      await mkGroup('Duyệt sửa đổi', ['vibang.read.all', 'dms.amendment.approve'], [U.reviewer]);
      // Chỉ quyền duyệt đổi quyền, không duyệt sửa đổi.
      await mkGroup('Duyệt đổi quyền', ['vibang.read.all', 'dms.permission.approve'], [U.approver]);
      const c = await op('dms_case_create_draft', [
        T,
        U.clerk,
        OFF,
        'vibang',
        'Hồ sơ gốc',
        JSON.stringify({}),
      ]);
      caseId = c.label!;
      expect((await op('dms_case_record', [T, U.clerk, caseId])).ok).toBe(true);
    });

    it('có draft nhưng không có amend_request thì không đề nghị được; có amend_request thì đề nghị được', async () => {
      expect((await proposeAmend(U.clerk)).code).toBe('PERMISSION_DENIED');
      const r = await proposeAmend(U.drafter);
      expect(r.code).toBe('AMENDMENT_PENDING');
    });

    it('chỉ dms.amendment.approve mới duyệt được; dms.permission.approve không duyệt được sửa đổi', async () => {
      const r = await proposeAmend(U.drafter);
      const denied = await op('dms_amendment_review', [T, U.approver, r.label, true, null]);
      expect(denied.ok).toBe(false);
      const ok = await op('dms_amendment_review', [T, U.reviewer, r.label, true, null]);
      expect(ok.code).toBe('AMENDMENT_APPROVED');
    });

    it('Admin (mặc nhiên đủ cả hai) đề nghị có hiệu lực ngay', async () => {
      expect((await proposeAmend(U.adm)).code).toBe('AMENDMENT_APPLIED');
    });
  });

  it('migration bù quyền cho nhóm đang chạy: draft có thêm amend_request cùng phạm vi, permission.approve có thêm amendment.approve', async () => {
    await admin.query(`CREATE DATABASE ${DB_OLD}`);
    const old = new pg.Pool({ connectionString: withDb(ADMIN_URL!, DB_OLD), max: 1 });
    try {
      const before = FILES.filter((f) => f < '0091');
      await old.query(sqlOf(before));
      const t = id();
      const o = id();
      await old.query(`INSERT INTO tenants (id, name) VALUES ($1,'T')`, [t]);
      await old.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP')`, [o, t]);
      const mk = async (name: string, ps: string[]) => {
        const g = (
          await old.query(
            `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,$3) RETURNING id`,
            [t, o, name],
          )
        ).rows[0].id as string;
        for (const p of ps)
          await old.query(
            `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
            [t, g, p],
          );
        return g;
      };
      const drafter = await mk('Soạn', ['vibang.draft.own', 'vtden.draft.all', 'vibang.read.own']);
      const manager = await mk('Quản trị', ['dms.permission.approve', 'dms.permission.propose']);
      const reader = await mk('Đọc', ['vibang.read.all']);

      await old.query(sqlOf(FILES.filter((f) => f >= '0091')));
      const of = async (g: string) =>
        (
          await old.query(
            `SELECT permission FROM dms_group_permissions WHERE group_id = $1 ORDER BY permission`,
            [g],
          )
        ).rows.map((r) => r.permission as string);
      const version = async (g: string) =>
        (await old.query(`SELECT version FROM dms_permission_groups WHERE id = $1`, [g])).rows[0]
          .version as number;

      expect(await of(drafter)).toEqual([
        'vibang.amend_request.own',
        'vibang.draft.own',
        'vibang.read.own',
        'vtden.amend_request.all',
        'vtden.draft.all',
      ]);
      expect(await of(manager)).toEqual([
        'dms.amendment.approve',
        'dms.permission.approve',
        'dms.permission.propose',
      ]);
      expect(await of(reader)).toEqual(['vibang.read.all']);
      expect(await version(drafter)).toBe(2);
      expect(await version(manager)).toBe(2);
      expect(await version(reader)).toBe(1);
      // Văn phòng có sẵn cũng được gieo nhóm mẫu.
      const tpl = await old.query(
        `SELECT count(*)::int AS n FROM dms_permission_groups WHERE office_id = $1 AND kind = 'TEMPLATE'`,
        [o],
      );
      expect(tpl.rows[0].n).toBe(6);
    } finally {
      await old.end();
    }
  });
});
