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
const DB = `lo_vb_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('vibang case schema on PostgreSQL', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const A = {
    tenant: id(),
    office: id(),
    branch: id(),
    customer: id(),
    contract: id(),
    thv: id(),
    clerk: id(),
  };
  const B = { tenant: id(), office: id(), branch: id(), customer: id() };

  const insertCase = (over: Record<string, unknown> = {}, pool: pg.Pool = owner) => {
    const v = {
      id: id(),
      tenant: A.tenant,
      office: A.office,
      branch: A.branch,
      customer: A.customer,
      contract: null,
      thv: null,
      status: 'INTAKE',
      cancel: null,
      ...over,
    };
    return pool
      .query(
        `INSERT INTO vibang_cases (id, tenant_id, office_id, branch_id, customer_id, contract_id, responsible_thv_user_id, status, cancel_reason, title)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Hồ sơ giả lập') RETURNING id`,
        [v.id, v.tenant, v.office, v.branch, v.customer, v.contract, v.thv, v.status, v.cancel],
      )
      .then((r) => r.rows[0].id as string);
  };

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${DB}`);
    await admin.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legal_app') THEN CREATE ROLE legal_app LOGIN; END IF; END $$`,
    );
    owner = new pg.Pool({ connectionString: withDb(ADMIN_URL!, DB), max: 2 });
    await owner.query(MIGRATION);
    await owner.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO legal_app');
    const appUrl = new URL(withDb(ADMIN_URL!, DB));
    appUrl.username = 'legal_app';
    appUrl.password = '';
    app = new pg.Pool({ connectionString: appUrl.toString(), max: 2 });

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [
      A.tenant,
      B.tenant,
    ]);
    await owner.query(
      `INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A'),($3,$4,'VP B')`,
      [A.office, A.tenant, B.office, B.tenant],
    );
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN A'),($4,$5,$6,'CN B')`,
      [A.branch, A.tenant, A.office, B.branch, B.tenant, B.office],
    );
    await owner.query(
      `INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,'u-thv'),($3,$2,'u-clerk')`,
      [A.thv, A.tenant, A.clerk],
    );
    const m = (user: string, role: string) =>
      owner
        .query(
          `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4) RETURNING id`,
          [A.tenant, user, A.office, role],
        )
        .then((r) => r.rows[0].id as string);
    await m(A.thv, 'THV');
    await m(A.clerk, 'THU_KY');
    await owner.query(
      `INSERT INTO customers (id, tenant_id, kind, external_ref) VALUES ($1,$2,'PERSON','c-a'),($3,$4,'ORGANIZATION','c-b')`,
      [A.customer, A.tenant, B.customer, B.tenant],
    );
    await owner.query(
      `INSERT INTO contracts (id, tenant_id, customer_id, external_ref) VALUES ($1,$2,$3,'hd-1')`,
      [A.contract, A.tenant, A.customer],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const update = (caseId: string, set: string, params: unknown[] = []) =>
    owner.query(`UPDATE vibang_cases SET ${set}, version = version + 1 WHERE id = $1`, [
      caseId,
      ...params,
    ]);
  const assigned = async () => {
    const caseId = await insertCase();
    await update(caseId, `status = 'ASSIGNED', responsible_thv_user_id = $2`, [A.thv]);
    return caseId;
  };

  it('lets one contract relate to many cases and a case exist without a contract', async () => {
    await insertCase({ contract: A.contract });
    await insertCase({ contract: A.contract });
    await insertCase();
    const { rows } = await owner.query(
      'SELECT count(*)::int AS n FROM vibang_cases WHERE contract_id = $1',
      [A.contract],
    );
    expect(rows[0].n).toBe(2);
  });

  it('refuses cross-tenant references and a branch that belongs to another office', async () => {
    await expect(insertCase({ customer: B.customer })).rejects.toThrow(
      /vibang_cases_customer_tenant_fk/,
    );
    await expect(insertCase({ branch: B.branch })).rejects.toThrow(/vibang_cases_branch_tenant_fk/);
    const office2 = id();
    const branch2 = id();
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A2')`, [
      office2,
      A.tenant,
    ]);
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN A2')`,
      [branch2, A.tenant, office2],
    );
    // Cùng tenant nhưng chi nhánh thuộc văn phòng khác: bị từ chối.
    await expect(insertCase({ branch: branch2 })).rejects.toThrow(/vibang_cases_branch_tenant_fk/);
  });

  it('starts every case as INTAKE and requires a responsible THV before legal steps', async () => {
    await expect(insertCase({ status: 'SIGNED' })).rejects.toThrow(/must start as INTAKE/);
    const c = await insertCase();
    await expect(update(c, `status = 'SIGNED'`)).rejects.toThrow(/invalid vibang transition/);
    await expect(update(c, `status = 'ASSIGNED'`)).rejects.toThrow(/vibang_cases_assigned_chk/);
  });

  it('accepts only a THV member of the same office as responsible', async () => {
    const c = await insertCase();
    await expect(
      update(c, `status = 'ASSIGNED', responsible_thv_user_id = $2`, [A.clerk]),
    ).rejects.toThrow(/responsible THV must be a THV member/);
    await expect(
      update(c, `status = 'ASSIGNED', responsible_thv_user_id = $2`, [A.thv]),
    ).resolves.toBeTruthy();
  });

  it('enforces the lifecycle path and legal proofs inside the database', async () => {
    const c = await assigned();
    await expect(update(c, `status = 'SIGNED'`)).rejects.toThrow(/missing legal proof for SIGNED/);
    await update(c, `status = 'SIGNED', proofs = ARRAY['NUMBER_ALLOCATED']`);
    await expect(update(c, `status = 'RETURNED'`)).rejects.toThrow(/invalid vibang transition/);
    await update(c, `status = 'STAMPED'`);
    await expect(update(c, `status = 'RETURNED'`)).rejects.toThrow(
      /missing legal proof for RETURNED/,
    );
    await expect(
      update(c, `status = 'RETURNED', proofs = ARRAY['NUMBER_ALLOCATED','MISA_CONFIRMED_FULL']`),
    ).rejects.toThrow(/missing legal proof for RETURNED/);
    await update(
      c,
      `status = 'RETURNED', proofs = ARRAY['NUMBER_ALLOCATED','MISA_CONFIRMED_FULL','FINAL_SCAN_WITH_SIGNATURE_AND_STAMP']`,
    );
  });

  it('requires a reason for cancellation', async () => {
    const c = await insertCase();
    await expect(update(c, `status = 'CANCELLED'`)).rejects.toThrow(
      /vibang_cases_cancel_reason_chk/,
    );
    await expect(
      update(c, `status = 'CANCELLED', cancel_reason = 'khách huỷ'`),
    ).resolves.toBeTruthy();
  });

  it('serialises optimistic updates: only one writer wins a version', async () => {
    const caseId = await insertCase();
    const bump = () =>
      owner.query(
        'UPDATE vibang_cases SET title = $2, version = version + 1 WHERE id = $1 AND version = 1',
        [caseId, 'x'],
      );
    const results = await Promise.all([bump(), bump(), bump()]);
    expect(results.map((r) => r.rowCount).sort()).toEqual([0, 0, 1]);
    const { rows } = await owner.query('SELECT version FROM vibang_cases WHERE id = $1', [caseId]);
    expect(rows[0].version).toBe(2);
  });

  it('makes returned and cancelled cases immutable and never hard-deletes or moves a case', async () => {
    const cancelled = await insertCase();
    await update(cancelled, `status = 'CANCELLED', cancel_reason = 'huỷ'`);
    await expect(
      owner.query(`UPDATE vibang_cases SET title = 'sửa' WHERE id = $1`, [cancelled]),
    ).rejects.toThrow(/final/);
    const open = await insertCase();
    await expect(owner.query('DELETE FROM vibang_cases WHERE id = $1', [open])).rejects.toThrow(
      /never hard-deleted/,
    );
    await expect(
      owner.query('UPDATE vibang_cases SET tenant_id = $2 WHERE id = $1', [open, B.tenant]),
    ).rejects.toThrow(/immutable/);
    await expect(
      owner.query('UPDATE vibang_cases SET branch_id = $2 WHERE id = $1', [open, id()]),
    ).rejects.toThrow();
  });

  it('stores change requests with before/after/reason and freezes them once decided', async () => {
    const caseId = await insertCase();
    const insert = (status: string, decidedBy: string | null) =>
      owner.query(
        `INSERT INTO vibang_case_change_requests (tenant_id, case_id, requested_by, reason, before, after, status, decided_by, decided_at)
         VALUES ($1,$2,'u1','khách đổi','{"title":"a"}','{"title":"b"}',$3,$4,$5) RETURNING id`,
        [A.tenant, caseId, status, decidedBy, decidedBy ? new Date() : null],
      );
    await expect(insert('APPROVED', null)).rejects.toThrow(/vibang_cr_decided_chk/);
    const pending = (await insert('PENDING', null)).rows[0].id as string;
    await expect(
      owner.query(
        `UPDATE vibang_case_change_requests SET after = '{"title":"zzz"}' WHERE id = $1`,
        [pending],
      ),
    ).rejects.toThrow(/frozen/);
    await owner.query(
      `UPDATE vibang_case_change_requests SET status = 'APPROVED', decided_by = 'admin-1', decided_at = now() WHERE id = $1`,
      [pending],
    );
    await expect(
      owner.query(
        `UPDATE vibang_case_change_requests SET status = 'PENDING', decided_by = NULL, decided_at = NULL WHERE id = $1`,
        [pending],
      ),
    ).rejects.toThrow(/immutable/);
    await expect(
      owner.query('DELETE FROM vibang_case_change_requests WHERE id = $1', [pending]),
    ).rejects.toThrow(/never deleted/);
    await expect(
      owner.query(
        `INSERT INTO vibang_case_change_requests (tenant_id, case_id, requested_by, reason, before, after) VALUES ($1,$2,'u1','  ','{}','{}')`,
        [A.tenant, caseId],
      ),
    ).rejects.toThrow(/reason/);
  });

  it('isolates cases by tenant for the application role', async () => {
    await insertCase();
    const asTenant = async (tenant: string | null) => {
      const c = await app.connect();
      try {
        await c.query('BEGIN');
        if (tenant) await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
        const { rows } = await c.query('SELECT count(*)::int AS n FROM vibang_cases');
        await c.query('COMMIT');
        return rows[0].n as number;
      } finally {
        c.release();
      }
    };
    expect(await asTenant(A.tenant)).toBeGreaterThan(0);
    expect(await asTenant(B.tenant)).toBe(0);
    expect(await asTenant(null)).toBe(0);
  });
});
