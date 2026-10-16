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
const DB = `lo_rc_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('vi bằng: từ chối (Điều 28) và cấp bản sao (Điều 32)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF2 = id();
  const BR = id();
  const CUST = id();
  const U = { admin: id(), thv: id(), thvOther: id(), head: id(), clerk: id(), outsider: id() };

  const fn = async (name: string, ...args: unknown[]) => {
    const cl = await app.connect();
    try {
      await cl.query('BEGIN');
      await cl.query(`SELECT set_config('app.tenant_id', $1, true)`, [T]);
      const r = await cl.query(
        `SELECT * FROM ${name}(${args.map((_, i) => `$${i + 1}`).join(',')})`,
        args,
      );
      await cl.query('COMMIT');
      return r.rows[0] as { ok: boolean; code: string };
    } catch (e) {
      await cl.query('ROLLBACK');
      throw e;
    } finally {
      cl.release();
    }
  };
  const newCase = async (status: string): Promise<string> => {
    const cid = id();
    await owner.query(
      `INSERT INTO vibang_cases (id, tenant_id, office_id, branch_id, customer_id, title) VALUES ($1,$2,$3,$4,$5,'Hồ sơ giả lập')`,
      [cid, T, OFF, BR, CUST],
    );
    if (status !== 'INTAKE') {
      // Dựng trạng thái đích trực tiếp (bỏ qua trigger) vì test này chỉ kiểm tra hàm mới.
      const cl = await owner.connect();
      try {
        await cl.query(`SET session_replication_role = replica`);
        await cl.query(
          `UPDATE vibang_cases SET status = $2, responsible_thv_user_id = $3 WHERE id = $1`,
          [cid, status, U.thv],
        );
      } finally {
        await cl.query(`RESET session_replication_role`);
        cl.release();
      }
    }
    return cid;
  };
  const status = async (c: string) =>
    (await owner.query(`SELECT status FROM vibang_cases WHERE id = $1`, [c])).rows[0].status;

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
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN1')`,
      [BR, T, OFF],
    );
    const people: [string, string | null][] = [
      [U.admin, 'ADMIN'],
      [U.thv, 'THV'],
      [U.thvOther, 'THV'],
      [U.head, 'TRUONG_VP'],
      [U.clerk, 'THU_KY'],
      [U.outsider, null],
    ];
    for (const [uid, role] of people) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        role ?? 'x' + uid.slice(0, 4),
      ]);
      if (role) {
        await owner.query(
          `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4)`,
          [T, uid, OFF, role],
        );
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

  it('rejects a request by Điều 28 clause, records it append-only and cancels the case', async () => {
    const c = await newCase('ASSIGNED');
    expect(await fn('vb_reject_case', T, U.thv, c, 3, '', 'đời tư')).toMatchObject({
      ok: true,
      code: 'ALLOWED',
    });
    expect(await status(c)).toBe('CANCELLED');
    const r = (
      await owner.query(`SELECT clause, reason FROM vibang_rejections WHERE case_id = $1`, [c])
    ).rows[0];
    expect(r).toEqual({ clause: 3, reason: 'đời tư' });
    await expect(
      owner.query(`DELETE FROM vibang_rejections WHERE case_id = $1`, [c]),
    ).rejects.toThrow();
    expect(await fn('vb_reject_case', T, U.admin, c, 3, '', 'lần hai')).toMatchObject({
      ok: false,
      code: 'REJECT_NOT_ALLOWED',
    });
  });

  it('requires a basis for clause 8 and a valid clause and reason', async () => {
    const c = await newCase('INTAKE');
    expect(await fn('vb_reject_case', T, U.admin, c, 8, '', 'khác')).toMatchObject({
      code: 'BASIS_REQUIRED',
    });
    expect(await fn('vb_reject_case', T, U.admin, c, 9, '', 'x')).toMatchObject({
      code: 'INVALID_CLAUSE',
    });
    expect(await fn('vb_reject_case', T, U.admin, c, 2, '', '  ')).toMatchObject({
      code: 'REASON_REQUIRED',
    });
    expect(await fn('vb_reject_case', T, U.head, c, 8, 'căn cứ giả lập', 'khác')).toMatchObject({
      ok: true,
    });
  });

  it('denies rejection by non-authorised people, another THV and signed cases', async () => {
    const c = await newCase('ASSIGNED');
    expect(await fn('vb_reject_case', T, U.outsider, c, 1, '', 'x')).toMatchObject({ ok: false });
    expect(await fn('vb_reject_case', T, U.clerk, c, 1, '', 'x')).toMatchObject({ ok: false });
    expect(await fn('vb_reject_case', T, U.thvOther, c, 1, '', 'x')).toMatchObject({ ok: false });
    const signed = await newCase('SIGNED');
    expect(await fn('vb_reject_case', T, U.admin, signed, 1, '', 'x')).toMatchObject({
      code: 'REJECT_NOT_ALLOWED',
    });
    expect(await status(c)).toBe('ASSIGNED');
  });

  it('issues copies only for RETURNED cases with full fields, append-only', async () => {
    const open = await newCase('ASSIGNED');
    expect(
      await fn('vb_issue_copy', T, U.thv, open, 'AUTHORITY', 'Công an', 'Công văn 1', 1, 'A'),
    ).toMatchObject({
      code: 'CASE_NOT_RETURNED',
    });
    const c = await newCase('RETURNED');
    expect(await fn('vb_issue_copy', T, U.thv, c, 'OTHER', 'Công an', 'CV', 1, 'A')).toMatchObject({
      code: 'INVALID_KIND',
    });
    expect(await fn('vb_issue_copy', T, U.thv, c, 'AUTHORITY', ' ', 'CV', 1, 'A')).toMatchObject({
      code: 'FIELDS_REQUIRED',
    });
    expect(
      await fn('vb_issue_copy', T, U.thv, c, 'AUTHORITY', 'Công an', 'CV', 0, 'A'),
    ).toMatchObject({
      code: 'INVALID_COPIES',
    });
    expect(
      await fn('vb_issue_copy', T, U.outsider, c, 'AUTHORITY', 'Công an', 'CV', 1, 'A'),
    ).toMatchObject({
      ok: false,
    });
    expect(
      await fn('vb_issue_copy', T, U.thv, c, 'PARTICIPANT', 'Người yêu cầu', 'Điều 32 (b)', 2, 'B'),
    ).toMatchObject({
      ok: true,
      code: 'ALLOWED',
    });
    const n = (
      await owner.query(`SELECT count(*)::int n FROM vibang_copy_issuances WHERE case_id = $1`, [c])
    ).rows[0].n;
    expect(n).toBe(1);
    await expect(
      owner.query(`UPDATE vibang_copy_issuances SET copies = 9 WHERE case_id = $1`, [c]),
    ).rejects.toThrow();
    expect(await status(c)).toBe('RETURNED');
  });
});
