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
const DB = `lo_of_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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

describe.skipIf(!ADMIN_URL)(
  'office management (correspondence, decisions, TT06, FIFO, S-06) on PostgreSQL',
  () => {
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
      clerkOther: id(), // VAN_THU chi nhánh 2
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
      await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [
        OFF,
        T,
      ]);
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
        [U.clerkOther, 'VAN_THU', BR2, false],
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
      await owner.query(
        `INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,'outsider')`,
        [U.outsider, T],
      );
    });

    afterAll(async () => {
      await app?.end();
      await owner?.end();
      await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
      await admin.end();
    });

    const rowsOf = async (tenant: string, sql: string, params: unknown[]) => {
      const cl = await app.connect();
      try {
        await cl.query('BEGIN');
        await cl.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
        const r = await cl.query(sql, params);
        await cl.query('COMMIT');
        return r.rows as Record<string, unknown>[];
      } catch (e) {
        await cl.query('ROLLBACK');
        throw e;
      } finally {
        cl.release();
      }
    };
    const search = (who: string, fnName: string, ...args: unknown[]) =>
      rowsOf(
        T,
        `SELECT * FROM ${fnName}(${[T, who, ...args].map((_, i) => `$${i + 1}`).join(',')})`,
        [T, who, ...args],
      );

    const inbound = (
      who = U.clerk,
      over: {
        handler?: string | null;
        kind?: string | null;
        caseId?: string | null;
        branch?: string;
      } = {},
    ) =>
      fn(
        'of_corr_create',
        who,
        OFF,
        over.branch ?? BR1,
        'INBOUND',
        'Công văn',
        'Cơ quan giả lập',
        'Trích yếu giả lập ' + id().slice(0, 6),
        'SH-1',
        '2026-10-01',
        '2026-10-02',
        null,
        over.handler ?? null,
        over.kind ?? null,
        over.caseId ?? null,
      );
    const outbound = (who = U.clerk) =>
      fn(
        'of_corr_create',
        who,
        OFF,
        BR1,
        'OUTBOUND',
        'Công văn',
        'Nơi nhận giả lập',
        'Dự thảo giả lập ' + id().slice(0, 6),
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      );

    it('registers inbound correspondence, links cases in the same office and records the result once', async () => {
      const tha = (await fn('th_create_case', U.clerk, OFF, BR1, 'THA/of', 'HĐ', 'QĐ')).label!;
      const linked = await inbound(U.clerk, { handler: U.thvA, kind: 'ENFORCEMENT', caseId: tha });
      expect(linked).toMatchObject({ ok: true });
      expect(await inbound(U.clerk, { kind: 'ENFORCEMENT', caseId: id() })).toMatchObject({
        ok: false,
        code: 'CASE_LINK_NOT_FOUND',
      });
      expect(await inbound(U.clerk, { kind: 'BOGUS', caseId: tha })).toMatchObject({
        ok: false,
        code: 'CASE_LINK_NOT_FOUND',
      });
      expect(await inbound(U.clerk, { handler: U.outsider })).toMatchObject({
        ok: false,
        code: 'INVALID_HANDLER',
      });
      expect(await inbound(U.thvA)).toMatchObject({ ok: false, code: 'ROLE_LACKS_PERMISSION' });
      expect(await inbound(U.clerkOther)).toMatchObject({ ok: false, code: 'BRANCH_NOT_GRANTED' });
      const c = linked.label!;
      expect(
        await fn('of_corr_attach', U.clerk, c, 'ATTACHMENT', 'of/att', sha('a')),
      ).toMatchObject({ ok: true });
      expect(await fn('of_corr_attach', U.clerk, c, 'ATTACHMENT', '/abs', sha('a'))).toMatchObject({
        ok: false,
        code: 'INVALID_EVIDENCE',
      });
      expect(await fn('of_corr_handle', U.thvB, c, 'Đã xử lý', 'Kho A')).toMatchObject({
        ok: false,
        code: 'NOT_ASSIGNED_HANDLER',
      });
      expect(await fn('of_corr_handle', U.thvA, c, ' ', null)).toMatchObject({
        ok: false,
        code: 'RESULT_REQUIRED',
      });
      expect(await fn('of_corr_handle', U.thvA, c, 'Đã xử lý', 'Kho A')).toMatchObject({
        ok: true,
      });
      expect(await fn('of_corr_handle', U.thvA, c, 'Lại', null)).toMatchObject({
        ok: false,
        code: 'CORRESPONDENCE_FINAL',
      });
      expect(
        await fn('of_corr_attach', U.clerk, c, 'ATTACHMENT', 'of/att2', sha('a')),
      ).toMatchObject({ ok: false, code: 'CORRESPONDENCE_FINAL' });
      await expect(
        owner.query(`UPDATE of_correspondence SET result_note = 'sửa' WHERE id = $1`, [c]),
      ).rejects.toThrow(/final/);
      await expect(owner.query(`DELETE FROM of_correspondence`)).rejects.toThrow();
      await expect(owner.query(`UPDATE of_corr_events SET event = 'CREATED'`)).rejects.toThrow();
      expect(
        (
          await owner.query(
            `SELECT event FROM of_corr_events WHERE correspondence_id = $1 ORDER BY id`,
            [c],
          )
        ).rows.map((r) => r.event),
      ).toEqual(['CREATED', 'ATTACHED', 'HANDLED']);
    });

    it('separates drafting, internal approval and signed issuance of outbound letters', async () => {
      const o = (await outbound()).label!;
      expect(await fn('of_corr_submit', U.clerk, o)).toMatchObject({
        ok: false,
        code: 'FINAL_DOCUMENT_REQUIRED',
      });
      await fn('of_corr_attach', U.clerk, o, 'FINAL_DOCUMENT', 'of/final', sha('b'));
      expect(await fn('of_corr_approve', U.admin, o)).toMatchObject({
        ok: false,
        code: 'INVALID_STATUS',
      });
      expect(await fn('of_corr_submit', U.clerk, o)).toMatchObject({ ok: true });
      expect(await fn('of_corr_approve', U.secretary, o)).toMatchObject({
        ok: false,
        code: 'ADMIN_OR_HEAD_ONLY',
      });
      expect(
        await fn(
          'of_corr_issue',
          U.admin,
          o,
          'CV-1',
          '2026-10-05',
          'Bưu điện',
          'of/proof',
          sha('c'),
        ),
      ).toMatchObject({ ok: false, code: 'INVALID_STATUS' });
      expect(await fn('of_corr_approve', U.headNoSign, o)).toMatchObject({ ok: true });
      // Phê duyệt nội bộ không phải ký ban hành.
      expect(
        await fn(
          'of_corr_issue',
          U.headNoSign,
          o,
          'CV-1',
          '2026-10-05',
          'Bưu điện',
          'of/proof',
          sha('c'),
        ),
      ).toMatchObject({ ok: false, code: 'SIGNING_AUTHORITY_NOT_GRANTED' });
      expect(
        await fn('of_corr_issue', U.head, o, ' ', '2026-10-05', 'Bưu điện', 'of/proof', sha('c')),
      ).toMatchObject({ ok: false, code: 'INVALID_CORRESPONDENCE' });
      expect(
        await fn('of_corr_issue', U.head, o, 'CV-1', '2026-10-05', 'Bưu điện', null, null),
      ).toMatchObject({ ok: false, code: 'SEND_PROOF_REQUIRED' });
      expect(
        await fn(
          'of_corr_issue',
          U.head,
          o,
          'CV-1',
          '2026-10-05',
          'Bưu điện',
          'of/proof',
          sha('c'),
        ),
      ).toMatchObject({ ok: true });
      const r = await row(
        `SELECT status, ref_no, signer_user_id FROM of_correspondence WHERE id = $1`,
        [o],
      );
      expect(r).toEqual({ status: 'ISSUED', ref_no: 'CV-1', signer_user_id: U.head });
      expect(
        await fn('of_corr_issue', U.head, o, 'CV-2', '2026-10-06', 'x', 'of/p2', sha('c')),
      ).toMatchObject({ ok: false, code: 'INVALID_STATUS' });
      await expect(
        owner.query(`UPDATE of_correspondence SET ref_no = 'X' WHERE id = $1`, [o]),
      ).rejects.toThrow(/final/);
    });

    it('searches correspondence and decisions only within the caller grants and audits each search', async () => {
      const tha = (await fn('th_create_case', U.clerk, OFF, BR1, 'THA/s', 'HĐ', 'QĐ')).label!;
      const mine = (await inbound(U.clerk, { handler: U.thvA, kind: 'ENFORCEMENT', caseId: tha }))
        .label!;
      const b2 = (
        await fn(
          'of_corr_create',
          U.admin,
          OFF,
          BR2,
          'INBOUND',
          'Công văn',
          'CQ',
          'Chi nhánh hai',
          'SH-2',
          null,
          '2026-10-02',
          null,
          null,
          null,
          null,
        )
      ).label!;
      const ids = (rows: Record<string, unknown>[]) => rows.map((r) => r.id);
      const before = (
        await row(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'of.corr.search'`, [])
      ).n;
      expect(ids(await search(U.admin, 'of_search_correspondence', OFF, null, null, null))).toEqual(
        expect.arrayContaining([mine, b2]),
      );
      const clerkRows = ids(
        await search(U.clerk, 'of_search_correspondence', OFF, null, null, null),
      );
      expect(clerkRows).toContain(mine);
      expect(clerkRows).not.toContain(b2); // chi nhánh 2 chưa được cấp
      const thvRows = ids(await search(U.thvA, 'of_search_correspondence', OFF, null, null, null));
      expect(thvRows).toContain(mine);
      expect(thvRows).not.toContain(b2);
      expect(await search(U.thvB, 'of_search_correspondence', OFF, null, null, null)).toEqual([]);
      expect(await search(U.outsider, 'of_search_correspondence', OFF, null, null, null)).toEqual(
        [],
      );
      expect(ids(await search(U.admin, 'of_search_correspondence', OFF, null, null, tha))).toEqual([
        mine,
      ]);
      expect(
        ids(
          await search(U.admin, 'of_search_correspondence', OFF, 'Chi nhánh hai', 'INBOUND', null),
        ),
      ).toEqual([b2]);
      expect(
        (await row(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'of.corr.search'`, []))
          .n,
      ).toBe(before + 7);
      // Tenant khác không thấy gì.
      const other = await rowsOf(
        T2,
        `SELECT * FROM of_search_correspondence($1,$2,$3,null,null,null)`,
        [T2, U.admin, OFF],
      );
      expect(other).toEqual([]);

      const dec = (
        who: string,
        no: string,
        type: string,
        signer = U.head,
        extra: Partial<{
          kind: string | null;
          caseId: string | null;
          key: string | null;
          hash: string | null;
        }> = {},
      ) =>
        fn(
          'of_decision_record',
          who,
          OFF,
          BR1,
          no,
          type,
          'Quyết định giả lập',
          signer,
          '2026-10-03',
          extra.kind ?? null,
          extra.caseId ?? null,
          extra.key === undefined ? 'of/dec' : extra.key,
          extra.hash === undefined ? sha('d') : extra.hash,
        );
      expect(
        await dec(U.clerk, 'QĐ-1', 'Quyết định nội bộ', U.head, {
          kind: 'ENFORCEMENT',
          caseId: tha,
        }),
      ).toMatchObject({ ok: true });
      expect(await dec(U.clerk, 'QĐ-1', 'Quyết định nội bộ')).toMatchObject({
        ok: false,
        code: 'DUPLICATE_DECISION_NO',
      });
      expect(await dec(U.thvA, 'QĐ-2', 'Quyết định nội bộ')).toMatchObject({
        ok: false,
        code: 'ROLE_LACKS_PERMISSION',
      });
      expect(await dec(U.clerk, 'QĐ-3', 'Quyết định nội bộ', U.headNoSign)).toMatchObject({
        ok: false,
        code: 'SIGNING_AUTHORITY_NOT_GRANTED',
      });
      expect(
        await dec(U.clerk, 'QĐ-4', 'Quyết định nội bộ', U.head, { key: null, hash: null }),
      ).toMatchObject({ ok: false, code: 'INVALID_EVIDENCE' });
      expect(
        await dec(U.clerk, 'QĐ-5', 'Quyết định nội bộ', U.head, { kind: 'VIBANG', caseId: id() }),
      ).toMatchObject({ ok: false, code: 'CASE_LINK_NOT_FOUND' });
      expect(
        await fn(
          'of_tt06_register',
          U.admin,
          OFF,
          'IV',
          'Mẫu TT06 giả lập',
          'of/tt06-iv',
          sha('f'),
        ),
      ).toMatchObject({ ok: true });
      // Không tự cho Văn phòng "ban hành" biểu mẫu chỉ dành cho cơ quan nhà nước.
      expect(await dec(U.clerk, 'QĐ-6', 'IV')).toMatchObject({
        ok: false,
        code: 'AGENCY_ONLY_FORM',
      });
      expect(await dec(U.clerk, 'QĐ-7', 'mẫu TT06 giả lập')).toMatchObject({
        ok: false,
        code: 'AGENCY_ONLY_FORM',
      });
      const found = await search(
        U.admin,
        'of_search_decisions',
        OFF,
        'QĐ-1',
        null,
        null,
        null,
        null,
        null,
      );
      expect(found).toHaveLength(1);
      expect(
        await search(
          U.admin,
          'of_search_decisions',
          OFF,
          null,
          'Quyết định nội bộ',
          '2026-10-01',
          '2026-10-31',
          U.head,
          tha,
        ),
      ).toHaveLength(1);
      expect(
        await search(
          U.admin,
          'of_search_decisions',
          OFF,
          null,
          null,
          '2026-11-01',
          null,
          null,
          null,
        ),
      ).toEqual([]);
      expect(
        await search(U.thvA, 'of_search_decisions', OFF, null, null, null, null, null, null),
      ).toEqual([]);
      expect(
        await search(U.clerkOther, 'of_search_decisions', OFF, null, null, null, null, null, null),
      ).toEqual([]);
      await expect(owner.query(`UPDATE of_decisions SET title = 'sửa'`)).rejects.toThrow();
      await expect(owner.query(`DELETE FROM of_decisions`)).rejects.toThrow();
    });

    it('serves TT06 forms as download-only and rejects unauthorised registration', async () => {
      expect(
        await fn('of_tt06_register', U.clerk, OFF, 'I', 'Phụ lục I', 'of/tt06-i', sha('1')),
      ).toMatchObject({ ok: false, code: 'ADMIN_OR_HEAD_ONLY' });
      expect(
        await fn('of_tt06_register', U.admin, OFF, 'X', 'Không có', 'of/x', sha('1')),
      ).toMatchObject({ ok: false, code: 'INVALID_FORM' });
      expect(
        await fn('of_tt06_register', U.admin, OFF, 'I', 'Phụ lục I', '../etc', sha('1')),
      ).toMatchObject({ ok: false, code: 'INVALID_EVIDENCE' });
      expect(
        await fn('of_tt06_register', U.admin, OFF, 'I', 'Phụ lục I', 'of/tt06-i-v1', sha('1')),
      ).toMatchObject({ ok: true, label: 'I v1' });
      expect(
        await fn('of_tt06_register', U.admin, OFF, 'I', 'Phụ lục I', 'of/tt06-i-v2', sha('2')),
      ).toMatchObject({ ok: true, label: 'I v2' });
      expect(await fn('of_tt06_download', U.clerk, OFF, 'I')).toMatchObject({
        ok: true,
        label: 'of/tt06-i-v2',
      });
      expect(await fn('of_tt06_download', U.outsider, OFF, 'I')).toMatchObject({
        ok: false,
        code: 'ROLE_LACKS_PERMISSION',
      });
      expect(await fn('of_tt06_download', U.clerk, OFF, 'IX')).toMatchObject({
        ok: false,
        code: 'FORM_NOT_FOUND',
      });
      await expect(owner.query(`UPDATE of_tt06_forms SET title = 'x'`)).rejects.toThrow();
      // Không tồn tại hàm điền/ký/phát hành biểu mẫu TT06.
      const fns = (
        await owner.query(`SELECT proname FROM pg_proc WHERE proname LIKE 'of_tt06_%'`)
      ).rows
        .map((r) => r.proname)
        .sort();
      expect(fns).toEqual(['of_tt06_download', 'of_tt06_register']);
    });

    it('issues stock strictly FIFO, keeps batch provenance and never goes negative under concurrent issues', async () => {
      const item = (await fn('of_item_add', U.secretary, OFF, 'Giấy A4 giả lập', 'ream')).label!;
      expect(await fn('of_item_add', U.secretary, OFF, 'Giấy A4 giả lập', 'ream')).toMatchObject({
        ok: false,
        code: 'DUPLICATE_ITEM',
      });
      expect(await fn('of_item_add', U.thvA, OFF, 'Mực', 'hộp')).toMatchObject({
        ok: false,
        code: 'ROLE_LACKS_PERMISSION',
      });
      const b1 = (await fn('of_receive', U.clerk, item, BR1, 5, 'PN-1')).label!;
      const b2 = (await fn('of_receive', U.clerk, item, BR1, 5, 'PN-2')).label!;
      const other = (await fn('of_receive', U.admin, item, BR2, 7, 'PN-3')).label!;
      expect(await fn('of_receive', U.clerkOther, item, BR1, 1, 'PN-X')).toMatchObject({
        ok: false,
        code: 'BRANCH_NOT_GRANTED',
      });
      expect(await fn('of_receive', U.clerk, item, BR1, 0, 'PN-X')).toMatchObject({
        ok: false,
        code: 'INVALID_QUANTITY',
      });
      expect(await fn('of_issue', U.clerk, item, BR1, 7, 'In hồ sơ')).toMatchObject({ ok: true });
      const rem = async (b: string) =>
        (await row(`SELECT qty_remaining FROM of_batches WHERE id = $1`, [b]))
          .qty_remaining as number;
      expect([await rem(b1), await rem(b2), await rem(other)]).toEqual([0, 3, 7]); // lô cũ hết trước, lô địa điểm khác không đụng
      const issued = await owner.query(
        `SELECT batch_id, delta FROM of_movements WHERE kind = 'ISSUE' ORDER BY id`,
      );
      expect(issued.rows.map((r) => [r.batch_id, r.delta])).toEqual([
        [b1, -5],
        [b2, -2],
      ]);
      expect(await fn('of_issue', U.clerk, item, BR1, 4, 'x')).toMatchObject({
        ok: false,
        code: 'INSUFFICIENT_STOCK',
      });
      expect(await rem(b2)).toBe(3);
      expect(await fn('of_issue', U.clerk, item, BR1, 1, ' ')).toMatchObject({
        ok: false,
        code: 'INVALID_QUANTITY',
      });
      expect(await fn('of_issue', U.thvA, item, BR1, 1, 'x')).toMatchObject({
        ok: false,
        code: 'ROLE_LACKS_PERMISSION',
      });

      // 10 lần xuất song song, mỗi lần 1, chỉ còn 3 → đúng 3 thành công, còn lại INSUFFICIENT_STOCK, không âm.
      const results = await Promise.all(
        Array.from({ length: 10 }, () => fn('of_issue', U.clerk, item, BR1, 1, 'song song')),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(3);
      expect(results.filter((r) => !r.ok).every((r) => r.code === 'INSUFFICIENT_STOCK')).toBe(true);
      expect([await rem(b1), await rem(b2)]).toEqual([0, 0]);
      expect(
        (await row(`SELECT count(*)::int AS n FROM of_batches WHERE qty_remaining < 0`, [])).n,
      ).toBe(0);
      // Kiểm kê cần lý do và quyền; không vượt số đã nhập; ghi dòng ADJUSTMENT.
      expect(await fn('of_adjust', U.clerk, other, 5, 'Kiểm kê')).toMatchObject({
        ok: false,
        code: 'ADMIN_OR_HEAD_ONLY',
      });
      expect(await fn('of_adjust', U.admin, other, 5, ' ')).toMatchObject({
        ok: false,
        code: 'REASON_REQUIRED',
      });
      expect(await fn('of_adjust', U.admin, other, 8, 'Kiểm kê')).toMatchObject({
        ok: false,
        code: 'INVALID_QUANTITY',
      });
      expect(await fn('of_adjust', U.admin, other, 5, 'Hao hụt khi kiểm kê')).toMatchObject({
        ok: true,
        label: '-2',
      });
      expect(await rem(other)).toBe(5);
      const stock = await row(
        `SELECT on_hand FROM of_stock WHERE item_id = $1 AND branch_id = $2`,
        [item, BR2],
      );
      expect(stock.on_hand).toBe(5);
      await expect(owner.query(`UPDATE of_movements SET delta = 1`)).rejects.toThrow();
      await expect(
        owner.query(`UPDATE of_batches SET qty_remaining = -1 WHERE id = $1`, [other]),
      ).rejects.toThrow();
      await expect(
        owner.query(`UPDATE of_batches SET qty_received = 99 WHERE id = $1`, [other]),
      ).rejects.toThrow(/immutable/);
      // Không có cột giá/tiền trong bảng vật tư.
      const cols = (
        await owner.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name IN ('of_items','of_batches','of_movements')`,
        )
      ).rows.map((r) => r.column_name);
      expect(cols.some((c) => /price|cost|amount|money/i.test(c as string))).toBe(false);
    });

    it('keeps S-06 personnel as append-only versions readable only by Admin or Trưởng VP', async () => {
      const save = (
        who: string,
        person: string | null,
        over: Partial<{ name: string; gender: string; status: string }> = {},
      ) =>
        fn(
          'of_personnel_save',
          who,
          OFF,
          person,
          BR1,
          over.name ?? 'Nhân sự giả lập',
          over.gender ?? 'F',
          'Luật',
          'TPL-01',
          null,
          false,
          false,
          'HĐLĐ-01',
          true,
          'Đã mua (ghi chú)',
          null,
          null,
          null,
          over.status ?? 'ACTIVE',
        );
      expect(await save(U.clerk, null)).toMatchObject({ ok: false, code: 'ADMIN_OR_HEAD_ONLY' });
      expect(await save(U.admin, null, { gender: 'X' })).toMatchObject({
        ok: false,
        code: 'INVALID_PERSONNEL',
      });
      expect(await save(U.admin, id())).toMatchObject({ ok: false, code: 'PERSON_NOT_FOUND' });
      const p = (await save(U.admin, null)).label!;
      expect(await save(U.head, p, { status: 'LEFT' })).toMatchObject({ ok: true });
      expect(
        (
          await owner.query(
            `SELECT version FROM of_personnel WHERE person_id = $1 ORDER BY version`,
            [p],
          )
        ).rows.map((r) => r.version),
      ).toEqual([1, 2]);
      await expect(owner.query(`UPDATE of_personnel SET full_name = 'x'`)).rejects.toThrow();
      const read = await search(U.admin, 'of_s06_read', OFF);
      const mine = read.filter((r) => r.person_id === p);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ version: 2, work_status: 'LEFT' });
      const versions = await search(U.head, 'of_s06_versions', OFF, p);
      expect(versions.map((r) => r.version)).toEqual([2, 1]);
      expect(versions[0]).toMatchObject({ work_status: 'LEFT' });
      expect(versions[0]!.saved_by).toBeTruthy();
      expect(await search(U.secretary, 'of_s06_versions', OFF, p)).toEqual([]);
      expect(await search(U.thvA, 'of_s06_versions', OFF, p)).toEqual([]);
      expect(await search(U.secretary, 'of_s06_read', OFF)).toEqual([]);
      expect(await search(U.thvA, 'of_s06_read', OFF)).toEqual([]);
      expect(
        (
          await row(
            `SELECT count(*)::int AS n FROM audit_log WHERE action = 'of.s06.read' AND outcome = 'deny'`,
            [],
          )
        ).n,
      ).toBeGreaterThanOrEqual(2);
      const cols = (
        await owner.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name = 'of_personnel'`,
        )
      ).rows.map((r) => r.column_name);
      expect(cols.some((c) => /price|cost|amount|salary|premium/i.test(c as string))).toBe(false);
    });
  },
);
