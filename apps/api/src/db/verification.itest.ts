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
const DB = `lo_vx_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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

describe.skipIf(!ADMIN_URL)('verification (Xác minh N-05/N-06) on PostgreSQL', () => {
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

  const auditCount = async (action: string, reason: string) =>
    (
      await row(`SELECT count(*)::int AS n FROM audit_log WHERE action = $1 AND reason = $2`, [
        action,
        reason,
      ])
    ).n as number;

  const newCase = async (assignTo: string | null = U.thvA): Promise<string> => {
    const r = await fn('vx_create_case', U.clerk, OFF, BR1, 'XM/' + id().slice(0, 8));
    expect(r).toMatchObject({ ok: true });
    if (assignTo)
      expect(await fn('vx_assign', U.admin, r.label!, assignTo)).toMatchObject({ ok: true });
    return r.label!;
  };
  const source = (round: string, who = U.thvA, conf = 'PUBLIC', key = 'vx/src', hash = sha('a')) =>
    fn('vx_add_source', who, round, 'Công văn', conf, 'Xác minh điều kiện', key, hash);
  const doneRound = async (cs: string, party: string, who = U.thvA) => {
    const r = await fn('vx_start_round', who, cs, party);
    expect(r).toMatchObject({ ok: true });
    expect(await source(r.label!, who)).toMatchObject({ ok: true });
    expect(await fn('vx_complete_round', who, r.label!, 'Đủ điều kiện (giả lập)')).toMatchObject({
      ok: true,
    });
    return r.label!;
  };
  const caseStatus = async (c: string) =>
    (await row(`SELECT status FROM vx_cases WHERE id = $1`, [c])).status as string;

  it('keeps three independent rounds with their own sources; an incomplete round blocks the conclusion', async () => {
    const cs = await newCase();
    const r1 = await doneRound(cs, 'Bên A');
    const r2 = (await fn('vx_start_round', U.thvA, cs, 'Bên B')).label!;
    const r3 = await doneRound(cs, 'Bên C');
    // Vòng 2 chưa có nguồn/kết quả: không hoàn tất được và không cho kết luận.
    expect(await fn('vx_complete_round', U.thvA, r2, 'xong')).toMatchObject({
      ok: false,
      code: 'SOURCE_REQUIRED',
    });
    expect(await fn('vx_propose_conclusion', U.thvA, cs, 'Đủ điều kiện')).toMatchObject({
      ok: false,
      code: 'ROUNDS_INCOMPLETE',
    });
    await source(r2);
    await source(r2, U.thvA, 'PII', 'vx/src2', sha('b'));
    expect(await fn('vx_complete_round', U.thvA, r2, '   ')).toMatchObject({
      ok: false,
      code: 'RESULT_REQUIRED',
    });
    expect(await fn('vx_complete_round', U.thvA, r2, 'Cần bổ sung (giả lập)')).toMatchObject({
      ok: true,
    });
    const book = (
      await owner.query(
        `SELECT seq, party_name, round_status, sources FROM vx_s04_book WHERE case_id = $1 ORDER BY seq`,
        [cs],
      )
    ).rows;
    expect(book).toEqual([
      { seq: 1, party_name: 'Bên A', round_status: 'COMPLETED', sources: 1 },
      { seq: 2, party_name: 'Bên B', round_status: 'COMPLETED', sources: 2 },
      { seq: 3, party_name: 'Bên C', round_status: 'COMPLETED', sources: 1 },
    ]);
    expect(r1).not.toBe(r3);
    // Vòng đã hoàn tất không sửa được; nguồn chỉ ghi thêm.
    await expect(
      owner.query(`UPDATE vx_rounds SET result = 'sửa' WHERE id = $1`, [r1]),
    ).rejects.toThrow(/completed/);
    await expect(
      owner.query(`UPDATE vx_sources SET purpose = 'x' WHERE round_id = $1`, [r1]),
    ).rejects.toThrow();
    expect(await source(r1)).toMatchObject({ ok: false, code: 'ROUND_NOT_OPEN' });
  });

  it('needs a different legal signer to conclude the whole case (N-06)', async () => {
    const cs = await newCase();
    await doneRound(cs, 'Bên A');
    expect(await fn('vx_decide_conclusion', U.admin, cs, true, null)).toMatchObject({
      ok: false,
      code: 'NO_PROPOSAL',
    });
    expect(await fn('vx_propose_conclusion', U.thvB, cs, 'x')).toMatchObject({
      ok: false,
      code: 'NOT_ASSIGNED_HANDLER',
    });
    expect(await fn('vx_propose_conclusion', U.thvA, cs, 'Đủ điều kiện (giả lập)')).toMatchObject({
      ok: true,
    });
    expect(await caseStatus(cs)).toBe('CONCLUSION_PROPOSED');
    // Không thêm vòng khi đang chờ quyết định.
    expect(await fn('vx_start_round', U.thvA, cs, 'Bên Z')).toMatchObject({
      ok: false,
      code: 'CASE_NOT_OPEN',
    });
    // Người đề xuất không tự duyệt; THV/Thư ký/Trưởng VP không có legal_signer không duyệt.
    expect(await fn('vx_decide_conclusion', U.thvA, cs, true, null)).toMatchObject({
      ok: false,
      code: 'ADMIN_OR_HEAD_ONLY',
    });
    expect(await fn('vx_decide_conclusion', U.secretary, cs, true, null)).toMatchObject({
      ok: false,
      code: 'ADMIN_OR_HEAD_ONLY',
    });
    expect(await fn('vx_decide_conclusion', U.headNoSign, cs, true, null)).toMatchObject({
      ok: false,
      code: 'SIGNING_AUTHORITY_NOT_GRANTED',
    });
    // Từ chối cần lý do và đưa hồ sơ về OPEN.
    expect(await fn('vx_decide_conclusion', U.head, cs, false, '')).toMatchObject({
      ok: false,
      code: 'REASON_REQUIRED',
    });
    expect(await fn('vx_decide_conclusion', U.head, cs, false, 'thiếu nguồn')).toMatchObject({
      ok: true,
      code: 'REJECTED',
    });
    expect(await caseStatus(cs)).toBe('OPEN');
    expect(await fn('vx_propose_conclusion', U.admin, cs, 'Đề xuất lại (giả lập)')).toMatchObject({
      ok: true,
    });
    expect(await fn('vx_decide_conclusion', U.admin, cs, true, null)).toMatchObject({
      ok: false,
      code: 'SEPARATE_REVIEWER_REQUIRED',
    });
    expect(await fn('vx_decide_conclusion', U.head, cs, true, null)).toMatchObject({ ok: true });
    expect(await caseStatus(cs)).toBe('CONCLUDED');
    await expect(
      owner.query(`UPDATE vx_cases SET conclusion_text = 'sửa' WHERE id = $1`, [cs]),
    ).rejects.toThrow(/concluded/);
    expect(await fn('vx_start_round', U.thvA, cs, 'Bên Z')).toMatchObject({
      ok: false,
      code: 'CASE_NOT_OPEN',
    });
  });

  it('restricts rounds and sources to the assigned handler and audits source access', async () => {
    expect(await fn('vx_start_round', U.admin, await newCase(null), 'Bên A')).toMatchObject({
      ok: false,
      code: 'HANDLER_REQUIRED',
    });
    const cs = await newCase();
    expect(await fn('vx_start_round', U.thvB, cs, 'Bên A')).toMatchObject({
      ok: false,
      code: 'NOT_ASSIGNED_HANDLER',
    });
    expect(await fn('vx_start_round', U.secretary, cs, 'Bên A')).toMatchObject({
      ok: false,
      code: 'ROLE_LACKS_PERMISSION',
    });
    expect(await fn('vx_start_round', U.outsider, cs, 'Bên A')).toMatchObject({
      ok: false,
      code: 'ROLE_LACKS_PERMISSION',
    });
    expect(await fn('vx_assign', U.thvA, cs, U.thvB)).toMatchObject({
      ok: false,
      code: 'ADMIN_OR_HEAD_ONLY',
    });
    expect(await fn('vx_assign', U.admin, cs, U.clerk)).toMatchObject({
      ok: false,
      code: 'INVALID_HANDLER',
    });
    const r = (await fn('vx_start_round', U.thvA, cs, 'Bên A')).label!;
    expect(await source(r, U.thvA, 'SECRET')).toMatchObject({ ok: false, code: 'INVALID_SOURCE' });
    expect(await source(r, U.thvA, 'PII', '/abs/path')).toMatchObject({
      ok: false,
      code: 'INVALID_EVIDENCE',
    });
    expect(await source(r, U.thvA, 'PII', 'a/../b')).toMatchObject({
      ok: false,
      code: 'INVALID_EVIDENCE',
    });
    expect(await source(r, U.thvA, 'PII', 'vx/ok', 'xyz')).toMatchObject({
      ok: false,
      code: 'INVALID_EVIDENCE',
    });
    const s = (await source(r, U.thvA, 'PII', 'vx/pii-file')).label!;
    const before = await auditCount('vx.source.access', 'ALLOWED');
    expect(await fn('vx_access_source', U.thvA, s, '')).toMatchObject({
      ok: false,
      code: 'PURPOSE_REQUIRED',
    });
    expect(await fn('vx_access_source', U.thvB, s, 'xem')).toMatchObject({
      ok: false,
      code: 'NOT_ASSIGNED_HANDLER',
    });
    expect(await fn('vx_access_source', U.thvA, s, 'Đối chiếu nhân thân')).toMatchObject({
      ok: true,
      label: 'vx/pii-file',
    });
    expect(await auditCount('vx.source.access', 'ALLOWED')).toBe(before + 1);
    expect(await auditCount('vx.source.access', 'PURPOSE_REQUIRED')).toBeGreaterThanOrEqual(1);
  });

  it('activates a delegation only with consent, app approval, legal signature and handover', async () => {
    const cs = await newCase();
    expect(await fn('vx_delegation_request', U.thvA, cs, U.clerk)).toMatchObject({
      ok: false,
      code: 'INVALID_HANDLER',
    });
    expect(await fn('vx_delegation_request', U.thvB, cs, U.thvC)).toMatchObject({
      ok: false,
      code: 'NOT_ASSIGNED_HANDLER',
    });
    const d = (await fn('vx_delegation_request', U.thvA, cs, U.thvC)).label!;
    const step = (who: string, s: string, key = 'vx/step-' + s, hash = sha('c')) =>
      fn('vx_delegation_step', who, d, s, key, hash);

    expect(await fn('vx_delegation_activate', U.admin, d)).toMatchObject({
      ok: false,
      code: 'CONSENT_MISSING',
    });
    expect(await step(U.thvA, 'CONSENT')).toMatchObject({ ok: true });
    expect(await step(U.thvA, 'CONSENT')).toMatchObject({
      ok: false,
      code: 'STEP_ALREADY_RECORDED',
    });
    expect(await fn('vx_delegation_activate', U.admin, d)).toMatchObject({
      ok: false,
      code: 'APP_APPROVAL_MISSING',
    });
    // Sai persona: THV/Thư ký không duyệt trong ứng dụng; Trưởng VP không legal_signer không ký pháp lý.
    expect(await step(U.thvA, 'APP_APPROVAL')).toMatchObject({
      ok: false,
      code: 'ADMIN_OR_HEAD_ONLY',
    });
    expect(await step(U.secretary, 'APP_APPROVAL')).toMatchObject({
      ok: false,
      code: 'ADMIN_OR_HEAD_ONLY',
    });
    expect(await step(U.admin, 'APP_APPROVAL', 'vx/x', 'bad')).toMatchObject({
      ok: false,
      code: 'INVALID_EVIDENCE',
    });
    expect(await step(U.admin, 'BOGUS')).toMatchObject({ ok: false, code: 'INVALID_STEP' });
    expect(await step(U.headNoSign, 'APP_APPROVAL')).toMatchObject({ ok: true });
    expect(await fn('vx_delegation_activate', U.admin, d)).toMatchObject({
      ok: false,
      code: 'LEGAL_SIGNATURE_MISSING',
    });
    expect(await step(U.headNoSign, 'LEGAL_SIGNATURE')).toMatchObject({
      ok: false,
      code: 'SIGNING_AUTHORITY_NOT_GRANTED',
    });
    expect(await step(U.head, 'LEGAL_SIGNATURE')).toMatchObject({ ok: true });
    expect(await fn('vx_delegation_activate', U.admin, d)).toMatchObject({
      ok: false,
      code: 'HANDOVER_MISSING',
    });
    expect(await step(U.thvA, 'HANDOVER')).toMatchObject({
      ok: false,
      code: 'ROLE_LACKS_PERMISSION',
    });
    expect(await step(U.secretary, 'HANDOVER')).toMatchObject({ ok: true });
    expect(
      (await row(`SELECT handler_user_id FROM vx_cases WHERE id = $1`, [cs])).handler_user_id,
    ).toBe(U.thvA);
    expect(await fn('vx_delegation_activate', U.thvA, d)).toMatchObject({
      ok: false,
      code: 'ADMIN_OR_HEAD_ONLY',
    });
    expect(await fn('vx_delegation_activate', U.admin, d)).toMatchObject({ ok: true });
    // THV mới là người phụ trách; THV cũ mất quyền.
    expect(
      (await row(`SELECT handler_user_id FROM vx_cases WHERE id = $1`, [cs])).handler_user_id,
    ).toBe(U.thvC);
    expect(await fn('vx_start_round', U.thvA, cs, 'Bên A')).toMatchObject({
      ok: false,
      code: 'NOT_ASSIGNED_HANDLER',
    });
    expect(await fn('vx_start_round', U.thvC, cs, 'Bên A')).toMatchObject({ ok: true });
    expect(await fn('vx_delegation_activate', U.admin, d)).toMatchObject({
      ok: false,
      code: 'DELEGATION_NOT_PENDING',
    });
    await expect(
      owner.query(`UPDATE vx_delegation_steps SET actor_user_id = $1`, [U.admin]),
    ).rejects.toThrow();
  });

  it('isolates tenants and records every outcome in audit_log', async () => {
    const cs = await newCase();
    // Tenant khác không thấy hồ sơ/vòng/nguồn: coi như không tồn tại.
    const other = (name: string, ...args: unknown[]) =>
      call(T2, `SELECT * FROM ${name}(${[T2, ...args].map((_, i) => `$${i + 1}`).join(',')})`, [
        T2,
        ...args,
      ]);
    expect(await other('vx_start_round', U.admin, cs, 'Bên A')).toMatchObject({
      ok: false,
      code: 'CASE_NOT_FOUND',
    });
    expect(await other('vx_assign', U.admin, cs, U.thvA)).toMatchObject({
      ok: false,
      code: 'CASE_NOT_FOUND',
    });
    expect(await other('vx_delegation_request', U.admin, cs, U.thvA)).toMatchObject({
      ok: false,
      code: 'CASE_NOT_FOUND',
    });
    const cl = await app.connect();
    try {
      await cl.query('BEGIN');
      await cl.query(`SELECT set_config('app.tenant_id', $1, true)`, [T2]);
      expect((await cl.query(`SELECT count(*)::int AS n FROM vx_cases`)).rows[0].n).toBe(0);
      expect((await cl.query(`SELECT count(*)::int AS n FROM vx_s04_book`)).rows[0].n).toBe(0);
      await cl.query('ROLLBACK');
    } finally {
      cl.release();
    }
    expect(await auditCount('vx.round.start', 'CASE_NOT_FOUND')).toBeGreaterThanOrEqual(1);
    expect(await auditCount('vx.case.create', 'ALLOWED')).toBeGreaterThanOrEqual(1);
    expect(await fn('vx_create_case', U.thvA, OFF, BR1, 'x')).toMatchObject({
      ok: false,
      code: 'ROLE_LACKS_PERMISSION',
    });
    expect(await fn('vx_create_case', U.clerk, OFF, BR2, 'x')).toMatchObject({
      ok: false,
      code: 'BRANCH_NOT_GRANTED',
    });
    expect(await fn('vx_create_case', U.clerk, OFF, BR1, '  ')).toMatchObject({
      ok: false,
      code: 'REFERENCE_REQUIRED',
    });
  });
});
