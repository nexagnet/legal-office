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
const DB = `lo_td_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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

describe.skipIf(!ADMIN_URL)('service of documents (Tống đạt) on PostgreSQL', () => {
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
    admin: id(),
    head: id(), // TRUONG_VP
    secretary: id(), // THU_KY
    clerk: id(), // VAN_THU chi nhánh 1
    clerkOther: id(), // VAN_THU chi nhánh 2
    acc: id(), // KE_TOAN
    thvA: id(),
    thvB: id(),
    outsider: id(), // không có membership
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

  const newRequest = async (): Promise<string> => {
    const r = await fn('td_create_request', U.clerk, OFF, BR1, 'N-01/' + id().slice(0, 8));
    expect(r).toMatchObject({ ok: true });
    return r.label!;
  };
  const addDoc = async (req: string, who = U.clerk, deadline = '2026-12-01T00:00:00Z') => {
    const r = await fn(
      'td_add_document',
      who,
      req,
      'Người nhận giả lập',
      'Địa chỉ giả lập',
      deadline,
    );
    expect(r).toMatchObject({ ok: true });
    return r.label!;
  };
  const assigned = async (req: string, handler = U.thvA) => {
    const d = await addDoc(req);
    expect(await fn('td_assign', U.admin, d, handler)).toMatchObject({ ok: true });
    return d;
  };
  const attempt = (
    doc: string,
    who: string,
    outcome: string,
    over: { key?: string | null; hash?: string | null; ref?: string | null; at?: string } = {},
  ) =>
    fn(
      'td_record_attempt',
      who,
      doc,
      outcome,
      over.key === undefined ? null : over.key,
      over.hash === undefined ? null : over.hash,
      over.ref === undefined ? null : over.ref,
      over.at ?? '2026-11-01T03:00:00Z',
    );
  const docStatus = async (d: string) =>
    (await row(`SELECT status FROM td_documents WHERE id = $1`, [d])).status as string;
  const reqStatus = async (r: string) =>
    (await row(`SELECT status FROM td_requests WHERE id = $1`, [r])).status as string;

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
    const people: [string, string, string | null][] = [
      [U.admin, 'ADMIN', null],
      [U.head, 'TRUONG_VP', null],
      [U.secretary, 'THU_KY', null],
      [U.clerk, 'VAN_THU', BR1],
      [U.clerkOther, 'VAN_THU', BR2],
      [U.acc, 'KE_TOAN', BR1],
      [U.thvA, 'THV', null],
      [U.thvB, 'THV', null],
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

  it('handles one request with several documents, recipients and different outcomes without false parent completion', async () => {
    const req = await newRequest();
    const served = await assigned(req, U.thvA);
    const refused = await assigned(req, U.thvB);
    const open = await assigned(req, U.thvA);
    const pending = await addDoc(req); // chưa giao người xử lý

    expect(
      await attempt(served, U.thvA, 'SERVED', { key: 'td/served', hash: sha('1') }),
    ).toMatchObject({ ok: true });
    expect(await docStatus(served)).toBe('DELIVERED');
    // Một văn bản thành công không đóng yêu cầu cha.
    expect(await reqStatus(req)).toBe('OPEN');
    expect(await fn('td_close_request', U.admin, req)).toMatchObject({
      ok: false,
      code: 'DOCUMENTS_NOT_FINAL',
    });

    await attempt(refused, U.thvB, 'REFUSED');
    expect(await fn('td_mark_undeliverable', U.thvB, refused, 'RECIPIENT_REFUSED')).toMatchObject({
      ok: true,
    });
    expect(await docStatus(refused)).toBe('UNDELIVERABLE');
    expect(await fn('td_close_request', U.admin, req)).toMatchObject({
      ok: false,
      code: 'DOCUMENTS_NOT_FINAL',
    });

    // Văn bản còn mở (đã giao) và văn bản chưa giao vẫn chặn đóng.
    await attempt(open, U.thvA, 'SERVED', { key: 'td/open', hash: sha('2') });
    expect(await fn('td_close_request', U.admin, req)).toMatchObject({
      ok: false,
      code: 'DOCUMENTS_NOT_FINAL',
    });
    expect(await docStatus(pending)).toBe('PENDING');
    expect(await fn('td_assign', U.head, pending, U.thvB)).toMatchObject({ ok: true });
    await attempt(pending, U.thvB, 'NO_RECIPIENT');
    await fn('td_mark_undeliverable', U.thvB, pending, 'NO_RECIPIENT');

    expect(await fn('td_close_request', U.head, req)).toMatchObject({ ok: true });
    expect(await reqStatus(req)).toBe('CLOSED');
    const book = await owner.query(
      `SELECT status, attempts FROM td_s01_book WHERE request_id = $1 ORDER BY status, attempts`,
      [req],
    );
    expect(book.rows.map((r) => r.status).sort()).toEqual([
      'DELIVERED',
      'DELIVERED',
      'UNDELIVERABLE',
      'UNDELIVERABLE',
    ]);
  });

  it('records repeated attempts and legally supported failures, keeping the document open for retry', async () => {
    const req = await newRequest();
    const d = await assigned(req);
    expect(await attempt(d, U.thvA, 'ABSENT')).toMatchObject({ ok: true, label: 'attempt 1' });
    expect(await attempt(d, U.thvA, 'WRONG_ADDRESS')).toMatchObject({
      ok: true,
      label: 'attempt 2',
    });
    expect(await docStatus(d)).toBe('ASSIGNED');
    expect(await attempt(d, U.thvA, 'SERVED', { key: 'td/ok', hash: sha('3') })).toMatchObject({
      label: 'attempt 3',
    });
    const rows = await owner.query(
      `SELECT seq, outcome FROM td_attempts WHERE document_id = $1 ORDER BY seq`,
      [d],
    );
    expect(rows.rows).toEqual([
      { seq: 1, outcome: 'ABSENT' },
      { seq: 2, outcome: 'WRONG_ADDRESS' },
      { seq: 3, outcome: 'SERVED' },
    ]);
    expect(await attempt(d, U.thvA, 'ABSENT')).toMatchObject({ ok: false, code: 'DOCUMENT_FINAL' });
    await expect(
      owner.query(`UPDATE td_attempts SET outcome = 'ABSENT' WHERE document_id = $1`, [d]),
    ).rejects.toThrow(/append-only/);
    await expect(
      owner.query(`UPDATE td_documents SET status = 'PENDING' WHERE id = $1`, [d]),
    ).rejects.toThrow(/final/);
  });

  it('never invents success: SERVED needs evidence, posting needs a stated statutory basis and is not delivery', async () => {
    const req = await newRequest();
    const d = await assigned(req);
    expect(await attempt(d, U.thvA, 'SERVED')).toMatchObject({
      ok: false,
      code: 'EVIDENCE_REQUIRED',
    });
    expect(await attempt(d, U.thvA, 'SERVED', { key: 'td/x', hash: 'zzz' })).toMatchObject({
      ok: false,
      code: 'INVALID_EVIDENCE',
    });
    expect(await attempt(d, U.thvA, 'SERVED', { key: '../x', hash: sha('4') })).toMatchObject({
      ok: false,
      code: 'INVALID_EVIDENCE',
    });
    expect(await attempt(d, U.thvA, 'SERVED', { key: 'td/x' })).toMatchObject({
      ok: false,
      code: 'INVALID_EVIDENCE',
    });
    expect(await attempt(d, U.thvA, 'MAGIC')).toMatchObject({ ok: false, code: 'INVALID_OUTCOME' });
    expect(await attempt(d, U.thvA, 'POSTED_NOTICE')).toMatchObject({
      ok: false,
      code: 'STATUTORY_PROOF_REQUIRED',
    });
    expect(await attempt(d, U.thvA, 'POSTED_NOTICE', { ref: ' ' })).toMatchObject({
      ok: false,
      code: 'STATUTORY_PROOF_REQUIRED',
    });
    expect(
      await attempt(d, U.thvA, 'POSTED_NOTICE', {
        ref: 'căn cứ giả lập #1',
        key: 'td/post',
        hash: sha('5'),
      }),
    ).toMatchObject({ ok: true });
    expect(await docStatus(d)).toBe('ASSIGNED'); // niêm yết không tự thành công
    // Không kết luận "không tống đạt được" khi chưa thử lần nào.
    const fresh = await assigned(req);
    expect(await fn('td_mark_undeliverable', U.thvA, fresh, 'NO_RECIPIENT')).toMatchObject({
      ok: false,
      code: 'NO_ATTEMPTS',
    });
    expect(await fn('td_mark_undeliverable', U.thvA, d, 'WHO_KNOWS')).toMatchObject({
      ok: false,
      code: 'INVALID_REASON',
    });
  });

  it('flags late attempts against the deadline without blocking them', async () => {
    const req = await newRequest();
    const d = await addDoc(req, U.clerk, '2026-11-01T00:00:00Z');
    await fn('td_assign', U.admin, d, U.thvA);
    await attempt(d, U.thvA, 'ABSENT', { at: '2026-10-31T23:59:59Z' });
    await attempt(d, U.thvA, 'ABSENT', { at: '2026-11-01T00:00:01Z' });
    const rows = await owner.query(
      `SELECT seq, late FROM td_attempts WHERE document_id = $1 ORDER BY seq`,
      [d],
    );
    expect(rows.rows).toEqual([
      { seq: 1, late: false },
      { seq: 2, late: true },
    ]);
  });

  it('denies illegal actors, wrong branch and unassigned handlers, and audits every denial', async () => {
    expect(await fn('td_create_request', U.clerkOther, OFF, BR1, 'x')).toMatchObject({
      ok: false,
      code: 'BRANCH_NOT_GRANTED',
    });
    expect(await fn('td_create_request', U.acc, OFF, BR1, 'x')).toMatchObject({
      ok: false,
      code: 'ROLE_LACKS_PERMISSION',
    });
    expect(await fn('td_create_request', U.thvA, OFF, BR1, 'x')).toMatchObject({
      ok: false,
      code: 'ROLE_LACKS_PERMISSION',
    });
    expect(await fn('td_create_request', U.outsider, OFF, BR1, 'x')).toMatchObject({
      ok: false,
      code: 'ROLE_LACKS_PERMISSION',
    });
    expect(await fn('td_create_request', U.clerk, OFF, id(), 'x')).toMatchObject({
      ok: false,
      code: 'BRANCH_NOT_FOUND',
    });
    expect(await fn('td_create_request', U.clerk, OFF, BR1, '  ')).toMatchObject({
      ok: false,
      code: 'REFERENCE_REQUIRED',
    });

    const req = await newRequest();
    expect(
      await fn('td_add_document', U.clerkOther, req, 'a', 'b', '2026-12-01T00:00:00Z'),
    ).toMatchObject({ ok: false, code: 'BRANCH_NOT_GRANTED' });
    expect(
      await fn('td_add_document', U.clerk, req, ' ', 'b', '2026-12-01T00:00:00Z'),
    ).toMatchObject({ ok: false, code: 'INVALID_DOCUMENT' });

    const d = await addDoc(req);
    // Chỉ Admin hoặc Trưởng VP giao việc.
    for (const who of [U.secretary, U.clerk, U.thvA, U.acc]) {
      expect(await fn('td_assign', who, d, U.thvA)).toMatchObject({
        ok: false,
        code: 'ADMIN_OR_HEAD_ONLY',
      });
    }
    expect(await fn('td_assign', U.admin, d, U.clerk)).toMatchObject({
      ok: false,
      code: 'INVALID_HANDLER',
    });
    // Chưa giao thì chưa ghi nhận được.
    expect(await attempt(d, U.admin, 'ABSENT')).toMatchObject({
      ok: false,
      code: 'HANDLER_REQUIRED',
    });
    await fn('td_assign', U.admin, d, U.thvA);
    expect(await attempt(d, U.thvB, 'ABSENT')).toMatchObject({
      ok: false,
      code: 'NOT_ASSIGNED_HANDLER',
    });
    expect(await attempt(d, U.clerk, 'ABSENT')).toMatchObject({
      ok: false,
      code: 'ROLE_LACKS_PERMISSION',
    });
    expect(await fn('td_remind', U.thvB, d)).toMatchObject({
      ok: false,
      code: 'NOT_ASSIGNED_HANDLER',
    });
    expect(await fn('td_remind', U.clerk, d)).toMatchObject({
      ok: false,
      code: 'ROLE_LACKS_PERMISSION',
    });
    expect(await fn('td_remind', U.secretary, d)).toMatchObject({ ok: true });
    expect(await fn('td_close_request', U.secretary, req)).toMatchObject({
      ok: false,
      code: 'ADMIN_OR_HEAD_ONLY',
    });
    const denies = await row(
      `SELECT count(*)::int n FROM audit_log WHERE action LIKE 'td.%' AND outcome = 'deny'`,
      [],
    );
    expect(denies.n).toBeGreaterThanOrEqual(14);
    // Lịch sử việc có nhắc.
    const ev = await owner.query(`SELECT event FROM td_events WHERE document_id = $1 ORDER BY id`, [
      d,
    ]);
    expect(ev.rows.map((r) => r.event)).toEqual(['DOCUMENT_ADDED', 'ASSIGNED', 'REMINDER']);
  });

  it('ghi việc báo kết quả cho cơ quan: chỉ khi mọi văn bản có kết cục cuối, sau khi đóng vẫn ghi được', async () => {
    const req = await newRequest();
    const d = await assigned(req);
    const report = (who: string, agency: string, note: string) =>
      fn('td_report_result', who, req, agency, note);
    const deadline = () =>
      row(`SELECT status FROM office_statutory_deadlines WHERE ref_id = $1`, [d]);
    expect(await report(U.admin, 'Tòa án giả lập', 'Gửi bưu điện')).toMatchObject({
      ok: false,
      code: 'DOCUMENTS_NOT_FINAL',
    });
    await attempt(d, U.thvA, 'SERVED', { key: 'td/r', hash: sha('7') });
    expect(await report(U.admin, ' ', 'x')).toMatchObject({ ok: false, code: 'AGENCY_REQUIRED' });
    expect(await report(U.admin, 'Tòa án giả lập', ' ')).toMatchObject({
      ok: false,
      code: 'NOTE_REQUIRED',
    });
    expect(await report(U.outsider, 'Tòa án giả lập', 'x')).toMatchObject({
      ok: false,
      code: 'ROLE_LACKS_PERMISSION',
    });
    expect(await report(U.thvB, 'Tòa án giả lập', 'x')).toMatchObject({
      ok: false,
      code: 'NOT_ASSIGNED_HANDLER',
    });
    expect(await deadline()).toMatchObject({ status: 'OPEN' });
    expect(await report(U.thvA, 'Tòa án giả lập', 'Gửi bưu điện')).toMatchObject({ ok: true });
    expect(await deadline()).toMatchObject({ status: 'DONE' });
    expect(await fn('td_close_request', U.admin, req)).toMatchObject({ ok: true });
    expect(await report(U.head, 'Tòa án giả lập', 'Gửi lại bản sao')).toMatchObject({ ok: true });
    const n = await row(`SELECT count(*)::int n FROM td_result_notices WHERE request_id = $1`, [
      req,
    ]);
    expect(n.n).toBe(2);
    await expect(
      owner.query(`DELETE FROM td_result_notices WHERE request_id = $1`, [req]),
    ).rejects.toThrow();
  });

  it('freezes a closed request and never deletes', async () => {
    const req = await newRequest();
    const d = await assigned(req);
    await attempt(d, U.thvA, 'SERVED', { key: 'td/c', hash: sha('6') });
    expect(await fn('td_close_request', U.admin, req)).toMatchObject({ ok: true });
    expect(await fn('td_close_request', U.admin, req)).toMatchObject({
      ok: false,
      code: 'REQUEST_CLOSED',
    });
    expect(
      await fn('td_add_document', U.clerk, req, 'a', 'b', '2026-12-01T00:00:00Z'),
    ).toMatchObject({ ok: false, code: 'REQUEST_CLOSED' });
    expect(await attempt(d, U.thvA, 'ABSENT')).toMatchObject({ ok: false, code: 'DOCUMENT_FINAL' });
    await expect(
      owner.query(`UPDATE td_requests SET request_ref = 'x' WHERE id = $1`, [req]),
    ).rejects.toThrow(/closed or immutable/);
    await expect(owner.query(`DELETE FROM td_requests WHERE id = $1`, [req])).rejects.toThrow(
      /closed or immutable/,
    );
    await expect(owner.query(`DELETE FROM td_documents WHERE id = $1`, [d])).rejects.toThrow(
      /never deleted|final/,
    );
    await expect(owner.query(`DELETE FROM td_events WHERE request_id = $1`, [req])).rejects.toThrow(
      /append-only/,
    );
  });

  it('isolates tenants', async () => {
    const req = await newRequest();
    const d = await assigned(req);
    // Ngữ cảnh tenant B không thấy dữ liệu của A.
    const other = await call(T2, `SELECT * FROM td_remind($1,$2,$3)`, [T2, U.admin, d]);
    expect(other).toMatchObject({ ok: false, code: 'DOCUMENT_NOT_FOUND' });
    const cl = await app.connect();
    try {
      await cl.query('BEGIN');
      await cl.query(`SELECT set_config('app.tenant_id', $1, true)`, [T2]);
      for (const t of ['td_requests', 'td_documents', 'td_attempts', 'td_events', 'td_s01_book']) {
        expect((await cl.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n).toBe(0);
      }
      await cl.query('COMMIT');
    } finally {
      cl.release();
    }
  });
});
