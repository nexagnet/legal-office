import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Cần PostgreSQL tạm có quyền tạo database. Dữ liệu giả lập; không tệp thật, chỉ siêu dữ liệu (khoá, sha256).
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_ev_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const sha = (c: string) => c.repeat(64);

describe.skipIf(!ADMIN_URL)(
  'legal evidence, return gate, Sở tracking and N-11 on PostgreSQL',
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
      thv: id(), // THV phụ trách các hồ sơ trong test
      thvOther: id(), // THV khác, không được gán
      acc: id(), // KE_TOAN chi nhánh 1
      clerk: id(), // VAN_THU chi nhánh 1
      clerkOther: id(), // VAN_THU chi nhánh 2
      secretary: id(), // THU_KY
      signer: id(), // TRUONG_VP có cấp phép ký pháp lý
      notSigner: id(), // TRUONG_VP không có cấp phép ký
    };
    const CUST = id();

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
      call(T, `SELECT * FROM ${name}(${args.map((_, i) => `$${i + 1}`).join(',')})`, args);
    const addDoc = (
      c: string,
      actor: string,
      kind: string,
      over: { source?: string; key?: string; hash?: string; mime?: string; size?: number } = {},
    ) =>
      fn(
        'vibang_add_document',
        T,
        c,
        actor,
        kind,
        over.source ?? 'UPLOADED',
        over.key ?? `cases/${c}/${kind}`,
        over.hash ?? sha('a'),
        over.mime ?? PDF,
        over.size ?? 1024,
      );
    const row = async (sql: string, params: unknown[]) => (await owner.query(sql, params)).rows[0];
    const statusOf = async (c: string) =>
      (await row(`SELECT status FROM vibang_cases WHERE id = $1`, [c])).status as string;

    /** Hồ sơ ASSIGNED, đã có MISA đầy đủ và đã cấp số. */
    const numbered = async (): Promise<string> => {
      const cid = id();
      await owner.query(
        `INSERT INTO vibang_cases (id, tenant_id, office_id, branch_id, customer_id, title) VALUES ($1,$2,$3,$4,$5,'Hồ sơ giả lập')`,
        [cid, T, OFF, BR1, CUST],
      );
      await owner.query(
        `UPDATE vibang_cases SET status = 'ASSIGNED', responsible_thv_user_id = $2, version = version + 1 WHERE id = $1`,
        [cid, U.thv],
      );
      expect(
        await fn('vibang_record_misa', T, cid, U.acc, 'CONFIRMED_FULL', 'MISA-1'),
      ).toMatchObject({
        ok: true,
      });
      expect(await fn('vibang_allocate_number', T, cid, U.clerk)).toMatchObject({ ok: true });
      return cid;
    };
    const signed = async () => {
      const c = await numbered();
      expect(await fn('vibang_confirm_signed', T, c, U.thv)).toMatchObject({ ok: true });
      return c;
    };
    const stamped = async () => {
      const c = await signed();
      expect(await fn('vibang_confirm_stamped', T, c, U.clerk)).toMatchObject({ ok: true });
      return c;
    };
    const scanned = async () => {
      const c = await stamped();
      expect(await addDoc(c, U.clerk, 'FINAL_SCAN', { hash: sha('c') })).toMatchObject({
        ok: true,
      });
      return c;
    };
    const returned = async () => {
      const c = await scanned();
      expect(await fn('vibang_return_case', T, c, U.clerk)).toMatchObject({ ok: true });
      return c;
    };
    const denials = async (action: string, reason: string) =>
      (
        await row(
          `SELECT count(*)::int AS n FROM audit_log WHERE action = $1 AND outcome = 'deny' AND reason = $2`,
          [action, reason],
        )
      ).n as number;

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
        [BR1, T, OFF, BR2],
      );
      const people: [string, string, string | null, boolean][] = [
        [U.admin, 'ADMIN', null, false],
        [U.thv, 'THV', null, false],
        [U.thvOther, 'THV', null, false],
        [U.acc, 'KE_TOAN', BR1, false],
        [U.clerk, 'VAN_THU', BR1, false],
        [U.clerkOther, 'VAN_THU', BR2, false],
        [U.secretary, 'THU_KY', null, false],
        [U.signer, 'TRUONG_VP', null, true],
        [U.notSigner, 'TRUONG_VP', null, false],
      ];
      for (const [uid, role, branch, legalSigner] of people) {
        await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
          uid,
          T,
          role,
        ]);
        const m = await owner.query(
          `INSERT INTO memberships (tenant_id, user_id, office_id, role, legal_signer) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [T, uid, OFF, role, legalSigner],
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

    it('runs the lawful path: versioned drafts, signature, stamp, final scan, return with the scan locked', async () => {
      const c = await numbered();
      expect((await addDoc(c, U.thv, 'DRAFT_N03', { source: 'GENERATED', mime: DOCX })).label).toBe(
        'DRAFT_N03 v1',
      );
      expect(
        (await addDoc(c, U.secretary, 'DRAFT_N03', { mime: DOCX, hash: sha('b') })).label,
      ).toBe('DRAFT_N03 v2');
      expect((await addDoc(c, U.clerk, 'DRAFT_N04')).label).toBe('DRAFT_N04 v1');
      expect(await statusOf(c)).toBe('ASSIGNED'); // bản nháp không đổi trạng thái

      expect(await fn('vibang_confirm_signed', T, c, U.thv)).toMatchObject({ ok: true });
      expect(await statusOf(c)).toBe('SIGNED');
      expect(await fn('vibang_confirm_stamped', T, c, U.clerk)).toMatchObject({ ok: true });
      expect(await statusOf(c)).toBe('STAMPED');

      await addDoc(c, U.clerk, 'FINAL_SCAN', { hash: sha('1') });
      const second = await addDoc(c, U.thv, 'FINAL_SCAN', { hash: sha('2') });
      expect(second.label).toBe('FINAL_SCAN v2');
      const back = await fn('vibang_return_case', T, c, U.thv);
      expect(back).toMatchObject({ ok: true, label: sha('2') });
      expect(await statusOf(c)).toBe('RETURNED');
      const ev = await row(
        `SELECT final_scan_sha256, locked_at IS NOT NULL AS locked, signed_by, stamped_by FROM vibang_evidence WHERE case_id = $1`,
        [c],
      );
      expect(ev).toEqual({
        final_scan_sha256: sha('2'),
        locked: true,
        signed_by: U.thv,
        stamped_by: U.clerk,
      });
      const allowed = await row(
        `SELECT count(*)::int n FROM audit_log WHERE outcome = 'allow' AND action = 'vibang.return'`,
        [],
      );
      expect(allowed.n).toBeGreaterThanOrEqual(1);
    });

    it('denies the return when signature, stamp, scan or valid MISA proof is missing, with distinct reasons', async () => {
      const early = await numbered();
      expect(await fn('vibang_return_case', T, early, U.clerk)).toMatchObject({
        ok: false,
        code: 'INVALID_CASE_STATUS',
      });
      expect(await fn('vibang_confirm_stamped', T, early, U.clerk)).toMatchObject({
        ok: false,
        code: 'INVALID_CASE_STATUS',
      });
      expect(await addDoc(early, U.clerk, 'FINAL_SCAN')).toMatchObject({
        ok: false,
        code: 'STAMP_NOT_CONFIRMED',
      });

      const noScan = await stamped();
      expect(await fn('vibang_return_case', T, noScan, U.clerk)).toMatchObject({
        ok: false,
        code: 'FINAL_SCAN_MISSING',
      });
      // Bản nháp không thay được bản scan cuối.
      await addDoc(noScan, U.clerk, 'DRAFT_N03');
      expect(await fn('vibang_return_case', T, noScan, U.clerk)).toMatchObject({
        ok: false,
        code: 'FINAL_SCAN_MISSING',
      });

      // MISA bị đề xuất thu hồi: chặn; sau khi Admin chấp nhận: MISA_NOT_CONFIRMED.
      const misa = await scanned();
      await fn('vibang_propose_revoke', T, misa, U.acc, 'nhập nhầm');
      expect(await fn('vibang_return_case', T, misa, U.clerk)).toMatchObject({
        ok: false,
        code: 'REVOKE_PENDING',
      });
      await fn('vibang_decide_revoke', T, misa, U.admin, true);
      expect(await fn('vibang_return_case', T, misa, U.clerk)).toMatchObject({
        ok: false,
        code: 'MISA_NOT_CONFIRMED',
      });
      expect(await statusOf(misa)).toBe('STAMPED');
      expect(await denials('vibang.return', 'MISA_NOT_CONFIRMED')).toBeGreaterThanOrEqual(1);
    });

    it('blocks illegal actors on every evidence step and audits the denials', async () => {
      const unnumbered = id();
      await owner.query(
        `INSERT INTO vibang_cases (id, tenant_id, office_id, branch_id, customer_id, title) VALUES ($1,$2,$3,$4,$5,'x')`,
        [unnumbered, T, OFF, BR1, CUST],
      );
      await owner.query(
        `UPDATE vibang_cases SET status = 'ASSIGNED', responsible_thv_user_id = $2, version = 2 WHERE id = $1`,
        [unnumbered, U.thv],
      );
      expect(await fn('vibang_confirm_signed', T, unnumbered, U.thv)).toMatchObject({
        ok: false,
        code: 'NUMBER_NOT_ALLOCATED',
      });

      const c = await numbered();
      expect(await fn('vibang_confirm_signed', T, c, U.thvOther)).toMatchObject({
        ok: false,
        code: 'NOT_RESPONSIBLE_THV',
      });
      for (const who of [U.clerk, U.admin, U.acc, U.secretary]) {
        expect(await fn('vibang_confirm_signed', T, c, who)).toMatchObject({
          ok: false,
          code: 'ROLE_LACKS_PERMISSION',
        });
      }
      await fn('vibang_confirm_signed', T, c, U.thv);
      expect(await fn('vibang_confirm_stamped', T, c, U.clerkOther)).toMatchObject({
        ok: false,
        code: 'BRANCH_NOT_GRANTED',
      });
      expect(await fn('vibang_confirm_stamped', T, c, U.thv)).toMatchObject({
        ok: false,
        code: 'ROLE_LACKS_PERMISSION',
      });
      await fn('vibang_confirm_stamped', T, c, U.clerk);
      // Bản scan cuối chỉ do Văn thư (đúng chi nhánh) hoặc THV phụ trách tải lên.
      expect(await addDoc(c, U.clerkOther, 'FINAL_SCAN')).toMatchObject({
        ok: false,
        code: 'BRANCH_NOT_GRANTED',
      });
      expect(await addDoc(c, U.thvOther, 'FINAL_SCAN')).toMatchObject({
        ok: false,
        code: 'NOT_RESPONSIBLE_THV',
      });
      expect(await addDoc(c, U.secretary, 'FINAL_SCAN')).toMatchObject({
        ok: false,
        code: 'ROLE_LACKS_PERMISSION',
      });
      await addDoc(c, U.clerk, 'FINAL_SCAN');
      expect(await fn('vibang_return_case', T, c, U.thvOther)).toMatchObject({
        ok: false,
        code: 'NOT_RESPONSIBLE_THV',
      });
      expect(await fn('vibang_return_case', T, c, U.acc)).toMatchObject({
        ok: false,
        code: 'ROLE_LACKS_PERMISSION',
      });
      expect(await statusOf(c)).toBe('STAMPED');
      expect(await denials('vibang.sign.confirm', 'NOT_RESPONSIBLE_THV')).toBeGreaterThanOrEqual(1);
    });

    it('rejects unsafe or unsupported document metadata', async () => {
      const c = await stamped();
      const bad = [
        { mime: 'image/png' },
        { mime: DOCX }, // bản scan cuối chỉ nhận PDF
        { source: 'GENERATED' }, // scan cuối phải là tải lên
        { hash: 'xyz' },
        { key: '../escape' },
        { key: '/abs/path' },
        { key: ' ' },
        { size: 0 },
      ];
      for (const over of bad) {
        expect(await addDoc(c, U.clerk, 'FINAL_SCAN', over)).toMatchObject({
          ok: false,
          code: 'INVALID_DOCUMENT',
        });
      }
      expect(await addDoc(c, U.clerk, 'DRAFT_N05')).toMatchObject({
        ok: false,
        code: 'INVALID_DOCUMENT',
      });
      const n = await row(`SELECT count(*)::int n FROM vibang_documents WHERE case_id = $1`, [c]);
      expect(n.n).toBe(0);
    });

    it('keeps the returned scan locked: documents and evidence are immutable and no new scan is accepted', async () => {
      const c = await returned();
      const hash = (
        await row(`SELECT final_scan_sha256 h FROM vibang_evidence WHERE case_id = $1`, [c])
      ).h;
      await expect(
        owner.query(`UPDATE vibang_evidence SET final_scan_sha256 = $2 WHERE case_id = $1`, [
          c,
          sha('f'),
        ]),
      ).rejects.toThrow(/immutable once recorded/);
      await expect(
        owner.query(
          `UPDATE vibang_evidence SET final_scan_document_id = NULL, final_scan_sha256 = NULL, locked_at = NULL WHERE case_id = $1`,
          [c],
        ),
      ).rejects.toThrow(/immutable once recorded/);
      await expect(
        owner.query(`DELETE FROM vibang_evidence WHERE case_id = $1`, [c]),
      ).rejects.toThrow(/immutable once recorded/);
      await expect(
        owner.query(`UPDATE vibang_documents SET sha256 = $2 WHERE case_id = $1`, [c, sha('f')]),
      ).rejects.toThrow(/append-only/);
      await expect(
        owner.query(`DELETE FROM vibang_documents WHERE case_id = $1`, [c]),
      ).rejects.toThrow(/append-only/);
      expect(await addDoc(c, U.clerk, 'FINAL_SCAN', { hash: sha('9') })).toMatchObject({
        ok: false,
        code: 'CASE_FINAL',
      });
      expect(await addDoc(c, U.clerk, 'DRAFT_N03')).toMatchObject({
        ok: false,
        code: 'CASE_FINAL',
      });
      expect(
        (await row(`SELECT final_scan_sha256 h FROM vibang_evidence WHERE case_id = $1`, [c])).h,
      ).toBe(hash);
    });

    it('tracks the Sở registration independently: a failure after return opens an incident and never reverts RETURNED', async () => {
      const c = await returned();
      const before = await row(
        `SELECT final_scan_sha256 h, version FROM vibang_evidence e JOIN vibang_cases v ON v.id = e.case_id WHERE e.case_id = $1`,
        [c],
      );
      const deadline = '2026-12-01T00:00:00Z';
      expect(
        await fn('vibang_set_registration', T, c, U.clerk, 'SUBMITTED', deadline),
      ).toMatchObject({ ok: true });
      expect(await fn('vibang_set_registration', T, c, U.clerk, 'FAILED', deadline)).toMatchObject({
        ok: false,
        code: 'REASON_REQUIRED',
      });
      expect(
        await fn('vibang_set_registration', T, c, U.clerk, 'FAILED', deadline, 'SO_REJECTED'),
      ).toMatchObject({ ok: true });
      expect(await statusOf(c)).toBe('RETURNED');
      const incidents = await row(
        `SELECT count(*)::int n FROM vibang_registration_incidents WHERE case_id = $1 AND resolved_at IS NULL`,
        [c],
      );
      expect(incidents.n).toBe(1);
      expect(
        await fn('vibang_set_registration', T, c, U.clerkOther, 'SUBMITTED', deadline),
      ).toMatchObject({
        ok: false,
        code: 'BRANCH_NOT_GRANTED',
      });
      expect(await fn('vibang_set_registration', T, c, U.acc, 'SUBMITTED', deadline)).toMatchObject(
        {
          ok: false,
          code: 'ROLE_LACKS_PERMISSION',
        },
      );
      expect(
        await fn('vibang_set_registration', T, c, U.secretary, 'CONFIRMED', '2026-12-02T00:00:00Z'),
      ).toMatchObject({ ok: true });
      expect(
        (
          await row(
            `SELECT count(*)::int n FROM vibang_registration_incidents WHERE case_id = $1 AND resolved_at IS NULL`,
            [c],
          )
        ).n,
      ).toBe(0);
      expect(await fn('vibang_set_registration', T, c, U.admin, 'PENDING', deadline)).toMatchObject(
        {
          ok: false,
          code: 'REGISTRATION_FINAL',
        },
      );
      const after = await row(
        `SELECT final_scan_sha256 h, version FROM vibang_evidence e JOIN vibang_cases v ON v.id = e.case_id WHERE e.case_id = $1`,
        [c],
      );
      expect(after).toEqual(before);
      expect(await statusOf(c)).toBe('RETURNED');
    });

    it('returns without any Sở registration (pending registration is not a gate)', async () => {
      const c = await scanned();
      expect(
        (await row(`SELECT count(*)::int n FROM vibang_registrations WHERE case_id = $1`, [c])).n,
      ).toBe(0);
      expect(await fn('vibang_return_case', T, c, U.clerk)).toMatchObject({ ok: true });
    });

    it('logs manual customer contact separately from RETURNED', async () => {
      const c = await stamped();
      expect(
        await fn('vibang_log_contact', T, c, U.secretary, 'REMINDER', 'REMINDED'),
      ).toMatchObject({ ok: true });
      expect(await fn('vibang_log_contact', T, c, U.thv, 'RESULT', 'REACHED')).toMatchObject({
        ok: true,
      });
      expect(await fn('vibang_log_contact', T, c, U.thvOther, 'RESULT', 'REACHED')).toMatchObject({
        ok: false,
        code: 'NOT_RESPONSIBLE_THV',
      });
      expect(await fn('vibang_log_contact', T, c, U.secretary, 'SMS', 'REACHED')).toMatchObject({
        ok: false,
        code: 'INVALID_CONTACT',
      });
      expect(await statusOf(c)).toBe('STAMPED'); // liên hệ khách không trả hồ sơ
      await expect(
        owner.query(`UPDATE vibang_contact_log SET outcome = 'NO_ANSWER' WHERE case_id = $1`, [c]),
      ).rejects.toThrow(/append-only/);
      expect(
        (await row(`SELECT count(*)::int n FROM vibang_contact_log WHERE case_id = $1`, [c])).n,
      ).toBe(2);
    });

    describe('N-11 formal correction', () => {
      it('is only available once the content is signed, and never edits the originals', async () => {
        const c = await numbered();
        expect(await fn('vibang_propose_n11', T, c, U.thv, 'sai tên')).toMatchObject({
          ok: false,
          code: 'NOT_SIGNED_FINAL',
        });
        const r = await returned();
        const scan = await row(
          `SELECT final_scan_sha256 h, final_scan_document_id d FROM vibang_evidence WHERE case_id = $1`,
          [r],
        );
        expect(await fn('vibang_propose_n11', T, r, U.thvOther, 'sai tên')).toMatchObject({
          ok: false,
          code: 'NOT_RESPONSIBLE_THV',
        });
        expect(await fn('vibang_propose_n11', T, r, U.clerk, 'sai tên')).toMatchObject({
          ok: false,
          code: 'ROLE_LACKS_PERMISSION',
        });
        expect(await fn('vibang_propose_n11', T, r, U.thv, ' ')).toMatchObject({
          ok: false,
          code: 'REASON_REQUIRED',
        });
        expect(await fn('vibang_propose_n11', T, r, U.thv, 'sai tên')).toMatchObject({ ok: true });
        const k = await row(
          `SELECT id, before_document_id, status FROM vibang_n11_corrections WHERE case_id = $1`,
          [r],
        );
        expect(k.status).toBe('PROPOSED');
        expect(k.before_document_id).toBe(scan.d);

        // Chưa có văn bản N-11 hoặc không có cấp phép ký: không áp dụng được.
        expect(await fn('vibang_apply_n11', T, k.id, U.signer, id())).toMatchObject({
          ok: false,
          code: 'CORRECTION_DOCUMENT_REQUIRED',
        });
        const doc = await addDoc(r, U.clerk, 'N11_CORRECTION', { hash: sha('7') }); // cho phép cả khi hồ sơ đã trả
        expect(doc).toMatchObject({ ok: true, label: 'N11_CORRECTION v1' });
        const docId = (
          await row(
            `SELECT id FROM vibang_documents WHERE case_id = $1 AND kind = 'N11_CORRECTION'`,
            [r],
          )
        ).id;
        for (const who of [U.notSigner, U.thv, U.admin]) {
          expect(await fn('vibang_apply_n11', T, k.id, who, docId)).toMatchObject({
            ok: false,
            code: 'SIGNING_AUTHORITY_NOT_GRANTED',
          });
        }
        expect(await fn('vibang_apply_n11', T, k.id, U.signer, docId)).toMatchObject({ ok: true });
        expect(await fn('vibang_apply_n11', T, k.id, U.signer, docId)).toMatchObject({
          ok: false,
          code: 'ALREADY_APPLIED',
        });
        await expect(
          owner.query(`UPDATE vibang_n11_corrections SET reason = 'khác' WHERE id = $1`, [k.id]),
        ).rejects.toThrow(/immutable/);
        await expect(
          owner.query(`DELETE FROM vibang_n11_corrections WHERE id = $1`, [k.id]),
        ).rejects.toThrow(/immutable/);

        // Bản gốc đã ký/đóng dấu không đổi; hồ sơ vẫn RETURNED; Change Request 48h là bảng khác.
        expect(await statusOf(r)).toBe('RETURNED');
        const after = await row(
          `SELECT final_scan_sha256 h, final_scan_document_id d FROM vibang_evidence WHERE case_id = $1`,
          [r],
        );
        expect(after).toEqual(scan);
        expect(
          (
            await row(
              `SELECT count(*)::int n FROM vibang_case_change_requests WHERE case_id = $1`,
              [r],
            )
          ).n,
        ).toBe(0);
      });
    });

    it('isolates tenants for every evidence function', async () => {
      const c = await scanned();
      await expect(
        call(T2, `SELECT * FROM vibang_return_case($1,$2,$3)`, [T, c, U.clerk]),
      ).rejects.toThrow(/row-level security/);
      const cl = await app.connect();
      try {
        await cl.query('BEGIN');
        await cl.query(`SELECT set_config('app.tenant_id', $1, true)`, [T2]);
        for (const t of [
          'vibang_documents',
          'vibang_evidence',
          'vibang_registrations',
          'vibang_n11_corrections',
        ]) {
          const r = await cl.query(`SELECT count(*)::int n FROM ${t}`);
          expect(r.rows[0].n).toBe(0);
        }
        await cl.query('COMMIT');
      } finally {
        cl.release();
      }
      expect(await statusOf(c)).toBe('STAMPED');
    });
  },
);
