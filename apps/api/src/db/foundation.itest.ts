import { readdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { branches } from './schema';

// Cần PostgreSQL tạm với quyền tạo database. Không dùng dữ liệu thật.
const ADMIN_URL = process.env.DATABASE_URL;
const MIGRATION_DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(MIGRATION_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(MIGRATION_DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_it_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('foundation schema on PostgreSQL', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const officeA = randomUUID();
  const officeB = randomUUID();

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
    app = new pg.Pool({ connectionString: appUrl.toString(), max: 2 });

    // Seed giả lập bằng owner (bỏ qua RLS vì owner là superuser).
    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1, 'Tenant A'), ($2, 'Tenant B')`, [
      tenantA,
      tenantB,
    ]);
    await owner.query(
      `INSERT INTO offices (id, tenant_id, name) VALUES ($1, $2, 'VP A'), ($3, $4, 'VP B')`,
      [officeA, tenantA, officeB, tenantB],
    );
    await owner.query(
      `INSERT INTO branches (tenant_id, office_id, name) VALUES ($1, $2, 'CN A1')`,
      [tenantA, officeA],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const asTenant = async <T>(
    tenantId: string | null,
    fn: (c: pg.PoolClient) => Promise<T>,
  ): Promise<T> => {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      if (tenantId) await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  };

  it('isolates rows by tenant and shows nothing without tenant context', async () => {
    const own = await asTenant(tenantA, (c) => c.query('SELECT count(*)::int AS n FROM branches'));
    const other = await asTenant(tenantB, (c) =>
      c.query('SELECT count(*)::int AS n FROM branches'),
    );
    const none = await asTenant(null, (c) => c.query('SELECT count(*)::int AS n FROM branches'));
    expect([own.rows[0].n, other.rows[0].n, none.rows[0].n]).toEqual([1, 0, 0]);
  });

  it('blocks writes into another tenant', async () => {
    await expect(
      asTenant(tenantB, (c) =>
        c.query(`INSERT INTO branches (tenant_id, office_id, name) VALUES ($1, $2, 'evil')`, [
          tenantA,
          officeA,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('refuses a branch whose office belongs to another tenant (branch != tenant)', async () => {
    await expect(
      owner.query(`INSERT INTO branches (tenant_id, office_id, name) VALUES ($1, $2, 'cross')`, [
        tenantA,
        officeB,
      ]),
    ).rejects.toThrow(/branches_office_tenant_fk/);
  });

  it('keeps audit_log append-only and records a denial row', async () => {
    await asTenant(tenantA, (c) =>
      c.query(
        `INSERT INTO audit_log (tenant_id, actor_id, action, outcome, reason) VALUES ($1, 'u1', 'case.read', 'deny', 'BRANCH_NOT_GRANTED')`,
        [tenantA],
      ),
    );
    await expect(
      asTenant(tenantA, (c) => c.query(`UPDATE audit_log SET outcome = 'allow'`)),
    ).rejects.toThrow(/append-only/);
    await expect(asTenant(tenantA, (c) => c.query('DELETE FROM audit_log'))).rejects.toThrow(
      /append-only/,
    );
    await expect(owner.query('TRUNCATE audit_log')).rejects.toThrow(/append-only/);
  });

  it('matches the Drizzle schema used by application code', async () => {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantA]);
      const db = drizzle(client);
      const rows = await db.select().from(branches).where(eq(branches.tenantId, tenantA));
      expect(rows.map((r) => r.name)).toEqual(['CN A1']);
      await db.execute(sql`SELECT 1`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  it('rolls the whole migration back atomically', async () => {
    const scratch = `${DB}_rb`;
    await admin.query(`CREATE DATABASE ${scratch}`);
    const pool = new pg.Pool({ connectionString: withDb(ADMIN_URL!, scratch), max: 1 });
    try {
      const c = await pool.connect();
      await c.query('BEGIN');
      await c.query(MIGRATION);
      await c.query('ROLLBACK');
      c.release();
      const { rows } = await pool.query(
        `SELECT to_regclass('tenants') AS t, to_regclass('audit_log') AS a`,
      );
      expect(rows[0]).toEqual({ t: null, a: null });
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE ${scratch}`);
    }
  });
});
