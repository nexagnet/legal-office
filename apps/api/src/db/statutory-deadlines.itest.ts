import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Cần PostgreSQL tạm có quyền tạo database. Dữ liệu giả lập; không số tiền.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_sd_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const sha = (c: string) => c.repeat(64);
const ICT = (iso: string) => new Date(`${iso}+07:00`).toISOString();

describe.skipIf(!ADMIN_URL)('hạn pháp định NĐ 151 và chấm dứt THA (PostgreSQL)', () => {
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
  const U = {
    admin: id(),
    head: id(),
    signer: id(),
    thv: id(),
    thv2: id(),
    clerk: id(),
    other: id(),
  };

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
  const call = (tenant: string, name: string, args: unknown[]) =>
    withTenant<Record<string, unknown>>(
      tenant,
      `SELECT * FROM ${name}(${args.map((_, i) => `$${i + 1}`).join(',')})`,
      args,
    );
  const fn = async (name: string, ...args: unknown[]) =>
    (await call(T, name, args))[0] as { ok: boolean; code: string };
  const dl = async (kind: string, ref: string) =>
    (
      await owner.query(
        `SELECT * FROM office_statutory_deadlines WHERE kind = $1 AND ref_id = $2`,
        [kind, ref],
      )
    ).rows[0];

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
    const people: [string, string | null, boolean][] = [
      [U.admin, 'ADMIN', false],
      [U.head, 'TRUONG_VP', false],
      [U.signer, 'TRUONG_VP', true],
      [U.thv, 'THV', false],
      [U.thv2, 'THV', false],
      [U.clerk, 'VAN_THU', false],
      [U.other, null, false],
    ];
    for (const [uid, role, signer] of people) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        role ?? 'x' + uid.slice(0, 4),
      ]);
      if (role) {
        await owner.query(
          `INSERT INTO memberships (tenant_id, user_id, office_id, role, legal_signer) VALUES ($1,$2,$3,$4,$5)`,
          [T, uid, OFF, role, signer],
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

  it('of_working_due: bỏ thứ Bảy/Chủ nhật và ngày lễ của văn phòng, hết ngày 23:59:59 giờ Việt Nam', async () => {
    const r = await owner.query(`SELECT of_working_due($1,$2,$3,$4) AS d`, [
      T,
      OFF,
      ICT('2026-10-15T10:00:00'),
      2,
    ]);
    expect(new Date(r.rows[0].d).toISOString()).toBe(ICT('2026-10-19T23:59:59')); // Thứ Năm + 2 ngày làm việc = Thứ Hai
    await owner.query(
      `INSERT INTO office_holidays (tenant_id, office_id, day, label, created_by) VALUES ($1,$2,'2026-10-19','Nghỉ giả lập',$3)`,
      [T, OFF, U.admin],
    );
    const r2 = await owner.query(`SELECT of_working_due($1,$2,$3,$4) AS d`, [
      T,
      OFF,
      ICT('2026-10-15T10:00:00'),
      2,
    ]);
    expect(new Date(r2.rows[0].d).toISOString()).toBe(ICT('2026-10-20T23:59:59'));
    await owner.query(`DELETE FROM office_holidays WHERE office_id = $1`, [OFF]);
    // Văn phòng khác tenant không bị ảnh hưởng và dùng lịch mặc định thứ Hai–thứ Sáu.
    const r3 = await owner.query(`SELECT of_working_due($1,$2,$3,$4) AS d`, [
      T2,
      OFF2,
      ICT('2026-10-16T09:00:00'),
      3,
    ]);
    expect(new Date(r3.rows[0].d).toISOString()).toBe(ICT('2026-10-21T23:59:59'));
  });

  describe('Điều 25.2: báo kết quả tống đạt', () => {
    it('sinh hạn 2 ngày làm việc khi văn bản tống đạt xong, chỉ người có quyền đóng được', async () => {
      const rid = id();
      await owner.query(
        `INSERT INTO td_requests (id, tenant_id, office_id, branch_id, request_ref, created_by) VALUES ($1,$2,$3,$4,'YC-SD',$5)`,
        [rid, T, OFF, BR, U.admin],
      );
      const doc = await owner.query(
        `INSERT INTO td_documents (tenant_id, request_id, recipient_name, address, deadline_at, handler_user_id, status)
         VALUES ($1,$2,'Người nhận giả lập','đ', now() + interval '30 days', $3, 'ASSIGNED') RETURNING id`,
        [T, rid, U.thv],
      );
      const d = doc.rows[0].id as string;
      expect(await dl('TD_RESULT_REPORT', d)).toBeUndefined();
      expect(
        await fn(
          'td_record_attempt',
          T,
          U.thv,
          d,
          'SERVED',
          'k/e',
          sha('a'),
          null,
          ICT('2026-10-15T10:00:00'),
        ),
      ).toMatchObject({ ok: true });
      const row = await dl('TD_RESULT_REPORT', d);
      expect(row).toMatchObject({
        status: 'OPEN',
        working_days: 2,
        label: 'Người nhận giả lập',
        case_id: rid,
      });
      expect(new Date(row.due_at).toISOString()).toBe(ICT('2026-10-19T23:59:59'));

      expect(await fn('of_deadline_done', T, U.other, row.id, 'đã báo')).toMatchObject({
        ok: false,
        code: 'ROLE_LACKS_PERMISSION',
      });
      expect(await fn('of_deadline_done', T, U.thv2, row.id, 'đã báo')).toMatchObject({
        ok: false,
        code: 'NOT_ASSIGNED_HANDLER',
      });
      expect(await fn('of_deadline_done', T, U.thv, row.id, '  ')).toMatchObject({
        ok: false,
        code: 'NOTE_REQUIRED',
      });
      expect(
        await fn('of_deadline_done', T, U.thv, row.id, 'Đã gửi kết quả cho Tòa án'),
      ).toMatchObject({ ok: true });
      expect(await fn('of_deadline_done', T, U.admin, row.id, 'lại')).toMatchObject({
        ok: false,
        code: 'ALREADY_DONE',
      });
      expect(await dl('TD_RESULT_REPORT', d)).toMatchObject({ status: 'DONE', done_by: U.thv });
    });

    it('văn bản không tống đạt được cũng sinh hạn; không sinh trùng', async () => {
      const rid = id();
      await owner.query(
        `INSERT INTO td_requests (id, tenant_id, office_id, branch_id, request_ref, created_by) VALUES ($1,$2,$3,$4,'YC-SD2',$5)`,
        [rid, T, OFF, BR, U.admin],
      );
      const d = (
        await owner.query(
          `INSERT INTO td_documents (tenant_id, request_id, recipient_name, address, deadline_at, handler_user_id, status)
           VALUES ($1,$2,'Không gặp','đ', now() + interval '30 days', $3, 'ASSIGNED') RETURNING id`,
          [T, rid, U.thv],
        )
      ).rows[0].id as string;
      expect(await fn('td_record_attempt', T, U.thv, d, 'ABSENT', null, null, null)).toMatchObject({
        ok: true,
      });
      expect(await dl('TD_RESULT_REPORT', d)).toBeUndefined(); // vẫn đang tống đạt
      expect(await fn('td_mark_undeliverable', T, U.thv, d, 'NO_RECIPIENT')).toMatchObject({
        ok: true,
      });
      expect(await dl('TD_RESULT_REPORT', d)).toMatchObject({ status: 'OPEN' });
      expect(
        (
          await owner.query(
            `SELECT count(*)::int n FROM office_statutory_deadlines WHERE ref_id = $1`,
            [d],
          )
        ).rows[0].n,
      ).toBe(1);
    });
  });

  describe('Điều 35.1: quyết định xác minh', () => {
    it('ngày ký hợp đồng sinh/sửa hạn 3 ngày làm việc; chỉ Trưởng VP có quyền ký đóng được', async () => {
      const c = (
        await owner.query(
          `INSERT INTO vx_cases (tenant_id, office_id, branch_id, case_ref, created_by, handler_user_id) VALUES ($1,$2,$3,'XM-SD',$4,$5) RETURNING id`,
          [T, OFF, BR, U.admin, U.thv],
        )
      ).rows[0].id as string;
      expect(await fn('vx_set_contract_date', T, U.clerk, c, '2026-10-14')).toMatchObject({
        ok: false,
      });
      expect(await fn('vx_set_contract_date', T, U.thv2, c, '2026-10-14')).toMatchObject({
        ok: false,
        code: 'NOT_ASSIGNED_HANDLER',
      });
      expect(await fn('vx_set_contract_date', T, U.thv, c, '2099-01-01')).toMatchObject({
        ok: false,
        code: 'INVALID_DATE',
      });
      expect(await fn('vx_set_contract_date', T, U.thv, c, '2026-10-14')).toMatchObject({
        ok: true,
      });
      let row = await dl('VX_DECISION', c);
      expect(row).toMatchObject({ status: 'OPEN', working_days: 3, label: 'XM-SD' });
      expect(new Date(row.due_at).toISOString()).toBe(ICT('2026-10-19T23:59:59')); // Thứ Tư + 3 = Thứ Hai
      expect(await fn('vx_set_contract_date', T, U.admin, c, '2026-10-15')).toMatchObject({
        ok: true,
      });
      row = await dl('VX_DECISION', c);
      expect(new Date(row.due_at).toISOString()).toBe(ICT('2026-10-20T23:59:59'));

      // Hạn thỏa thuận khác: chỉ Admin/Trưởng VP, cần lý do và hạn sau ngày bắt đầu.
      expect(
        await fn('of_deadline_agree', T, U.thv, row.id, ICT('2026-10-30T23:59:59'), 'thỏa thuận'),
      ).toMatchObject({ ok: false, code: 'ADMIN_OR_HEAD_ONLY' });
      expect(
        await fn('of_deadline_agree', T, U.admin, row.id, ICT('2026-10-30T23:59:59'), ' '),
      ).toMatchObject({ ok: false, code: 'REASON_REQUIRED' });
      expect(
        await fn('of_deadline_agree', T, U.admin, row.id, ICT('2026-10-01T00:00:00'), 'x'),
      ).toMatchObject({ ok: false, code: 'INVALID_DUE' });
      expect(
        await fn(
          'of_deadline_agree',
          T,
          U.admin,
          row.id,
          ICT('2026-10-30T23:59:59'),
          'Hợp đồng ghi 10 ngày',
        ),
      ).toMatchObject({ ok: true });
      expect(await dl('VX_DECISION', c)).toMatchObject({ agreed_note: 'Hợp đồng ghi 10 ngày' });

      // Quyết định xác minh: Admin và Trưởng VP không có quyền ký thì không đóng được.
      for (const who of [U.admin, U.head, U.thv]) {
        expect(await fn('of_deadline_done', T, who, row.id, 'đã ra quyết định')).toMatchObject({
          ok: false,
          code: 'SIGNING_AUTHORITY_NOT_GRANTED',
        });
      }
      expect(
        await fn('of_deadline_done', T, U.signer, row.id, 'Đã ra quyết định N-06'),
      ).toMatchObject({ ok: true });
      expect(await fn('vx_set_contract_date', T, U.admin, c, '2026-10-16')).toMatchObject({
        ok: false,
        code: 'ALREADY_DONE',
      });
      expect(
        await fn('of_deadline_agree', T, U.admin, row.id, ICT('2026-11-30T23:59:59'), 'x'),
      ).toMatchObject({ ok: false, code: 'ALREADY_DONE' });
    });
  });

  describe('Điều 46: chấm dứt tổ chức THA', () => {
    const newCase = async (ref: string) =>
      (
        await owner.query(
          `INSERT INTO th_cases (tenant_id, office_id, branch_id, case_ref, agreement_ref, decision_ref, created_by, handler_user_id)
           VALUES ($1,$2,$3,$4,'HD','QD',$5,$6) RETURNING id`,
          [T, OFF, BR, ref, U.admin, U.thv],
        )
      ).rows[0].id as string;

    it('nghĩa vụ có hạn và chấm dứt có kết quả thực tế (bản 8 tham số) hiện trong đọc hồ sơ', async () => {
      const c = await newCase('THA-N46');
      expect(
        await fn('th_add_obligation', T, U.admin, c, 'Nghĩa vụ có hạn', null, '2026-11-30'),
      ).toMatchObject({ ok: true });
      expect(await fn('th_add_obligation', T, U.thv2, c, 'x', null, '2026-11-30')).toMatchObject({
        ok: false,
      });
      expect(
        (await owner.query(`SELECT due_on::text d FROM th_obligations WHERE case_id = $1`, [c]))
          .rows,
      ).toEqual([{ d: '2026-11-30' }]);
      const listed = await owner.query(`SELECT obligations FROM th_list_cases($1,$2,10)`, [
        T,
        U.admin,
      ]);
      const mine = listed.rows.find((r) =>
        (r.obligations as { description: string }[]).some(
          (o) => o.description === 'Nghĩa vụ có hạn',
        ),
      );
      expect(mine.obligations[0]).toMatchObject({ dueOn: '2026-11-30', events: [] });
      expect(
        await fn('th_terminate_case', T, U.admin, c, 'AGREEMENT', 'điểm b', 'k/t', sha('b'), ' '),
      ).toMatchObject({ ok: false, code: 'OUTCOME_REQUIRED' });
      expect(
        await fn(
          'th_terminate_case',
          T,
          U.admin,
          c,
          'AGREEMENT',
          'điểm b',
          'k/t',
          sha('b'),
          'Đã báo đương sự',
        ),
      ).toMatchObject({ ok: true });
      const info = await owner.query(`SELECT * FROM th_get_termination($1,$2,$3)`, [T, U.admin, c]);
      expect(info.rows[0]).toMatchObject({ reason: 'AGREEMENT', outcome: 'Đã báo đương sự' });
      // Bỏ hạn thu hồi sinh ra để không lẫn vào ca đọc theo phạm vi ở dưới.
      await owner.query(`DELETE FROM office_statutory_deadlines WHERE case_id = $1`, [c]);
    });

    it('chấm dứt sớm cần lý do có mã, căn cứ và tệp; sinh hạn thu hồi quyết định THA; hồ sơ bị khóa', async () => {
      const c = await newCase('THA-T1');
      await owner.query(
        `INSERT INTO th_obligations (tenant_id, case_id, seq, description, created_by) VALUES ($1,$2,1,'Nghĩa vụ chưa xong',$3)`,
        [T, c, U.admin],
      );
      expect(
        await fn('th_terminate_case', T, U.thv, c, 'AGREEMENT', 'điểm b', 'k/t', sha('b')),
      ).toMatchObject({ ok: false, code: 'ADMIN_OR_HEAD_ONLY' });
      expect(
        await fn('th_terminate_case', T, U.admin, c, 'LÝ DO LẠ', 'điểm b', 'k/t', sha('b')),
      ).toMatchObject({ ok: false, code: 'INVALID_REASON' });
      expect(
        await fn('th_terminate_case', T, U.admin, c, 'AGREEMENT', ' ', 'k/t', sha('b')),
      ).toMatchObject({ ok: false, code: 'BASIS_REQUIRED' });
      expect(
        await fn('th_terminate_case', T, U.admin, c, 'AGREEMENT', 'điểm b', '../x', sha('b')),
      ).toMatchObject({ ok: false, code: 'INVALID_EVIDENCE' });
      expect(await dl('TH_REVOKE', c)).toBeUndefined();
      expect(
        await fn(
          'th_terminate_case',
          T,
          U.admin,
          c,
          'AGREEMENT',
          'Điểm b khoản 5 Điều 31 (đương sự thỏa thuận)',
          'k/t',
          sha('b'),
        ),
      ).toMatchObject({ ok: true });
      expect(
        await fn('th_terminate_case', T, U.admin, c, 'OTHER', 'x', 'k/t', sha('b')),
      ).toMatchObject({ ok: false, code: 'CASE_NOT_OPEN' });
      expect(await fn('th_complete_case', T, U.admin, c, 'k/c', sha('c'))).toMatchObject({
        ok: false,
        code: 'CASE_NOT_OPEN',
      });
      await expect(
        owner.query(`UPDATE th_cases SET handler_user_id = NULL WHERE id = $1`, [c]),
      ).rejects.toThrow(/terminated/);
      const row = await dl('TH_REVOKE', c);
      expect(row).toMatchObject({ status: 'OPEN', working_days: 2, label: 'THA-T1' });
      expect(
        await fn('of_deadline_done', T, U.admin, row.id, 'Đã ra quyết định thu hồi'),
      ).toMatchObject({ ok: false, code: 'SIGNING_AUTHORITY_NOT_GRANTED' });
      expect(
        await fn(
          'of_deadline_done',
          T,
          U.signer,
          row.id,
          'Đã ra quyết định thu hồi, gửi Viện kiểm sát',
        ),
      ).toMatchObject({ ok: true });
    });

    it('hoàn tất bình thường cũng sinh hạn thu hồi; đọc theo phạm vi và cô lập tenant', async () => {
      const c = await newCase('THA-T2');
      const ob = (
        await owner.query(
          `INSERT INTO th_obligations (tenant_id, case_id, seq, description, created_by) VALUES ($1,$2,1,'NV',$3) RETURNING id`,
          [T, c, U.admin],
        )
      ).rows[0].id as string;
      await owner.query(`UPDATE th_obligations SET status = 'COMPLETED' WHERE id = $1`, [ob]);
      expect(await fn('th_complete_case', T, U.admin, c, 'k/c', sha('c'))).toMatchObject({
        ok: true,
      });
      const row = await dl('TH_REVOKE', c);
      expect(row).toMatchObject({ status: 'OPEN' });

      const until = new Date(Date.now() + 30 * 86400000).toISOString();
      const mine = await call(T, 'of_search_deadlines', [T, U.thv, OFF, until]);
      expect(
        mine.filter((r) => r.domain === 'THA_THU_HOI').map((r) => [r.label, r.can_close]),
      ).toEqual([['THA-T2', true]]);
      expect(
        (await call(T, 'of_search_deadlines', [T, U.thv2, OFF, until])).filter(
          (r) => r.domain === 'THA_THU_HOI',
        ),
      ).toEqual([]);
      expect(
        (await call(T, 'of_search_deadlines', [T, U.admin, OFF, until])).filter(
          (r) => r.domain === 'THA_THU_HOI',
        ),
      ).toHaveLength(1);
      await call(T, 'of_sync_notifications', [T, U.thv, OFF, 30]);
      const notes = await call(T, 'of_search_notifications', [T, U.thv, OFF, false, 50]);
      expect(notes.some((n) => n.domain === 'THA_THU_HOI')).toBe(true);
      expect(
        (
          await withTenant<{ n: number }>(
            T2,
            `SELECT count(*)::int n FROM office_statutory_deadlines`,
            [],
          )
        )[0]!.n,
      ).toBe(0);
      expect((await call(T2, 'of_deadline_done', [T2, U.admin, row.id, 'x']))[0]).toMatchObject({
        ok: false,
        code: 'DEADLINE_NOT_FOUND',
      });
    });
  });

  describe('Điều 31.3: sửa lỗi N-11', () => {
    it('văn bản sửa lỗi đã lập sinh hạn cập nhật CSDL 2 ngày làm việc', async () => {
      const cid = id();
      await owner.query(
        `INSERT INTO vibang_cases (id, tenant_id, office_id, branch_id, customer_id, title) VALUES ($1,$2,$3,$4,$5,'Hồ sơ N-11')`,
        [cid, T, OFF, BR, CUST],
      );
      await owner.query(
        `UPDATE vibang_cases SET status = 'ASSIGNED', responsible_thv_user_id = $2, version = version + 1 WHERE id = $1`,
        [cid, U.thv],
      );
      expect(
        await fn(
          'vibang_add_document',
          T,
          cid,
          U.thv,
          'N11_CORRECTION',
          'UPLOADED',
          'k/n11',
          sha('7'),
          'application/pdf',
          1024,
        ),
      ).toMatchObject({ ok: true });
      const doc = await owner.query(
        `SELECT id FROM vibang_documents WHERE case_id = $1 AND kind = 'N11_CORRECTION'`,
        [cid],
      );
      const k = (
        await owner.query(
          `INSERT INTO vibang_n11_corrections (tenant_id, case_id, reason, requested_by) VALUES ($1,$2,'sai tên',$3) RETURNING id`,
          [T, cid, U.thv],
        )
      ).rows[0].id as string;
      expect(await dl('VB_N11_CSDL', k)).toBeUndefined();
      expect(await fn('vibang_apply_n11', T, k, U.signer, doc.rows[0].id)).toMatchObject({
        ok: true,
      });
      const row = await dl('VB_N11_CSDL', k);
      expect(row).toMatchObject({
        status: 'OPEN',
        working_days: 2,
        label: 'Hồ sơ N-11',
        handler_user_id: U.thv,
      });
      expect(new Date(row.due_at).getTime()).toBeGreaterThan(new Date(row.start_at).getTime());
      expect(
        await fn('of_deadline_done', T, U.thv, row.id, 'Đã cập nhật CSDL và gửi người yêu cầu'),
      ).toMatchObject({ ok: true });
    });
  });
});
