import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Cần PostgreSQL tạm có quyền tạo database. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_cal_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('lịch làm việc và hạn sắp tới (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF2 = id();
  const BR = id();
  const BR2 = id();
  const CUST = id();
  const U = { admin: id(), head: id(), clerk: id(), clerk2: id(), outsider: id() };

  const withTenant = async <R>(tenant: string, sql: string, params: unknown[]): Promise<R[]> => {
    const cl = await app.connect();
    try {
      await cl.query('BEGIN');
      await cl.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
      const r = await cl.query(sql, params);
      await cl.query('COMMIT');
      return r.rows as R[];
    } catch (e) {
      await cl.query('ROLLBACK');
      throw e;
    } finally {
      cl.release();
    }
  };
  const fn = async (name: string, ...args: unknown[]) =>
    (
      await withTenant<{ ok: boolean; code: string }>(
        T,
        `SELECT * FROM ${name}(${args.map((_, i) => `$${i + 1}`).join(',')})`,
        args,
      )
    )[0];
  const rows = (name: string, ...args: unknown[]) =>
    withTenant<Record<string, unknown>>(
      T,
      `SELECT * FROM ${name}(${args.map((_, i) => `$${i + 1}`).join(',')})`,
      args,
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
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN1'),($4,$2,$3,'CN2')`,
      [BR, T, OFF, BR2],
    );
    const people: [string, string | null, string | null][] = [
      [U.admin, 'ADMIN', null],
      [U.head, 'TRUONG_VP', null],
      [U.clerk, 'VAN_THU', BR],
      [U.clerk2, 'VAN_THU', BR2],
      [U.outsider, null, null],
    ];
    for (const [uid, role, branch] of people) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        role ?? 'x' + uid.slice(0, 4),
      ]);
      if (role) {
        const m = await owner.query(
          `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4) RETURNING id`,
          [T, uid, OFF, role],
        );
        if (branch) {
          await owner.query(
            `INSERT INTO branch_grants (tenant_id, membership_id, branch_id) VALUES ($1,$2,$3)`,
            [T, m.rows[0].id, branch],
          );
        }
      }
    }
    await owner.query(
      `INSERT INTO customers (id, tenant_id, kind, external_ref) VALUES ($1,$2,'PERSON','c')`,
      [CUST, T],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('defaults to Monday–Friday, lets only Admin change the weekdays, and validates them', async () => {
    const def = await rows('of_search_calendar', T, U.clerk, OFF);
    expect(def.find((r) => r.kind === 'WEEKDAYS')?.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(await fn('of_set_work_weekdays', T, U.head, OFF, [1, 2, 3, 4, 5, 6])).toMatchObject({
      ok: false,
      code: 'ADMIN_ONLY',
    });
    expect(await fn('of_set_work_weekdays', T, U.admin, OFF, [])).toMatchObject({
      code: 'INVALID_WEEKDAYS',
    });
    expect(await fn('of_set_work_weekdays', T, U.admin, OFF, [1, 8])).toMatchObject({
      code: 'INVALID_WEEKDAYS',
    });
    expect(await fn('of_set_work_weekdays', T, U.admin, OFF, [1, 1, 2])).toMatchObject({
      code: 'INVALID_WEEKDAYS',
    });
    expect(await fn('of_set_work_weekdays', T, U.admin, OFF, [6, 1, 2])).toMatchObject({
      ok: true,
    });
    const now = await rows('of_search_calendar', T, U.clerk, OFF);
    expect(now.find((r) => r.kind === 'WEEKDAYS')?.weekdays).toEqual([1, 2, 6]);
    await fn('of_set_work_weekdays', T, U.admin, OFF, [1, 2, 3, 4, 5]);
  });

  it('manages holidays (Admin only, no duplicates) and hides the calendar from non-members', async () => {
    expect(await fn('of_add_holiday', T, U.head, OFF, '2026-09-02', 'Quốc khánh')).toMatchObject({
      code: 'ADMIN_ONLY',
    });
    expect(await fn('of_add_holiday', T, U.admin, OFF, '2026-09-02', ' ')).toMatchObject({
      code: 'INVALID_HOLIDAY',
    });
    expect(await fn('of_add_holiday', T, U.admin, OFF, '2026-09-02', 'Quốc khánh')).toMatchObject({
      ok: true,
    });
    expect(await fn('of_add_holiday', T, U.admin, OFF, '2026-09-02', 'lại')).toMatchObject({
      code: 'HOLIDAY_EXISTS',
    });
    const cal = await rows('of_search_calendar', T, U.clerk, OFF);
    expect(cal.filter((r) => r.kind === 'HOLIDAY')).toEqual([
      expect.objectContaining({ day: '2026-09-02', label: 'Quốc khánh' }),
    ]);
    expect(await rows('of_search_calendar', T, U.outsider, OFF)).toEqual([]);
    expect(await fn('of_remove_holiday', T, U.admin, OFF, '2026-09-03')).toMatchObject({
      code: 'HOLIDAY_NOT_FOUND',
    });
    expect(await fn('of_remove_holiday', T, U.admin, OFF, '2026-09-02')).toMatchObject({
      ok: true,
    });
    expect(await rows('of_search_calendar', T, U.admin, OFF)).toHaveLength(1);
  });

  it('isolates calendars by tenant (RLS)', async () => {
    await fn('of_add_holiday', T, U.admin, OFF, '2026-01-01', 'Tết dương lịch');
    const seen = await withTenant<{ n: number }>(
      T2,
      `SELECT count(*)::int AS n FROM office_holidays`,
      [],
    );
    expect(seen[0]?.n).toBe(0);
    await fn('of_remove_holiday', T, U.admin, OFF, '2026-01-01');
  });

  it('lists upcoming and overdue deadlines for pending service documents, within read scope', async () => {
    const rid = id();
    await owner.query(
      `INSERT INTO td_requests (id, tenant_id, office_id, branch_id, request_ref, created_by) VALUES ($1,$2,$3,$4,'YC-1',$5)`,
      [rid, T, OFF, BR, U.admin],
    );
    await owner.query(
      `INSERT INTO td_documents (tenant_id, request_id, recipient_name, address, deadline_at) VALUES
        ($1,$2,'Quá hạn','đ', now() - interval '1 day'),
        ($1,$2,'Sắp tới','đ', now() + interval '2 days'),
        ($1,$2,'Xa','đ', now() + interval '30 days')`,
      [T, rid],
    );
    const until = new Date(Date.now() + 7 * 86400000).toISOString();
    const mine = await rows('of_search_deadlines', T, U.clerk, OFF, until);
    expect(mine.map((r) => [r.label, r.overdue])).toEqual([
      ['Quá hạn', true],
      ['Sắp tới', false],
    ]);
    expect(await rows('of_search_deadlines', T, U.clerk2, OFF, until)).toEqual([]);
    expect(await rows('of_search_deadlines', T, U.outsider, OFF, until)).toEqual([]);
    expect(await rows('of_search_deadlines', T, U.admin, OFF, until)).toHaveLength(2);
  });
});
