import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Cần PostgreSQL tạm có quyền tạo database. Dữ liệu giả lập; không số tiền, không MISA thật.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_num_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

interface Op {
  ok: boolean;
  code: string;
  label: string | null;
}

describe.skipIf(!ADMIN_URL)(
  'manual MISA confirmation, numbering and revoke gate on PostgreSQL',
  () => {
    const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
    let owner: pg.Pool;
    let app: pg.Pool;
    const id = () => randomUUID();
    const T = id();
    const T2 = id();
    const OFF = id();
    const OFF2 = id();
    const BR1 = id();
    const BR2 = id();
    const U = {
      admin: id(),
      acc: id(), // KE_TOAN được cấp chi nhánh 1
      accOther: id(), // KE_TOAN chỉ được cấp chi nhánh 2
      accNoGrant: id(),
      clerk: id(), // VAN_THU chi nhánh 1
      clerkOther: id(), // VAN_THU chi nhánh 2
      thv: id(),
    };
    const CUST = id();

    /** Gọi một hàm nghiệp vụ như ứng dụng: vai legal_app, RLS theo app.tenant_id, một transaction. */
    const call = async (tenant: string, sql: string, params: unknown[]): Promise<Op> => {
      const cl = await app.connect();
      try {
        await cl.query('BEGIN');
        await cl.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
        const r = await cl.query(sql, params);
        await cl.query('COMMIT');
        return r.rows[0] as Op;
      } catch (e) {
        await cl.query('ROLLBACK');
        throw e;
      } finally {
        cl.release();
      }
    };
    // Dùng `SELECT * FROM fn(...)`: `SELECT (fn(...)).*` sẽ chạy hàm một lần cho mỗi cột.
    const record = (c: string, actor: string, status: string, ref: string | null = 'MISA-001') =>
      call(T, `SELECT * FROM vibang_record_misa($1,$2,$3,$4,$5)`, [T, c, actor, status, ref]);
    const allocate = (c: string, actor: string, at: string = '2026-06-01T03:00:00Z') =>
      call(T, `SELECT * FROM vibang_allocate_number($1,$2,$3,$4)`, [T, c, actor, at]);
    const propose = (c: string, actor: string, reason: string | null = 'nhập nhầm') =>
      call(T, `SELECT * FROM vibang_propose_revoke($1,$2,$3,$4)`, [T, c, actor, reason]);
    const decide = (c: string, actor: string, accept: boolean) =>
      call(T, `SELECT * FROM vibang_decide_revoke($1,$2,$3,$4)`, [T, c, actor, accept]);
    const importLast = (actor: string, year: number, last: number) =>
      call(T, `SELECT * FROM vibang_import_last_number($1,$2,$3,$4,$5)`, [
        T,
        OFF,
        actor,
        year,
        last,
      ]);

    const newCase = async (status = 'ASSIGNED', branch = BR1): Promise<string> => {
      const cid = id();
      await owner.query(
        `INSERT INTO vibang_cases (id, tenant_id, office_id, branch_id, customer_id, title) VALUES ($1,$2,$3,$4,$5,'Hồ sơ giả lập')`,
        [cid, T, OFF, branch, CUST],
      );
      if (status !== 'INTAKE') {
        await owner.query(
          `UPDATE vibang_cases SET status = 'ASSIGNED', responsible_thv_user_id = $2, version = version + 1 WHERE id = $1`,
          [cid, U.thv],
        );
      }
      return cid;
    };
    const confirmed = async (): Promise<string> => {
      const cid = await newCase();
      expect(await record(cid, U.acc, 'CONFIRMED_FULL')).toMatchObject({ ok: true });
      return cid;
    };
    const setStatus = (cid: string, status: string, extra = '') =>
      owner.query(
        `UPDATE vibang_cases SET status = $2 ${extra}, version = version + 1 WHERE id = $1`,
        [cid, status],
      );
    const denials = async (action: string, reason: string) =>
      (
        await owner.query(
          `SELECT count(*)::int AS n FROM audit_log WHERE action = $1 AND outcome = 'deny' AND reason = $2`,
          [action, reason],
        )
      ).rows[0].n as number;
    const count = async (sql: string, params: unknown[]) =>
      (await owner.query(sql, params)).rows[0].n as number;

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
      app = new pg.Pool({ connectionString: appUrl.toString(), max: 12 });

      await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
      await owner.query(
        `INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A'),($3,$4,'VP B')`,
        [OFF, T, OFF2, T2],
      );
      await owner.query(
        `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN1'),($4,$2,$3,'CN2')`,
        [BR1, T, OFF, BR2],
      );
      const people: [string, string, string | null][] = [
        [U.admin, 'ADMIN', null],
        [U.acc, 'KE_TOAN', BR1],
        [U.accOther, 'KE_TOAN', BR2],
        [U.accNoGrant, 'KE_TOAN', null],
        [U.clerk, 'VAN_THU', BR1],
        [U.clerkOther, 'VAN_THU', BR2],
        [U.thv, 'THV', null],
      ];
      for (const [uid, role, branch] of people) {
        await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
          uid,
          T,
          role,
        ]);
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

    it('stores no money: the new tables have no amount, price or payment column', async () => {
      const { rows } = await owner.query(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_name IN ('vibang_misa_confirmations','vibang_misa_events','vibang_numbers','vibang_number_counters','vibang_number_imports')
           AND column_name ~* '(amount|price|money|total|payment|debt|vat|invoice|tien)'`,
      );
      expect(rows).toEqual([]);
    });

    it('lets only the granted accountant record the manual MISA status, and audits every denial', async () => {
      const c = await newCase();
      expect(await record(c, U.accOther, 'CONFIRMED_FULL')).toMatchObject({
        ok: false,
        code: 'BRANCH_NOT_GRANTED',
      });
      expect(await record(c, U.accNoGrant, 'CONFIRMED_FULL')).toMatchObject({
        ok: false,
        code: 'BRANCH_NOT_GRANTED',
      });
      expect(await record(c, U.clerk, 'CONFIRMED_FULL')).toMatchObject({
        ok: false,
        code: 'ROLE_LACKS_PERMISSION',
      });
      expect(await record(c, U.admin, 'CONFIRMED_FULL')).toMatchObject({
        ok: false,
        code: 'ROLE_LACKS_PERMISSION',
      });
      expect(await record(c, U.acc, 'CONFIRMED_FULL', '  ')).toMatchObject({
        ok: false,
        code: 'REFERENCE_REQUIRED',
      });
      expect(await record(c, U.acc, 'PARTIAL')).toMatchObject({
        ok: false,
        code: 'INVALID_STATUS',
      });
      expect(await record(c, U.acc, 'CONFIRMED_FULL')).toMatchObject({ ok: true });
      expect(await denials('vibang.misa.record', 'BRANCH_NOT_GRANTED')).toBeGreaterThanOrEqual(2);
      const ev = await owner.query(
        `SELECT event, actor_user_id FROM vibang_misa_events WHERE case_id = $1`,
        [c],
      );
      expect(ev.rows).toEqual([{ event: 'CONFIRMED_FULL', actor_user_id: U.acc }]);
    });

    it('denies allocation when unpaid, for the wrong clerk/branch/role, or before assignment', async () => {
      const unpaid = await newCase();
      expect(await allocate(unpaid, U.clerk)).toMatchObject({
        ok: false,
        code: 'MISA_NOT_CONFIRMED',
      });
      await record(unpaid, U.acc, 'NOT_CONFIRMED', null);
      expect(await allocate(unpaid, U.clerk)).toMatchObject({
        ok: false,
        code: 'MISA_NOT_CONFIRMED',
      });

      const c = await confirmed();
      expect(await allocate(c, U.clerkOther)).toMatchObject({
        ok: false,
        code: 'BRANCH_NOT_GRANTED',
      });
      expect(await allocate(c, U.acc)).toMatchObject({ ok: false, code: 'ROLE_LACKS_PERMISSION' });
      expect(await allocate(c, U.admin)).toMatchObject({
        ok: false,
        code: 'ROLE_LACKS_PERMISSION',
      });

      const intake = await newCase('INTAKE');
      expect(await allocate(intake, U.clerk)).toMatchObject({
        ok: false,
        code: 'INVALID_CASE_STATUS',
      });
      expect(
        await count(`SELECT count(*)::int n FROM vibang_numbers WHERE case_id = ANY($1)`, [
          [unpaid, c, intake],
        ]),
      ).toBe(0);
    });

    it('allocates <seq>/<year>/VB-THV once per case and is idempotent', async () => {
      const c = await confirmed();
      const first = await allocate(c, U.clerk, '2026-03-05T03:00:00Z');
      expect(first).toMatchObject({ ok: true, code: 'ALLOWED' });
      expect(first.label).toMatch(/^\d+\/2026\/VB-THV$/);
      const again = await allocate(c, U.clerk, '2026-03-06T03:00:00Z');
      expect(again).toMatchObject({ ok: true, code: 'ALREADY_ALLOCATED', label: first.label });
      expect(
        await count(`SELECT count(*)::int n FROM vibang_numbers WHERE case_id = $1`, [c]),
      ).toBe(1);
    });

    it('hands out distinct sequential numbers under parallel requests (different cases)', async () => {
      const year = 2031;
      const cases = await Promise.all(Array.from({ length: 25 }, () => confirmed()));
      const results = await Promise.all(
        cases.map((c) => allocate(c, U.clerk, `${year}-05-01T03:00:00Z`)),
      );
      expect(results.every((r) => r.ok)).toBe(true);
      const seqs = (
        await owner.query(`SELECT seq FROM vibang_numbers WHERE year = $1 ORDER BY seq`, [year])
      ).rows.map((r) => r.seq as number);
      expect(seqs).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
      const counter = await owner.query(
        `SELECT last_seq FROM vibang_number_counters WHERE year = $1`,
        [year],
      );
      expect(counter.rows[0].last_seq).toBe(25);
    });

    it('gives one number to many parallel requests for the same case', async () => {
      const c = await confirmed();
      const results = await Promise.all(
        Array.from({ length: 8 }, () => allocate(c, U.clerk, '2032-02-01T03:00:00Z')),
      );
      expect(new Set(results.map((r) => r.label)).size).toBe(1);
      expect(results.filter((r) => r.code === 'ALLOWED')).toHaveLength(1);
      expect(
        await count(`SELECT count(*)::int n FROM vibang_numbers WHERE case_id = $1`, [c]),
      ).toBe(1);
    });

    it('resets per year in Vietnam time and counts per office', async () => {
      const [a, b, c] = await Promise.all([confirmed(), confirmed(), confirmed()]);
      expect((await allocate(a, U.clerk, '2040-12-31T16:59:59Z')).label).toBe('1/2040/VB-THV');
      expect((await allocate(b, U.clerk, '2040-12-31T17:00:00Z')).label).toBe('1/2041/VB-THV');
      expect((await allocate(c, U.clerk, '2040-12-31T10:00:00Z')).label).toBe('2/2040/VB-THV');
    });

    it('imports the verified last number (Admin only, forward only) and never recycles after cancellation', async () => {
      expect(await importLast(U.clerk, 2035, 100)).toMatchObject({ ok: false, code: 'ADMIN_ONLY' });
      expect(await importLast(U.acc, 2035, 100)).toMatchObject({ ok: false, code: 'ADMIN_ONLY' });
      expect(await importLast(U.admin, 2035, -1)).toMatchObject({
        ok: false,
        code: 'INVALID_NUMBER',
      });
      expect(await importLast(U.admin, 2035, 100)).toMatchObject({ ok: true });

      const first = await confirmed();
      expect((await allocate(first, U.clerk, '2035-04-01T03:00:00Z')).label).toBe(
        '101/2035/VB-THV',
      );
      await setStatus(first, 'CANCELLED', `, cancel_reason = 'khách huỷ'`);
      const second = await confirmed();
      expect((await allocate(second, U.clerk, '2035-04-02T03:00:00Z')).label).toBe(
        '102/2035/VB-THV',
      );
      expect(
        (await owner.query(`SELECT label FROM vibang_numbers WHERE case_id = $1`, [first])).rows[0]
          .label,
      ).toBe('101/2035/VB-THV');

      expect(await importLast(U.admin, 2035, 50)).toMatchObject({
        ok: false,
        code: 'WOULD_MOVE_BACKWARDS',
      });
      expect(await importLast(U.admin, 2035, 200)).toMatchObject({ ok: true });
      const imp = await owner.query(
        `SELECT previous_seq, imported_seq FROM vibang_number_imports WHERE year = 2035 ORDER BY id`,
      );
      expect(imp.rows).toEqual([
        { previous_seq: 0, imported_seq: 100 },
        { previous_seq: 102, imported_seq: 200 },
      ]);
    });

    it('keeps numbers and counters immutable', async () => {
      const c = await confirmed();
      await allocate(c, U.clerk, '2036-01-10T03:00:00Z');
      await expect(
        owner.query(`UPDATE vibang_numbers SET seq = 99 WHERE case_id = $1`, [c]),
      ).rejects.toThrow(/append-only/);
      await expect(
        owner.query(`DELETE FROM vibang_numbers WHERE case_id = $1`, [c]),
      ).rejects.toThrow(/append-only/);
      await expect(
        owner.query(`UPDATE vibang_number_counters SET last_seq = 0 WHERE year = 2036`),
      ).rejects.toThrow(/only move forward/);
      await expect(
        owner.query(`DELETE FROM vibang_number_counters WHERE year = 2036`),
      ).rejects.toThrow(/only move forward/);
      await expect(
        owner.query(`UPDATE vibang_misa_events SET reason = 'x' WHERE case_id = $1`, [c]),
      ).rejects.toThrow(/append-only/);
    });

    describe('revoke gate', () => {
      /** Hồ sơ đã có số và đã ký/đóng dấu, chờ trả. */
      const stamped = async (): Promise<string> => {
        const c = await confirmed();
        expect((await allocate(c, U.clerk, '2037-01-10T03:00:00Z')).ok).toBe(true);
        await setStatus(c, 'SIGNED');
        await setStatus(c, 'STAMPED');
        return c;
      };
      const giveBack = (c: string) =>
        owner.query(
          `UPDATE vibang_cases SET status = 'RETURNED', proofs = ARRAY['FINAL_SCAN_WITH_SIGNATURE_AND_STAMP'], version = version + 1 WHERE id = $1`,
          [c],
        );
      const statusOf = async (c: string) =>
        (await owner.query(`SELECT status FROM vibang_cases WHERE id = $1`, [c])).rows[0]
          .status as string;

      it('only the granted accountant proposes; only Admin decides; all denials audited', async () => {
        const c = await stamped();
        expect(await propose(c, U.clerk)).toMatchObject({
          ok: false,
          code: 'ROLE_LACKS_PERMISSION',
        });
        expect(await propose(c, U.accOther)).toMatchObject({
          ok: false,
          code: 'BRANCH_NOT_GRANTED',
        });
        expect(await propose(c, U.acc, ' ')).toMatchObject({ ok: false, code: 'REASON_REQUIRED' });
        expect(await decide(c, U.admin, true)).toMatchObject({
          ok: false,
          code: 'NO_PENDING_REVOKE',
        });
        expect(await propose(c, U.acc)).toMatchObject({ ok: true });
        expect(await propose(c, U.acc)).toMatchObject({
          ok: false,
          code: 'REVOKE_ALREADY_PENDING',
        });
        expect(await decide(c, U.acc, true)).toMatchObject({ ok: false, code: 'ADMIN_ONLY' });
        expect(await decide(c, U.clerk, true)).toMatchObject({ ok: false, code: 'ADMIN_ONLY' });
        expect(await denials('vibang.misa.decide_revoke', 'ADMIN_ONLY')).toBeGreaterThanOrEqual(2);
      });

      it('a pending proposal blocks RETURNED and further edits; rejecting restores the gate', async () => {
        const c = await stamped();
        await propose(c, U.acc);
        await expect(giveBack(c)).rejects.toThrow(/missing legal proof for RETURNED/);
        expect(await record(c, U.acc, 'CONFIRMED_FULL', 'MISA-002')).toMatchObject({
          ok: false,
          code: 'REVOKE_PENDING',
        });
        expect(await decide(c, U.admin, false)).toMatchObject({ ok: true });
        await giveBack(c);
        expect(await statusOf(c)).toBe('RETURNED');
      });

      it('accepting revokes the confirmation but keeps the issued number and signed status; re-confirming reopens the gate', async () => {
        const c = await stamped();
        const label = (
          await owner.query(`SELECT label FROM vibang_numbers WHERE case_id = $1`, [c])
        ).rows[0].label;
        expect(await record(c, U.acc, 'NOT_CONFIRMED', null)).toMatchObject({
          ok: false,
          code: 'USE_REVOKE_AFTER_NUMBER',
        });
        await propose(c, U.acc);
        expect(await decide(c, U.admin, true)).toMatchObject({ ok: true });
        const state = (
          await owner.query(
            `SELECT status, reference FROM vibang_misa_confirmations WHERE case_id = $1`,
            [c],
          )
        ).rows[0];
        expect(state).toEqual({ status: 'NOT_CONFIRMED', reference: null });
        expect(
          (await owner.query(`SELECT label FROM vibang_numbers WHERE case_id = $1`, [c])).rows[0]
            .label,
        ).toBe(label);
        expect(await statusOf(c)).toBe('STAMPED');
        await expect(giveBack(c)).rejects.toThrow(/missing legal proof for RETURNED/);
        expect(await record(c, U.acc, 'CONFIRMED_FULL', 'MISA-003')).toMatchObject({ ok: true });
        await giveBack(c);
        const events = (
          await owner.query(`SELECT event FROM vibang_misa_events WHERE case_id = $1 ORDER BY id`, [
            c,
          ])
        ).rows.map((r) => r.event);
        expect(events).toEqual([
          'CONFIRMED_FULL',
          'REVOKE_PROPOSED',
          'REVOKE_ACCEPTED',
          'CONFIRMED_FULL',
        ]);
      });

      it('cannot touch the confirmation of a returned case', async () => {
        const c = await stamped();
        await giveBack(c);
        expect(await propose(c, U.acc)).toMatchObject({ ok: false, code: 'CASE_FINAL' });
        expect(await record(c, U.acc, 'NOT_CONFIRMED', null)).toMatchObject({
          ok: false,
          code: 'CASE_FINAL',
        });
        expect(await decide(c, U.admin, true)).toMatchObject({ ok: false, code: 'CASE_FINAL' });
      });
    });

    it('isolates tenants: another tenant context cannot reach the case', async () => {
      const c = await confirmed();
      await expect(
        call(T2, `SELECT * FROM vibang_allocate_number($1,$2,$3)`, [T, c, U.clerk]),
      ).rejects.toThrow(/row-level security/);
      const cl = await app.connect();
      try {
        await cl.query('BEGIN');
        await cl.query(`SELECT set_config('app.tenant_id', $1, true)`, [T2]);
        const r = await cl.query(`SELECT count(*)::int n FROM vibang_numbers`);
        await cl.query('COMMIT');
        expect(r.rows[0].n).toBe(0);
      } finally {
        cl.release();
      }
    });
  },
);
