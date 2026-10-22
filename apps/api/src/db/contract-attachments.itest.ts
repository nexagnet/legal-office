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
const DB = `lo_cc_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('tệp đính kèm và người tham gia hợp đồng (PostgreSQL)', () => {
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
  const CUST2 = id();
  const CON = id();
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
      `INSERT INTO customers (id, tenant_id, kind, external_ref) VALUES ($1,$2,'PERSON','c'),($3,$2,'ORGANIZATION','d')`,
      [CUST, T, CUST2],
    );
    await owner.query(
      `INSERT INTO contracts (id, tenant_id, customer_id, external_ref) VALUES ($1,$2,$3,'HD-1')`,
      [CON, T, CUST],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const SHA = 'a'.repeat(64);

  it('attaches contract files for intake staff only, validates evidence, and lists them', async () => {
    expect(
      await fn('vb_add_contract_attachment', T, U.outsider, CON, 'x', 'k/a.pdf', SHA),
    ).toMatchObject({
      ok: false,
      code: 'ROLE_LACKS_PERMISSION',
    });
    expect(
      await fn('vb_add_contract_attachment', T, U.clerk, id(), 'x', 'k/a.pdf', SHA),
    ).toMatchObject({
      code: 'CONTRACT_NOT_FOUND',
    });
    expect(
      await fn('vb_add_contract_attachment', T, U.clerk, CON, 'x', '../a.pdf', SHA),
    ).toMatchObject({
      code: 'INVALID_EVIDENCE',
    });
    expect(
      await fn('vb_add_contract_attachment', T, U.clerk, CON, 'Bản scan', 'k/a.pdf', SHA),
    ).toMatchObject({
      ok: true,
    });
    const list = await rows('vb_list_contract_attachments', T, U.clerk, CON);
    expect(list).toEqual([expect.objectContaining({ name: 'Bản scan', key: 'k/a.pdf' })]);
    expect(await rows('vb_list_contract_attachments', T, U.outsider, CON)).toEqual([]);
    const other = await withTenant<{ n: number }>(
      T2,
      `SELECT count(*)::int AS n FROM contract_attachments`,
      [],
    );
    expect(other[0]?.n).toBe(0);
  });

  it('links, changes and removes contract parties', async () => {
    expect(await fn('vb_set_contract_party', T, U.outsider, CON, CUST2, 'WITNESS')).toMatchObject({
      code: 'ROLE_LACKS_PERMISSION',
    });
    expect(await fn('vb_set_contract_party', T, U.clerk, CON, id(), 'WITNESS')).toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
    });
    expect(await fn('vb_set_contract_party', T, U.clerk, CON, CUST2, 'BOSS')).toMatchObject({
      code: 'INVALID_ROLE',
    });
    expect(await fn('vb_set_contract_party', T, U.clerk, CON, CUST2, 'WITNESS')).toMatchObject({
      ok: true,
    });
    expect(await fn('vb_set_contract_party', T, U.clerk, CON, CUST2, 'BENEFICIARY')).toMatchObject({
      ok: true,
    });
    expect(await rows('vb_list_contract_parties', T, U.clerk, CON)).toEqual([
      expect.objectContaining({ customer_id: CUST2, role: 'BENEFICIARY' }),
    ]);
    expect(await fn('vb_remove_contract_party', T, U.clerk, CON, CUST2)).toMatchObject({
      ok: true,
    });
    expect(await fn('vb_remove_contract_party', T, U.clerk, CON, CUST2)).toMatchObject({
      code: 'PARTY_NOT_FOUND',
    });
    expect(await rows('vb_list_contract_parties', T, U.clerk, CON)).toEqual([]);
  });
});
