import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS Phase 5 (0080): báo cáo tổng hợp số liệu theo miền/năm, chỉ phần người xem được quyền đọc. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsr_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS báo cáo tổng hợp (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF_B = id();
  const OFF2 = id();
  const U = { a: id(), b: id(), foreign: id() };
  const YEAR = new Date().getFullYear();

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
  const mkCase = async (u: string, domain: string, office = OFF, attrs: object = {}) =>
    (
      await op(T, 'dms_case_create_draft', [
        T,
        u,
        office,
        domain,
        `Hồ sơ ${domain}`,
        JSON.stringify(attrs),
      ])
    ).label!;
  const record = (u: string, caseId: string) => op(T, 'dms_case_record', [T, u, caseId]);
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
    const own = ['vibang', 'vtden'].flatMap((d) =>
      ['read', 'draft', 'confirm', 'add_document', 'download'].map((a) => `${d}.${a}.own`),
    );
    await group(T, OFF, 'THV tạo', own, [U.a, U.b]);
    await group(T, OFF_B, 'THV tạo VP2', own, [U.a]);
    await group(T2, OFF2, 'THV B', own, [U.foreign]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const report = (u: string, year = YEAR) =>
    call(T, 'SELECT * FROM dms_report_summary($1,$2,$3,$4)', [T, u, OFF, year]);
  const row = (rows: Record<string, unknown>[], d: string) => rows.find((r) => r.domain === d)!;

  it('đếm hồ sơ đã ghi sổ, tài liệu, scan, STT cuối; nháp không tính', async () => {
    const c1 = await mkCase(U.a, 'vibang');
    const doc = (await op(T, 'dms_document_add', [T, U.a, c1, 'QĐ', 'Giấy tờ', false, null]))
      .label!;
    await op(T, 'dms_file_attach', [
      T,
      U.a,
      doc,
      's',
      true,
      `k/${randomUUID()}`,
      'a'.repeat(64),
      'application/pdf',
      10,
    ]);
    await record(U.a, c1);
    await mkCase(U.a, 'vibang');
    const v = await mkCase(U.a, 'vtden');
    await record(U.a, v);
    const rows = await report(U.a);
    expect(row(rows, 'vibang')).toMatchObject({
      recorded_cases: 1,
      documents: 1,
      scans: 1,
      last_stt: 1,
    });
    expect(row(rows, 'vtden')).toMatchObject({ recorded_cases: 1, documents: 0, last_stt: 1 });
    expect(row(rows, 'tongdat')).toMatchObject({ recorded_cases: 0, last_stt: null });
  });

  it('người không có quyền đọc không thấy số liệu của hồ sơ người khác; năm lạ bị từ chối', async () => {
    const rows = await report(U.b);
    expect(row(rows, 'vibang').recorded_cases).toBe(0);
    expect((await report(U.a, 1999)).length).toBe(0);
    expect((await report(U.a, YEAR + 1)).every((r) => r.recorded_cases === 0)).toBe(true);
  });
});
