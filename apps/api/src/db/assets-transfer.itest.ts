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
const DB = `lo_as_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
  'assets, competent-agency orders and N-08 transfer on PostgreSQL',
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

    it('lists assets with events, proposals and orders; hides sensitive labels and respects scope', async () => {
      const cs = await newCase();
      const normal = await newAsset(cs);
      const secret = await newAsset(cs, 'SENSITIVE');
      expect(await event(normal, U.thvA, 'DISCOVERY', 'list-1')).toMatchObject({ ok: true });
      const p = await proposal(normal);
      expect(
        await fn('as_record_order', U.admin, p, 'Cơ quan giả lập', 'LỆNH-L1', 'as/ol', sha('f')),
      ).toMatchObject({ ok: true });
      const list = async (who: string) => {
        const cl = await app.connect();
        try {
          await cl.query('BEGIN');
          await cl.query(`SELECT set_config('app.tenant_id', $1, true)`, [T]);
          const r = await cl.query(`SELECT * FROM as_list_assets($1,$2,$3)`, [T, who, cs]);
          await cl.query('COMMIT');
          return r.rows;
        } finally {
          cl.release();
        }
      };
      const rows = await list(U.thvA);
      expect(rows).toHaveLength(2);
      const n = rows.find((r) => r.id === normal);
      const s = rows.find((r) => r.id === secret);
      expect(n.label).toBe('Tài sản giả lập');
      expect(s.label).toBeNull();
      expect(n.events.map((e: { kind: string }) => e.kind)).toEqual([
        'DISCOVERY',
        'ORDER_RECORDED',
      ]);
      expect(n.proposals[0]).toMatchObject({
        status: 'APPLIED',
        agencyName: 'Cơ quan giả lập',
        orderRef: 'LỆNH-L1',
      });
      expect(JSON.stringify(rows)).not.toContain('as/ol');
      expect(await list(U.thvB)).toHaveLength(0);
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

    it('completes an N-08 transfer only with app approval, a separate legal decision and handover evidence', async () => {
      const cs = await newCase();
      expect(await fn('as_transfer_propose', U.thvA, cs, U.thvA)).toMatchObject({
        ok: false,
        code: 'INVALID_HANDLER',
      });
      expect(await fn('as_transfer_propose', U.clerk, cs, U.thvB)).toMatchObject({
        ok: false,
        code: 'ROLE_LACKS_PERMISSION',
      });
      expect(await fn('as_transfer_propose', U.thvB, cs, U.thvB)).toMatchObject({
        ok: false,
        code: 'NOT_ASSIGNED_HANDLER',
      });
      const t = (await fn('as_transfer_propose', U.thvA, cs, U.thvB)).label!;
      const step = (who: string, s: string, key = 'as/' + s, hash = sha('c')) =>
        fn('as_transfer_step', who, t, s, key, hash);
      const complete = (who = U.admin) => fn('as_transfer_complete', who, t);

      expect(await complete()).toMatchObject({ ok: false, code: 'APP_APPROVAL_MISSING' });
      expect(await step(U.thvA, 'APP_APPROVAL')).toMatchObject({
        ok: false,
        code: 'ADMIN_OR_HEAD_ONLY',
      });
      expect(await step(U.secretary, 'APP_APPROVAL')).toMatchObject({
        ok: false,
        code: 'ADMIN_OR_HEAD_ONLY',
      });
      expect(await step(U.headNoSign, 'APP_APPROVAL', 'x', 'bad')).toMatchObject({
        ok: false,
        code: 'INVALID_EVIDENCE',
      });
      expect(await step(U.headNoSign, 'BOGUS')).toMatchObject({ ok: false, code: 'INVALID_STEP' });
      expect(await step(U.headNoSign, 'APP_APPROVAL')).toMatchObject({ ok: true });
      expect(await step(U.headNoSign, 'APP_APPROVAL')).toMatchObject({
        ok: false,
        code: 'STEP_ALREADY_RECORDED',
      });
      // Duyệt trong ứng dụng không kéo theo quyền ký pháp lý.
      expect(await complete()).toMatchObject({ ok: false, code: 'LEGAL_DECISION_MISSING' });
      expect(await step(U.headNoSign, 'LEGAL_DECISION')).toMatchObject({
        ok: false,
        code: 'SIGNING_AUTHORITY_NOT_GRANTED',
      });
      expect(await step(U.head, 'LEGAL_DECISION')).toMatchObject({ ok: true });
      expect(await complete()).toMatchObject({ ok: false, code: 'HANDOVER_N08_MISSING' });
      expect(await step(U.thvA, 'HANDOVER_N08')).toMatchObject({
        ok: false,
        code: 'ROLE_LACKS_PERMISSION',
      });
      expect(await step(U.secretary, 'HANDOVER_N08')).toMatchObject({ ok: true });
      expect(await complete(U.thvA)).toMatchObject({ ok: false, code: 'ADMIN_OR_HEAD_ONLY' });
      expect(
        (await row(`SELECT handler_user_id FROM th_cases WHERE id = $1`, [cs])).handler_user_id,
      ).toBe(U.thvA);
      expect(await complete()).toMatchObject({ ok: true });
      expect(
        (await row(`SELECT handler_user_id FROM th_cases WHERE id = $1`, [cs])).handler_user_id,
      ).toBe(U.thvB);
      expect(await status('as_transfers', t)).toBe('COMPLETED');
      expect(await complete()).toMatchObject({ ok: false, code: 'TRANSFER_NOT_PENDING' });
      expect(await newAssetResult(cs, U.thvA)).toMatchObject({
        ok: false,
        code: 'NOT_ASSIGNED_HANDLER',
      });
      await expect(
        owner.query(`UPDATE as_transfer_steps SET actor_user_id = $1`, [U.admin]),
      ).rejects.toThrow();
    });

    const newAssetResult = (cs: string, who: string) =>
      fn('as_add_asset', who, cs, 'c', 'l', 'NORMAL', null, null);

    it('denies wrong roles, foreign links and other tenants', async () => {
      const cs = await newCase();
      const other = await newCase();
      const a = await newAsset(cs);
      expect(await fn('as_add_asset', U.thvB, cs, 'c', 'l', 'NORMAL', null, null)).toMatchObject({
        ok: false,
        code: 'NOT_ASSIGNED_HANDLER',
      });
      expect(await fn('as_add_asset', U.thvA, cs, 'c', 'l', 'SECRET', null, null)).toMatchObject({
        ok: false,
        code: 'INVALID_ASSET',
      });
      expect(await fn('as_add_asset', U.thvA, cs, 'c', 'l', 'NORMAL', id(), null)).toMatchObject({
        ok: false,
        code: 'LINK_NOT_FOUND',
      });
      const foreignParty = (await fn('th_add_party', U.thvA, other, 'X', 'PERSON', 'DEBTOR'))
        .label!;
      expect(
        await fn('as_add_asset', U.thvA, cs, 'c', 'l', 'NORMAL', null, foreignParty),
      ).toMatchObject({ ok: false, code: 'LINK_NOT_FOUND' });
      expect(await fn('as_propose_measure', U.secretary, a, 'm', 'r')).toMatchObject({
        ok: false,
        code: 'ROLE_LACKS_PERMISSION',
      });
      expect(await fn('as_propose_measure', U.thvA, a, ' ', 'r')).toMatchObject({
        ok: false,
        code: 'INVALID_PROPOSAL',
      });
      const otherTenant = (name: string, ...args: unknown[]) =>
        call(T2, `SELECT * FROM ${name}(${[T2, ...args].map((_, i) => `$${i + 1}`).join(',')})`, [
          T2,
          ...args,
        ]);
      expect(await otherTenant('as_access_asset', U.admin, a, 'x')).toMatchObject({
        ok: false,
        code: 'ASSET_NOT_FOUND',
      });
      expect(await otherTenant('as_transfer_propose', U.admin, cs, U.thvB)).toMatchObject({
        ok: false,
        code: 'CASE_NOT_FOUND',
      });
      const cl = await app.connect();
      try {
        await cl.query('BEGIN');
        await cl.query(`SELECT set_config('app.tenant_id', $1, true)`, [T2]);
        for (const v of ['as_assets', 'as_s05_book', 'as_proposals', 'as_transfers']) {
          expect((await cl.query(`SELECT count(*)::int AS n FROM ${v}`)).rows[0].n).toBe(0);
        }
        await cl.query('ROLLBACK');
      } finally {
        cl.release();
      }
      expect(
        (
          await row(
            `SELECT count(*)::int AS n FROM audit_log WHERE action LIKE 'as.%' AND outcome = 'deny'`,
            [],
          )
        ).n,
      ).toBeGreaterThanOrEqual(8);
    });
  },
);
