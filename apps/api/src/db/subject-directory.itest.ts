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
const DB = `lo_sub_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('danh bạ chủ thể và hợp đồng (PostgreSQL)', () => {
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
  const ORG = id();
  const U = { admin: id(), head: id(), clerk: id(), clerk2: id(), outsider: id(), kt: id() };

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
      [U.kt, 'KE_TOAN', BR],
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

  it('stores the minimal person and organisation fields and rejects fields of the other kind', async () => {
    await owner.query(
      `INSERT INTO customers (id, tenant_id, kind, external_ref) VALUES ($1,$2,'ORGANIZATION','o')`,
      [ORG, T],
    );
    expect(
      await fn(
        'vb_update_customer',
        T,
        U.clerk,
        CUST,
        'Nguyễn Văn A',
        '001',
        'Hà Nội',
        '0900',
        null,
        null,
      ),
    ).toMatchObject({ ok: true });
    expect(
      await fn(
        'vb_update_customer',
        T,
        U.clerk,
        CUST,
        'Nguyễn Văn A',
        '001',
        'Hà Nội',
        '0900',
        'MST1',
        null,
      ),
    ).toMatchObject({ code: 'FIELD_NOT_FOR_KIND' });
    expect(
      await fn(
        'vb_update_customer',
        T,
        U.clerk,
        ORG,
        'Công ty X',
        '001',
        'HN',
        null,
        'MST1',
        'Giám đốc',
      ),
    ).toMatchObject({ code: 'FIELD_NOT_FOR_KIND' });
    expect(
      await fn(
        'vb_update_customer',
        T,
        U.clerk,
        ORG,
        'Công ty X',
        null,
        'HN',
        null,
        'MST1',
        'Giám đốc',
      ),
    ).toMatchObject({ ok: true });
    expect(
      await fn('vb_update_customer', T, U.clerk, ORG, '  ', null, null, null, null, null),
    ).toMatchObject({ code: 'NAME_REQUIRED' });
    const list = await rows('vb_list_customers', T, U.admin, 'mst1');
    expect(list.map((r) => r.display_name)).toEqual(['Công ty X']);
  });

  it('hides personal data from roles outside intake and from other tenants', async () => {
    expect(await rows('vb_list_customers', T, U.kt, null)).toEqual([]);
    expect(await rows('vb_list_customers', T, U.outsider, null)).toEqual([]);
    expect(
      await fn('vb_update_customer', T, U.kt, CUST, 'Sửa trộm', null, null, null, null, null),
    ).toMatchObject({ ok: false, code: 'ROLE_LACKS_PERMISSION' });
    const seen = await withTenant<{ n: number }>(
      T2,
      `SELECT count(*)::int AS n FROM customers`,
      [],
    );
    expect(seen[0]?.n).toBe(0);
  });

  it('keeps contracts with kind, validity and status, and validates them', async () => {
    const made = await owner.query(
      `INSERT INTO contracts (tenant_id, customer_id, external_ref) VALUES ($1,$2,'HD-1') RETURNING id`,
      [T, CUST],
    );
    const hd = made.rows[0].id as string;
    expect(
      await fn(
        'vb_update_contract',
        T,
        U.clerk,
        hd,
        'VI_BANG',
        '2026-10-01',
        '2026-10-01',
        '2027-10-01',
        'ACTIVE',
        'ghi chú',
      ),
    ).toMatchObject({ ok: true });
    expect(
      await fn('vb_update_contract', T, U.clerk, hd, 'KHAC', null, null, null, 'ACTIVE', null),
    ).toMatchObject({ code: 'INVALID_SERVICE_KIND' });
    expect(
      await fn(
        'vb_update_contract',
        T,
        U.clerk,
        hd,
        'VI_BANG',
        null,
        '2026-10-02',
        '2026-10-01',
        'ACTIVE',
        null,
      ),
    ).toMatchObject({ code: 'INVALID_VALIDITY' });
    expect(
      await fn('vb_update_contract', T, U.clerk, hd, 'VI_BANG', null, null, null, 'X', null),
    ).toMatchObject({ code: 'INVALID_STATUS' });
    expect(
      await fn('vb_update_contract', T, U.kt, hd, 'VI_BANG', null, null, null, 'ACTIVE', null),
    ).toMatchObject({ code: 'ROLE_LACKS_PERMISSION' });
    const list = await rows('vb_list_contracts', T, U.head, CUST);
    expect(list).toEqual([
      expect.objectContaining({
        external_ref: 'HD-1',
        service_kind: 'VI_BANG',
        signed_on: '2026-10-01',
        valid_to: '2027-10-01',
        status: 'ACTIVE',
      }),
    ]);
    expect(await rows('vb_list_contracts', T, U.kt, CUST)).toEqual([]);
  });
});
