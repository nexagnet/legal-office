import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Cần PostgreSQL tạm có quyền tạo database. Dữ liệu giả lập; không địa chỉ/tên thật.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_th_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
const sha = (c: string) => c.repeat(64);

describe.skipIf(!ADMIN_URL)('enforcement case (THA) on PostgreSQL', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const BR1 = id();
  const BR2 = id();
  const U = {
    admin: id(), // ADMIN, legal_signer
    head: id(), // TRUONG_VP, legal_signer
    headNoSign: id(), // TRUONG_VP không có legal_signer
    secretary: id(),
    clerk: id(), // VAN_THU chi nhánh 1
    thvA: id(),
    thvB: id(),
    thvC: id(),
    outsider: id(),
  };

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
  // Luôn `SELECT * FROM fn(...)`, không `(fn(...)).*`.
  const fn = (name: string, ...args: unknown[]) =>
    call(T, `SELECT * FROM ${name}(${[T, ...args].map((_, i) => `$${i + 1}`).join(',')})`, [
      T,
      ...args,
    ]);
  const row = async (sql: string, params: unknown[]) => (await owner.query(sql, params)).rows[0];
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
    app = new pg.Pool({ connectionString: appUrl.toString(), max: 6 });

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [OFF, T]);
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN1'),($4,$2,$3,'CN2')`,
      [BR1, T, OFF, BR2],
    );
    const people: [string, string, string | null, boolean][] = [
      [U.admin, 'ADMIN', null, true],
      [U.head, 'TRUONG_VP', null, true],
      [U.headNoSign, 'TRUONG_VP', null, false],
      [U.secretary, 'THU_KY', null, false],
      [U.clerk, 'VAN_THU', BR1, false],
      [U.thvA, 'THV', null, false],
      [U.thvB, 'THV', null, false],
      [U.thvC, 'THV', null, false],
    ];
    for (const [uid, role, branch, signer] of people) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        role + uid.slice(0, 4),
      ]);
      const m = await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role, legal_signer) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [T, uid, OFF, role, signer],
      );
      if (branch) {
        await owner.query(
          `INSERT INTO branch_grants (tenant_id, membership_id, branch_id) VALUES ($1,$2,$3)`,
          [T, m.rows[0].id, branch],
        );
      }
    }
    await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,'outsider')`, [
      U.outsider,
      T,
    ]);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const newCase = async (assignTo: string | null = U.thvA): Promise<string> => {
    const r = await fn(
      'th_create_case',
      U.clerk,
      OFF,
      BR1,
      'THA/' + id().slice(0, 8),
      'HĐDV-giả-lập',
      'QĐ-giả-lập',
    );
    expect(r).toMatchObject({ ok: true });
    if (assignTo)
      expect(await fn('th_assign', U.admin, r.label!, assignTo)).toMatchObject({ ok: true });
    return r.label!;
  };
  const party = async (cs: string, role: string, who = U.thvA) => {
    const r = await fn('th_add_party', who, cs, 'Đương sự giả lập', 'PERSON', role);
    expect(r).toMatchObject({ ok: true });
    return r.label!;
  };
  const obligation = async (cs: string, obligor: string | null = null, who = U.thvA) => {
    const r = await fn('th_add_obligation', who, cs, 'Nghĩa vụ giả lập', obligor);
    expect(r).toMatchObject({ ok: true });
    return r.label!;
  };
  const event = (
    ob: string,
    who: string,
    kind: string,
    idem: string,
    key: string | null = 'th/ev',
    hash: string | null = sha('e'),
  ) => fn('th_record_event', who, ob, kind, 'Ghi nhận giả lập', key, hash, idem);
  const obStatus = async (o: string) =>
    (await row(`SELECT status FROM th_obligations WHERE id = $1`, [o])).status as string;
  const caseStatus = async (c: string) =>
    (await row(`SELECT status FROM th_cases WHERE id = $1`, [c])).status as string;

  it('keeps a case with four parties and three obligations open until every obligation and the case itself are evidenced', async () => {
    const cs = await newCase();
    const creditor = await party(cs, 'CREDITOR');
    const debtor = await party(cs, 'DEBTOR');
    await party(cs, 'RELATED_PARTY');
    await party(cs, 'REPRESENTATIVE');
    const o1 = await obligation(cs, debtor);
    const o2 = await obligation(cs, debtor);
    const o3 = await obligation(cs, creditor);
    expect(
      (await row(`SELECT count(*)::int AS n FROM th_parties WHERE case_id = $1`, [cs])).n,
    ).toBe(4);

    expect(await event(o1, U.thvA, 'PARTIAL_RESULT', 'k1')).toMatchObject({ ok: true });
    expect(await obStatus(o1)).toBe('PARTIAL');
    expect(await event(o2, U.thvA, 'COMPLETION', 'k2')).toMatchObject({ ok: true });
    expect(await obStatus(o2)).toBe('COMPLETED');
    // Một nghĩa vụ xong / một phần: hồ sơ cha vẫn mở và không hoàn tất được.
    expect(await caseStatus(cs)).toBe('OPEN');
    expect(await fn('th_complete_case', U.admin, cs, 'th/done', sha('d'))).toMatchObject({
      ok: false,
      code: 'OBLIGATIONS_NOT_COMPLETE',
    });
    await event(o1, U.thvA, 'COMPLETION', 'k3');
    expect(await fn('th_complete_case', U.admin, cs, 'th/done', sha('d'))).toMatchObject({
      ok: false,
      code: 'OBLIGATIONS_NOT_COMPLETE',
    }); // o3 còn mở
    await event(o3, U.thvA, 'COMPLETION', 'k4');
    expect(await fn('th_complete_case', U.admin, cs, 'th/done', 'zz')).toMatchObject({
      ok: false,
      code: 'INVALID_EVIDENCE',
    });
    expect(await fn('th_complete_case', U.thvA, cs, 'th/done', sha('d'))).toMatchObject({
      ok: false,
      code: 'ADMIN_OR_HEAD_ONLY',
    });
    expect(await fn('th_complete_case', U.head, cs, 'th/done', sha('d'))).toMatchObject({
      ok: true,
    });
    expect(await caseStatus(cs)).toBe('COMPLETED');
    expect(await obligation_add_blocked(cs)).toMatchObject({ ok: false, code: 'CASE_NOT_OPEN' });
    await expect(
      owner.query(`UPDATE th_cases SET agreement_ref = 'x' WHERE id = $1`, [cs]),
    ).rejects.toThrow(/completed/);
  });

  const obligation_add_blocked = (cs: string) => fn('th_add_obligation', U.thvA, cs, 'muộn', null);

  it('never completes without any obligation and keeps events append-only and idempotent', async () => {
    const empty = await newCase();
    expect(await fn('th_complete_case', U.admin, empty, 'th/done', sha('d'))).toMatchObject({
      ok: false,
      code: 'OBLIGATIONS_NOT_COMPLETE',
    });
    const cs = await newCase();
    const o = await obligation(cs);
    expect(await event(o, U.thvA, 'PARTIAL_RESULT', 'a', null, null)).toMatchObject({
      ok: false,
      code: 'EVIDENCE_REQUIRED',
    });
    expect(await event(o, U.thvA, 'PARTIAL_RESULT', 'a', '/abs', sha('e'))).toMatchObject({
      ok: false,
      code: 'INVALID_EVIDENCE',
    });
    expect(await event(o, U.thvA, 'BOGUS', 'a')).toMatchObject({
      ok: false,
      code: 'INVALID_EVENT',
    });
    expect(await event(o, U.thvA, 'PARTIAL_RESULT', ' ')).toMatchObject({
      ok: false,
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    expect(await event(o, U.thvA, 'NOTE', 'n1', null, null)).toMatchObject({ ok: true });
    expect(await obStatus(o)).toBe('OPEN'); // ghi chú không đổi trạng thái
    const first = await event(o, U.thvA, 'PARTIAL_RESULT', 'dup');
    const again = await event(o, U.thvA, 'PARTIAL_RESULT', 'dup');
    expect(again).toMatchObject({ ok: true, code: 'ALREADY_RECORDED', label: first.label });
    expect(
      (
        await row(`SELECT count(*)::int AS n FROM th_obligation_events WHERE obligation_id = $1`, [
          o,
        ])
      ).n,
    ).toBe(2);
    await event(o, U.thvA, 'COMPLETION', 'fin');
    expect(await event(o, U.thvA, 'PARTIAL_RESULT', 'late')).toMatchObject({
      ok: false,
      code: 'OBLIGATION_FINAL',
    });
    // Không viết lại kết quả pháp lý.
    await expect(owner.query(`UPDATE th_obligation_events SET note = 'sửa'`)).rejects.toThrow();
    await expect(owner.query(`DELETE FROM th_obligation_events`)).rejects.toThrow();
    await expect(
      owner.query(`UPDATE th_obligations SET status = 'OPEN' WHERE id = $1`, [o]),
    ).rejects.toThrow(/completed/);
    await expect(owner.query(`DELETE FROM th_parties`)).rejects.toThrow();
    const book = await row(
      `SELECT obligation_status, events FROM th_obligation_book WHERE obligation_id = $1`,
      [o],
    );
    expect(book).toEqual({ obligation_status: 'COMPLETED', events: 3 });
  });

  it('denies the wrong actor, unassigned THV, wrong branch and other tenants, and audits every denial', async () => {
    const cs = await newCase();
    const o = await obligation(cs);
    expect(await fn('th_create_case', U.thvA, OFF, BR1, 'x', 'y', 'z')).toMatchObject({
      ok: false,
      code: 'ROLE_LACKS_PERMISSION',
    });
    expect(await fn('th_create_case', U.clerk, OFF, BR2, 'x', 'y', 'z')).toMatchObject({
      ok: false,
      code: 'BRANCH_NOT_GRANTED',
    });
    expect(await fn('th_create_case', U.clerk, OFF, BR1, 'x', ' ', 'z')).toMatchObject({
      ok: false,
      code: 'REFERENCE_REQUIRED',
    });
    expect(await fn('th_assign', U.thvA, cs, U.thvB)).toMatchObject({
      ok: false,
      code: 'ADMIN_OR_HEAD_ONLY',
    });
    expect(await fn('th_assign', U.admin, cs, U.clerk)).toMatchObject({
      ok: false,
      code: 'INVALID_HANDLER',
    });
    expect(await fn('th_add_party', U.thvB, cs, 'X', 'PERSON', 'DEBTOR')).toMatchObject({
      ok: false,
      code: 'NOT_ASSIGNED_HANDLER',
    });
    expect(await fn('th_add_party', U.thvA, cs, 'X', 'ALIEN', 'DEBTOR')).toMatchObject({
      ok: false,
      code: 'INVALID_PARTY',
    });
    expect(await fn('th_add_obligation', U.secretary, cs, 'x', null)).toMatchObject({
      ok: false,
      code: 'ROLE_LACKS_PERMISSION',
    });
    expect(await fn('th_add_obligation', U.thvA, cs, 'x', id())).toMatchObject({
      ok: false,
      code: 'PARTY_NOT_FOUND',
    });
    expect(await event(o, U.thvB, 'COMPLETION', 'z')).toMatchObject({
      ok: false,
      code: 'NOT_ASSIGNED_HANDLER',
    });
    expect(await event(o, U.outsider, 'COMPLETION', 'z')).toMatchObject({
      ok: false,
      code: 'ROLE_LACKS_PERMISSION',
    });
    expect(await obStatus(o)).toBe('OPEN');
    // Đương sự của hồ sơ khác không gắn được.
    const other = await newCase();
    const foreign = await party(other, 'DEBTOR');
    expect(await fn('th_add_obligation', U.thvA, cs, 'x', foreign)).toMatchObject({
      ok: false,
      code: 'PARTY_NOT_FOUND',
    });

    const otherTenant = (name: string, ...args: unknown[]) =>
      call(T2, `SELECT * FROM ${name}(${[T2, ...args].map((_, i) => `$${i + 1}`).join(',')})`, [
        T2,
        ...args,
      ]);
    expect(
      await otherTenant('th_record_event', U.admin, o, 'NOTE', 'n', null, null, 'k'),
    ).toMatchObject({
      ok: false,
      code: 'OBLIGATION_NOT_FOUND',
    });
    expect(await otherTenant('th_assign', U.admin, cs, U.thvA)).toMatchObject({
      ok: false,
      code: 'CASE_NOT_FOUND',
    });
    const cl = await app.connect();
    try {
      await cl.query('BEGIN');
      await cl.query(`SELECT set_config('app.tenant_id', $1, true)`, [T2]);
      expect((await cl.query(`SELECT count(*)::int AS n FROM th_cases`)).rows[0].n).toBe(0);
      expect((await cl.query(`SELECT count(*)::int AS n FROM th_obligation_book`)).rows[0].n).toBe(
        0,
      );
      await cl.query('ROLLBACK');
    } finally {
      cl.release();
    }
    const audits = await row(
      `SELECT count(*)::int AS n FROM audit_log WHERE action LIKE 'th.%' AND outcome = 'deny'`,
      [],
    );
    expect(audits.n).toBeGreaterThanOrEqual(12);
    // audit_log không chứa tên đương sự hay ghi chú.
    expect(
      (await row(`SELECT count(*)::int AS n FROM audit_log WHERE reason ILIKE '%giả lập%'`, [])).n,
    ).toBe(0);
  });
});
