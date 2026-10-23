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
const DB = `lo_ca_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('phụ lục hợp đồng (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const BR = id();
  const CUST = id();
  const CON = id();
  const U = { clerk: id(), outsider: id() };
  const SHA = 'a'.repeat(64);

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
  const call = async (tenant: string, name: string, ...args: unknown[]) =>
    withTenant<Record<string, unknown>>(
      tenant,
      `SELECT * FROM ${name}(${args.map((_, i) => `$${i + 1}`).join(',')})`,
      args,
    );
  const add = (actor: string, contract: string, over: Partial<Record<string, string>> = {}) =>
    call(
      T,
      'vb_add_contract_addendum',
      T,
      actor,
      contract,
      over.kind ?? 'EXTEND',
      over.summary ?? 'Gia hạn thêm 6 tháng',
      over.effective ?? '2026-11-01',
      over.name ?? '',
      over.key ?? 'k/pl.pdf',
      over.sha ?? SHA,
    ).then((r) => r[0] as { ok: boolean; code: string });

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
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [OFF, T]);
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN1')`,
      [BR, T, OFF],
    );
    for (const [uid, role] of [
      [U.clerk, 'VAN_THU'],
      [U.outsider, null],
    ] as const) {
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
        await owner.query(
          `INSERT INTO branch_grants (tenant_id, membership_id, branch_id) VALUES ($1,$2,$3)`,
          [T, m.rows[0].id, BR],
        );
      }
    }
    await owner.query(
      `INSERT INTO customers (id, tenant_id, kind, external_ref) VALUES ($1,$2,'PERSON','c')`,
      [CUST, T],
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

  it('chỉ vai tiếp nhận được thêm; kiểm tra hợp đồng, loại, nội dung, ngày và bản scan', async () => {
    expect(await add(U.outsider, CON)).toMatchObject({ ok: false, code: 'ROLE_LACKS_PERMISSION' });
    expect(await add(U.clerk, id())).toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
    expect(await add(U.clerk, CON, { kind: 'BOSS' })).toMatchObject({ code: 'INVALID_KIND' });
    expect(await add(U.clerk, CON, { summary: '   ' })).toMatchObject({ code: 'INVALID_SUMMARY' });
    expect(await add(U.clerk, CON, { key: '../a.pdf' })).toMatchObject({
      code: 'INVALID_EVIDENCE',
    });
    const none = await call(T, 'vb_list_contract_addenda', T, U.clerk, CON);
    expect(none).toEqual([]);
  });

  it('đánh số phụ lục tăng dần theo hợp đồng, lưu kèm bản scan và không lẫn tenant', async () => {
    expect(await add(U.clerk, CON)).toMatchObject({ ok: true, code: 'ALLOWED' });
    expect(
      await add(U.clerk, CON, { kind: 'SCOPE', summary: 'Bổ sung phạm vi', key: 'k/pl2.pdf' }),
    ).toMatchObject({ ok: true });
    const list = await call(T, 'vb_list_contract_addenda', T, U.clerk, CON);
    expect(list).toEqual([
      expect.objectContaining({ seq: 1, kind: 'EXTEND', effective_from: '2026-11-01' }),
      expect.objectContaining({ seq: 2, kind: 'SCOPE', summary: 'Bổ sung phạm vi' }),
    ]);
    const atts = await call(T, 'vb_list_contract_attachments', T, U.clerk, CON);
    expect(atts.map((a) => a.name)).toEqual(['Phụ lục 1', 'Phụ lục 2']);
    expect(await call(T, 'vb_list_contract_addenda', T, U.outsider, CON)).toEqual([]);
    const other = await withTenant<{ n: number }>(
      T2,
      `SELECT count(*)::int AS n FROM contract_addenda`,
      [],
    );
    expect(other[0]?.n).toBe(0);
  });

  it('hai phụ lục thêm cùng lúc vẫn có số khác nhau', async () => {
    await Promise.all([
      add(U.clerk, CON, { key: 'k/a1.pdf' }),
      add(U.clerk, CON, { key: 'k/a2.pdf' }),
    ]);
    const seqs = (await call(T, 'vb_list_contract_addenda', T, U.clerk, CON)).map((r) => r.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs).toEqual([...seqs].sort((x, y) => (x as number) - (y as number)));
  });
});
