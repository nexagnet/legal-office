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
const DB = `lo_ap_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
  'shared approval workflow (reject, return, resubmit) on PostgreSQL',
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

    const newCase = async (): Promise<string> => {
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
      expect(await fn('th_assign', U.admin, r.label!, U.thvA)).toMatchObject({ ok: true });
      return r.label!;
    };
    const newAsset = async (cs: string, sensitivity = 'NORMAL', who = U.thvA) => {
      const r = await fn(
        'as_add_asset',
        who,
        cs,
        'Loại giả lập',
        'Tài sản giả lập',
        sensitivity,
        null,
        null,
      );
      expect(r).toMatchObject({ ok: true });
      return r.label!;
    };
    const event = (
      asset: string,
      who: string,
      kind: string,
      idem: string,
      key = 'as/ev',
      hash = sha('e'),
    ) => fn('as_record_event', who, asset, kind, 'Ghi nhận giả lập', key, hash, idem);
    const proposal = async (asset: string) => {
      const r = await fn(
        'as_propose_measure',
        U.thvA,
        asset,
        'Biện pháp bảo đảm',
        'Có nguy cơ tẩu tán (giả lập)',
      );
      expect(r).toMatchObject({ ok: true });
      return r.label!;
    };
    const status = async (table: string, idv: string) =>
      (await row(`SELECT status FROM ${table} WHERE id = $1`, [idv])).status as string;

    it('keeps per-asset events immutable and idempotent, and audits access to sensitive assets', async () => {
      const cs = await newCase();
      const a = await newAsset(cs, 'SENSITIVE');
      for (const [i, kind] of ['DISCOVERY', 'VERIFICATION', 'DISPUTE', 'HANDOVER'].entries()) {
        expect(await event(a, U.thvA, kind, 'k' + i)).toMatchObject({ ok: true });
      }
      const first = await event(a, U.thvA, 'DISCOVERY', 'dup1');
      expect(await event(a, U.thvA, 'DISCOVERY', 'dup1')).toMatchObject({
        ok: true,
        code: 'ALREADY_RECORDED',
        label: first.label,
      });
      expect(await event(a, U.thvA, 'ORDER_RECORDED', 'x')).toMatchObject({
        ok: false,
        code: 'INVALID_EVENT',
      });
      expect(await event(a, U.thvA, 'DISCOVERY', 'y', '../etc', sha('e'))).toMatchObject({
        ok: false,
        code: 'INVALID_EVIDENCE',
      });
      expect(
        (await row(`SELECT count(*)::int AS n FROM as_events WHERE asset_id = $1`, [a])).n,
      ).toBe(5);
      await expect(owner.query(`UPDATE as_events SET note = 'sửa'`)).rejects.toThrow();
      await expect(owner.query(`DELETE FROM as_events`)).rejects.toThrow();
      await expect(
        owner.query(`UPDATE as_assets SET label = 'x' WHERE id = $1`, [a]),
      ).rejects.toThrow();

      expect(await fn('as_access_asset', U.thvA, a, '')).toMatchObject({
        ok: false,
        code: 'PURPOSE_REQUIRED',
      });
      expect(await fn('as_access_asset', U.thvB, a, 'xem')).toMatchObject({
        ok: false,
        code: 'NOT_ASSIGNED_HANDLER',
      });
      expect(await fn('as_access_asset', U.secretary, a, 'xem')).toMatchObject({
        ok: false,
        code: 'ROLE_LACKS_PERMISSION',
      });
      const before = (
        await row(
          `SELECT count(*)::int AS n FROM audit_log WHERE action = 'as.asset.access' AND outcome = 'allow'`,
          [],
        )
      ).n;
      expect(await fn('as_access_asset', U.thvA, a, 'Đối chiếu')).toMatchObject({
        ok: true,
        label: 'Tài sản giả lập',
      });
      expect(
        (
          await row(
            `SELECT count(*)::int AS n FROM audit_log WHERE action = 'as.asset.access' AND outcome = 'allow'`,
            [],
          )
        ).n,
      ).toBe(before + 1);
      // Sổ S-05 không lộ nhãn.
      const book = await row(`SELECT * FROM as_s05_book WHERE asset_id = $1`, [a]);
      expect(Object.values(book)).not.toContain('Tài sản giả lập');
      expect(book).toMatchObject({
        category: 'Loại giả lập',
        sensitivity: 'SENSITIVE',
        events: 5,
        latest_measure_status: null,
      });
    });

    it('never promotes a measure request to applied without a signed order from the agency', async () => {
      const cs = await newCase();
      const a = await newAsset(cs);
      const p = await proposal(a);
      expect(await status('as_proposals', p)).toBe('PROPOSED');
      // THV/Thư ký không ghi nhận lệnh; thiếu bản có chữ ký hoặc cơ quan thì từ chối.
      expect(
        await fn('as_record_order', U.thvA, p, 'Cơ quan giả lập', 'LỆNH-1', 'as/order', sha('f')),
      ).toMatchObject({ ok: false, code: 'ADMIN_OR_HEAD_ONLY' });
      expect(
        await fn('as_record_order', U.admin, p, 'Cơ quan giả lập', 'LỆNH-1', null, null),
      ).toMatchObject({ ok: false, code: 'SIGNED_ORDER_REQUIRED' });
      expect(
        await fn('as_record_order', U.admin, p, 'Cơ quan giả lập', 'LỆNH-1', 'as/order', 'bad'),
      ).toMatchObject({ ok: false, code: 'SIGNED_ORDER_REQUIRED' });
      expect(
        await fn('as_record_order', U.admin, p, ' ', 'LỆNH-1', 'as/order', sha('f')),
      ).toMatchObject({ ok: false, code: 'INVALID_ORDER' });
      expect(await status('as_proposals', p)).toBe('PROPOSED');
      // Không thể ép trạng thái APPLIED bằng SQL trực tiếp khi không có lệnh.
      await expect(
        owner.query(`UPDATE as_proposals SET status = 'APPLIED' WHERE id = $1`, [p]),
      ).rejects.toThrow();
      expect(
        await fn('as_record_order', U.head, p, 'Cơ quan giả lập', 'LỆNH-1', 'as/order', sha('f')),
      ).toMatchObject({ ok: true });
      expect(await status('as_proposals', p)).toBe('APPLIED');
      expect(
        (
          await row(
            `SELECT count(*)::int AS n FROM as_events WHERE asset_id = $1 AND kind = 'ORDER_RECORDED'`,
            [a],
          )
        ).n,
      ).toBe(1);
      expect(
        (await row(`SELECT latest_measure_status AS s FROM as_s05_book WHERE asset_id = $1`, [a]))
          .s,
      ).toBe('APPLIED');
      expect(
        await fn('as_record_order', U.admin, p, 'Cơ quan giả lập', 'LỆNH-2', 'as/order2', sha('f')),
      ).toMatchObject({ ok: false, code: 'PROPOSAL_FINAL' });
      expect(await fn('as_withdraw_proposal', U.thvA, p)).toMatchObject({
        ok: false,
        code: 'PROPOSAL_FINAL',
      });
      await expect(owner.query(`DELETE FROM as_orders`)).rejects.toThrow();
      await expect(
        owner.query(`UPDATE as_proposals SET rationale = 'x' WHERE id = $1`, [p]),
      ).rejects.toThrow();
      // Rút đề xuất: kết thúc, không áp dụng được sau đó.
      const p2 = await proposal(a);
      expect(await fn('as_withdraw_proposal', U.thvB, p2)).toMatchObject({
        ok: false,
        code: 'NOT_ASSIGNED_HANDLER',
      });
      expect(await fn('as_withdraw_proposal', U.thvA, p2)).toMatchObject({ ok: true });
      expect(
        await fn('as_record_order', U.admin, p2, 'Cơ quan', 'LỆNH-3', 'as/order3', sha('f')),
      ).toMatchObject({ ok: false, code: 'PROPOSAL_FINAL' });
    });

    const transfer = async (cs: string) =>
      (await fn('as_transfer_propose', U.thvA, cs, U.thvB)).label!;
    const decide = (
      who: string,
      kind: string,
      subject: string,
      d: string,
      reason = 'lý do giả lập',
    ) => fn('ap_decide', who, kind, subject, d, reason);
    const flow = async (t: string) => {
      for (const s of ['APP_APPROVAL', 'LEGAL_DECISION', 'HANDOVER_N08']) {
        expect(await fn('as_transfer_step', U.admin, t, s, 'ap/' + s, sha('c'))).toMatchObject({
          ok: true,
        });
      }
    };

    it('rejection ends a transfer; a fresh proposal is needed and the old one never completes', async () => {
      const cs = await newCase();
      const t = await transfer(cs);
      await flow(t);
      expect(await decide(U.thvA, 'TRANSFER', t, 'REJECT')).toMatchObject({
        ok: false,
        code: 'ADMIN_OR_HEAD_ONLY',
      });
      expect(await decide(U.secretary, 'TRANSFER', t, 'RETURN')).toMatchObject({
        ok: false,
        code: 'ADMIN_OR_HEAD_ONLY',
      });
      expect(await decide(U.admin, 'TRANSFER', t, 'REJECT', '  ')).toMatchObject({
        ok: false,
        code: 'REASON_REQUIRED',
      });
      expect(await decide(U.admin, 'TRANSFER', t, 'NUKE')).toMatchObject({
        ok: false,
        code: 'INVALID_DECISION',
      });
      expect(await decide(U.head, 'TRANSFER', t, 'REJECT')).toMatchObject({ ok: true });
      expect(await decide(U.admin, 'TRANSFER', t, 'REJECT')).toMatchObject({
        ok: false,
        code: 'ALREADY_REJECTED',
      });
      expect(await decide(U.thvA, 'TRANSFER', t, 'RESUBMIT')).toMatchObject({
        ok: false,
        code: 'ALREADY_REJECTED',
      });
      expect(await fn('as_transfer_complete', U.admin, t)).toMatchObject({
        ok: false,
        code: 'APPROVAL_REJECTED',
      });
      expect(
        (await row(`SELECT handler_user_id FROM th_cases WHERE id = $1`, [cs])).handler_user_id,
      ).toBe(U.thvA);
      // Đề xuất mới hoàn tất bình thường.
      const t2 = await transfer(cs);
      await flow(t2);
      expect(await fn('as_transfer_complete', U.admin, t2)).toMatchObject({ ok: true });
      expect(await decide(U.admin, 'TRANSFER', t2, 'REJECT')).toMatchObject({
        ok: false,
        code: 'SUBJECT_FINAL',
      });
    });

    it('return-for-info blocks completion until the proposer resubmits', async () => {
      const cs = await newCase();
      const t = await transfer(cs);
      await flow(t);
      expect(await decide(U.admin, 'TRANSFER', t, 'RETURN', 'thiếu biên bản')).toMatchObject({
        ok: true,
      });
      expect(await decide(U.admin, 'TRANSFER', t, 'RETURN')).toMatchObject({
        ok: false,
        code: 'ALREADY_RETURNED',
      });
      expect(await fn('as_transfer_complete', U.admin, t)).toMatchObject({
        ok: false,
        code: 'APPROVAL_RETURNED',
      });
      expect(await decide(U.thvC, 'TRANSFER', t, 'RESUBMIT')).toMatchObject({
        ok: false,
        code: 'NOT_ASSIGNED_HANDLER',
      });
      expect(await decide(U.thvA, 'TRANSFER', t, 'RESUBMIT', 'đã bổ sung')).toMatchObject({
        ok: true,
      });
      expect(await fn('as_transfer_complete', U.admin, t)).toMatchObject({ ok: true });
      const hist = await owner.query(
        `SELECT decision FROM ap_history WHERE subject_id = $1 ORDER BY id`,
        [t],
      );
      expect(hist.rows.map((r) => r.decision)).toEqual(['RETURN', 'RESUBMIT']);
      await expect(owner.query(`DELETE FROM ap_decisions`)).rejects.toThrow();
      await expect(owner.query(`UPDATE ap_decisions SET reason = 'x'`)).rejects.toThrow();
    });

    it('applies to verification delegations and respects tenant isolation', async () => {
      const r = await fn('vx_create_case', U.clerk, OFF, BR1, 'XM/' + id().slice(0, 8));
      expect(await fn('vx_assign', U.admin, r.label!, U.thvA)).toMatchObject({ ok: true });
      const d = (await fn('vx_delegation_request', U.thvA, r.label!, U.thvB)).label!;
      expect(await decide(U.admin, 'DELEGATION', d, 'REJECT')).toMatchObject({ ok: true });
      expect(await fn('vx_delegation_activate', U.admin, d)).toMatchObject({
        ok: false,
        code: 'APPROVAL_REJECTED',
      });
      expect(await decide(U.admin, 'DELEGATION', id(), 'REJECT')).toMatchObject({
        ok: false,
        code: 'SUBJECT_NOT_FOUND',
      });
      expect(await decide(U.admin, 'OTHER', d, 'REJECT')).toMatchObject({
        ok: false,
        code: 'INVALID_SUBJECT_KIND',
      });
      const foreign = await call(
        T2,
        `SELECT * FROM ap_decide($1,$2,'DELEGATION',$3,'REJECT','x')`,
        [T2, U.admin, d],
      );
      expect(foreign).toMatchObject({ ok: false, code: 'SUBJECT_NOT_FOUND' });
      const audit = await row(
        `SELECT count(*)::int n FROM audit_log WHERE action = 'ap.decide' AND outcome = 'deny'`,
        [],
      );
      expect(audit.n).toBeGreaterThan(0);
    });
    it('lists pending proposals with their approval state within the reading scope', async () => {
      const cs = await newCase();
      const t = await transfer(cs);
      await decide(U.admin, 'TRANSFER', t, 'RETURN', 'thiếu biên bản');
      const pending = async (who: string) => {
        const cl = await app.connect();
        try {
          await cl.query('BEGIN');
          await cl.query(`SELECT set_config('app.tenant_id', $1, true)`, [T]);
          const r = await cl.query(`SELECT * FROM of_search_approvals($1,$2,$3)`, [T, who, OFF]);
          await cl.query('COMMIT');
          return r.rows as {
            subject_id: string;
            approval_state: string;
            last_reason: string | null;
          }[];
        } finally {
          cl.release();
        }
      };
      const mine = (await pending(U.admin)).find((r) => r.subject_id === t);
      expect(mine).toMatchObject({ approval_state: 'RETURNED', last_reason: 'thiếu biên bản' });
      expect((await pending(U.thvA)).map((r) => r.subject_id)).toContain(t);
      expect((await pending(U.thvC)).map((r) => r.subject_id)).not.toContain(t);
      expect(await pending(U.outsider)).toEqual([]);
      await decide(U.thvA, 'TRANSFER', t, 'RESUBMIT', 'đã bổ sung');
      expect((await pending(U.admin)).find((r) => r.subject_id === t)?.approval_state).toBe('OPEN');
      await flow(t);
      await fn('as_transfer_complete', U.admin, t);
      expect((await pending(U.admin)).map((r) => r.subject_id)).not.toContain(t);
    });
  },
);
