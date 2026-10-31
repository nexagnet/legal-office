import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Văn phòng phẩm (0082): quyền dms.stock.write theo Nhóm quyền cho nhập/xuất/điều chỉnh tồn; vai cũ vẫn giữ quyền. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmss_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('Văn phòng phẩm theo Nhóm quyền (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF_B = id();
  const OFF2 = id();
  const U = { a: id(), b: id(), old: id(), foreign: id() };
  const BR = id();

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
  const op = async (tenant: string, fn: string, args: unknown[]) => {
    const rows = await call(
      tenant,
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

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
    await owner.query(
      `INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A'),($3,$2,'VP A2'),($4,$5,'VP B')`,
      [OFF, T, OFF_B, OFF2, T2],
    );
    for (const [uid, tenant] of [
      [U.a, T],
      [U.b, T],
      [U.old, T],
      [U.foreign, T2],
    ]) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        tenant,
        uid,
      ]);
    }
    const group = async (
      tenant: string,
      office: string,
      name: string,
      perms: string[],
      users: string[],
    ) => {
      const g = await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,$3) RETURNING id`,
        [tenant, office, name],
      );
      for (const p of perms)
        await owner.query(
          `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
          [tenant, g.rows[0].id, p],
        );
      for (const u of users)
        await owner.query(
          `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
          [tenant, g.rows[0].id, u],
        );
    };
    const own = ['vtden', 'vtdi', 'vtnb'].flatMap((d) =>
      ['read', 'draft', 'confirm', 'add_document', 'download'].map((a) => `${d}.${a}.own`),
    );
    await group(T, OFF, 'THV tạo', own, [U.a, U.b]);
    await group(T, OFF_B, 'THV tạo VP2', own, [U.a]);
    await group(T2, OFF2, 'THV B', own, [U.foreign]);
    // U.b còn đọc được toàn bộ hồ sơ đã ghi sổ ở văn phòng OFF.
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN1')`,
      [BR, T, OFF],
    );
    await group(T, OFF, 'Kho', ['dms.stock.write'], [U.a]);
    await owner.query(
      `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,'ADMIN')`,
      [T, U.old, OFF],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('người trong nhóm có dms.stock.write nhập kho và điều chỉnh tồn, bắt buộc lý do; không cần vai cũ', async () => {
    const item = (await op(T, 'of_item_add', [T, U.old, OFF, 'Giấy A4', 'ream'])).label!;
    const batch = (await op(T, 'of_receive', [T, U.a, item, BR, 10, 'PN-1'])).label!;
    expect(batch).toBeTruthy();
    expect((await op(T, 'of_adjust', [T, U.a, batch, 8, ' '])).code).toBe('REASON_REQUIRED');
    expect((await op(T, 'of_adjust', [T, U.a, batch, 8, 'Hao hụt khi kiểm kê'])).ok).toBe(true);
  });

  it('người không có quyền nào bị từ chối; vai cũ vẫn dùng được trong giai đoạn chuyển tiếp', async () => {
    const item = (await op(T, 'of_item_add', [T, U.old, OFF, 'Mực', 'hộp'])).label!;
    expect((await op(T, 'of_receive', [T, U.b, item, BR, 5, 'PN-2'])).ok).toBe(false);
    const batch = (await op(T, 'of_receive', [T, U.old, item, BR, 5, 'PN-3'])).label!;
    expect((await op(T, 'of_adjust', [T, U.b, batch, 4, 'x'])).code).toBe('ADMIN_OR_HEAD_ONLY');
    expect((await op(T, 'of_adjust', [T, U.old, batch, 4, 'Kiểm kê'])).ok).toBe(true);
  });

  it('mã quyền dms.stock.write cấp được qua Nhóm quyền', async () => {
    const g = (await owner.query(`SELECT id FROM dms_permission_groups WHERE name = 'Kho'`)).rows[0]
      .id;
    await expect(
      owner.query(
        `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,'dms.stock.read')`,
        [T, g],
      ),
    ).rejects.toThrow();
  });
});
