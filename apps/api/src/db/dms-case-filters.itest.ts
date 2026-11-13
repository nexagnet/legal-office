import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Bộ lọc mới của danh sách 4 nghiệp vụ (0119): Thừa hành viên, Việc còn dở, Đã trả kết quả.
// Bất biến cần giữ: (1) "Việc còn dở" khớp thẻ số dms_domain_pending_counts; (2) bộ lọc chỉ THU HẸP trong phạm vi xem
// (chi nhánh), không bao giờ mở rộng; (3) facet đếm kiểu "bỏ chính nhóm đó"; (4) tenant có chỉ mục cũ được dựng lại.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsf_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS bộ lọc THV, việc còn dở, đã trả (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  const B1 = id();
  const B2 = id();
  const U = { admin: id(), clerk: id(), thvA: id(), thvB: id() };
  const AT = '2026-03-10T05:00:00Z';
  const cases: Record<string, string> = {};

  const call = async (sql: string, args: unknown[]) => {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [T]);
      const res = await client.query(sql, args);
      await client.query('COMMIT');
      return res.rows;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  };
  const search = (
    u: string,
    domain: string,
    extra: object | null,
    status: string | null = 'RECORDED',
  ) =>
    call(
      `SELECT * FROM dms_search_cases($1,$2,$3,$4,$5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'newest',NULL,200,0,true,$6::jsonb)`,
      [T, u, OFF, domain, status, extra ? JSON.stringify(extra) : null],
    );
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();
  const facets = async (u: string, domain: string, extra: object | null) => {
    const rows = (await call(
      `SELECT * FROM dms_case_facet_counts($1,$2,$3,$4,'RECORDED',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,$5::jsonb)`,
      [T, u, OFF, domain, extra ? JSON.stringify(extra) : null],
    )) as { group_key: string; value: string; n: string }[];
    const by: Record<string, Record<string, number>> = {};
    for (const r of rows) (by[r.group_key] ??= {})[r.value] = Number(r.n);
    return by;
  };

  const addCase = async (
    key: string,
    domain: string,
    opts: {
      branch?: string;
      thv?: string | null;
      attrs?: object;
      docs?: { kind: string; attrs?: object }[];
    } = {},
  ) => {
    const cid = id();
    cases[key] = cid;
    await owner.query(
      `INSERT INTO dms_case_files (id, tenant_id, office_id, domain, title, attributes, status, created_by, created_at,
                                   recorded_by, recorded_at, branch_id, thv_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,'RECORDED',$7,$8,$7,$8,$9,$10)`,
      [
        cid,
        T,
        OFF,
        domain,
        `Hồ sơ ${key}`,
        JSON.stringify(opts.attrs ?? {}),
        U.admin,
        AT,
        opts.branch ?? B1,
        opts.thv ?? null,
      ],
    );
    for (const d of opts.docs ?? [])
      await owner.query(
        `INSERT INTO dms_documents (id, tenant_id, case_id, kind, title, status, created_by, attributes)
         VALUES ($1,$2,$3,$4,'Tài liệu','RECORDED',$5,$6)`,
        [id(), T, cid, d.kind, U.admin, JSON.stringify(d.attrs ?? {})],
      );
  };

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

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A')`, [T]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP')`, [OFF, T]);
    for (const [b, n] of [
      [B1, 'CN1'],
      [B2, 'CN2'],
    ] as const)
      await owner.query(
        `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,$4)`,
        [b, T, OFF, n],
      );
    for (const [k, u] of Object.entries(U)) {
      await owner.query(
        `INSERT INTO users (id, tenant_id, external_ref, full_name) VALUES ($1,$2,$3,$4)`,
        [u, T, `${k}@x.invalid`, `Người ${k}`],
      );
      await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4)`,
        [T, u, OFF, k === 'admin' ? 'ADMIN' : 'THANH_VIEN'],
      );
    }
    // Văn thư chỉ có chi nhánh CN1, đọc được mọi hồ sơ của nghiệp vụ trong phạm vi đó.
    const g = await owner.query(
      `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'Xem') RETURNING id`,
      [T, OFF],
    );
    for (const d of ['vibang', 'tongdat', 'xacminh', 'tochuc'])
      await owner.query(
        `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
        [T, g.rows[0].id, `${d}.read.all`],
      );
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, g.rows[0].id, U.clerk],
    );
    await owner.query(
      `INSERT INTO dms_branch_access (tenant_id, office_id, user_id, branch_id, granted_by, grant_reason) VALUES ($1,$2,$3,$4,$5,'t')`,
      [T, OFF, U.clerk, B1, U.admin],
    );

    // Vi bằng: THV A (CN1), THV A (CN2), THV B (CN1), chưa chọn THV (CN1).
    await addCase('vb_a1', 'vibang', {
      thv: U.thvA,
      attrs: { dia_chi_noi_lap: '12 Lê Duẩn, Phường Cửa Nam, Hà Nội' },
    });
    await addCase('vb_a2', 'vibang', {
      thv: U.thvA,
      branch: B2,
      attrs: { dia_chi_noi_lap: ' TP Hồ Chí Minh ' },
    });
    await addCase('vb_b1', 'vibang', { thv: U.thvB });
    await addCase('vb_none', 'vibang');
    // Tống đạt (một hồ sơ một văn bản): chưa có / đã có ngày tống đạt ở thuộc tính hồ sơ.
    await addCase('td_open', 'tongdat', {
      attrs: { hinh_thuc_tong_dat: 'Niêm yết', co_quan_thads: 'x' },
    });
    await addCase('td_done', 'tongdat', {
      attrs: {
        ngay_tong_dat: '02/03/2026',
        hinh_thuc_tong_dat: 'Trực tiếp',
        co_quan_toa_an: 'x',
      },
    });
    await addCase('td_open_b2', 'tongdat', { branch: B2 });
    // Xác minh: chưa có / đã có kết quả.
    await addCase('xm_open', 'xacminh', {});
    await addCase('xm_done', 'xacminh', { attrs: { ket_qua_xac_minh: 'Có tài sản' } });
    // Tổ chức: chưa / đã có biên bản N-08 (không phân biệt hoa thường).
    await addCase('tc_open', 'tochuc', { docs: [{ kind: 'Quyết định' }] });
    await addCase('tc_done', 'tochuc', { docs: [{ kind: 'biên bản n-08' }] });
    // Đã trả kết quả: vb_a1 và vb_b1.
    for (const k of ['vb_a1', 'vb_b1'])
      await owner.query(
        `INSERT INTO dms_case_returned (tenant_id, case_id, returned, changed_by) VALUES ($1,$2,true,$3)`,
        [T, cases[k], U.admin],
      );
  }, 120_000);

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const want = (...keys: string[]) => keys.map((k) => cases[k]!).sort();

  it('lọc Thừa hành viên: một người, nhiều người', async () => {
    expect(ids(await search(U.admin, 'vibang', { thv: [U.thvA] }))).toEqual(want('vb_a1', 'vb_a2'));
    expect(ids(await search(U.admin, 'vibang', { thv: [U.thvA, U.thvB] }))).toEqual(
      want('vb_a1', 'vb_a2', 'vb_b1'),
    );
    expect(ids(await search(U.admin, 'vibang', null))).toHaveLength(4);
  });

  it('lọc Đã trả kết quả, cả hai chiều, và dựng lại chỉ mục khi đổi ô', async () => {
    expect(ids(await search(U.admin, 'vibang', { returned: true }))).toEqual(
      want('vb_a1', 'vb_b1'),
    );
    expect(ids(await search(U.admin, 'vibang', { returned: false }))).toEqual(
      want('vb_a2', 'vb_none'),
    );
    await owner.query(`UPDATE dms_case_returned SET returned = false WHERE case_id = $1`, [
      cases.vb_a1,
    ]);
    expect(ids(await search(U.admin, 'vibang', { returned: true }))).toEqual(want('vb_b1'));
    await owner.query(`UPDATE dms_case_returned SET returned = true WHERE case_id = $1`, [
      cases.vb_a1,
    ]);
  });

  it('Bộ lọc nghiệp vụ fa/fb: hình thức và cơ quan giao (Tống đạt), tỉnh/thành (Vi bằng), kết quả (Xác minh)', async () => {
    expect(ids(await search(U.admin, 'tongdat', { fa: 'Trực tiếp' }))).toEqual(want('td_done'));
    expect(ids(await search(U.admin, 'tongdat', { fb: 'Cơ quan THADS' }))).toEqual(want('td_open'));
    expect(ids(await search(U.admin, 'tongdat', { fa: 'Niêm yết', fb: 'Tòa án' }))).toEqual([]);
    expect(ids(await search(U.admin, 'vibang', { fa: 'Hà Nội' }))).toEqual(want('vb_a1'));
    expect(ids(await search(U.admin, 'vibang', { fa: 'TP Hồ Chí Minh' }))).toEqual(want('vb_a2'));
    expect(ids(await search(U.admin, 'xacminh', { fa: 'Có tài sản' }))).toEqual(want('xm_done'));
    // Đếm facet theo kiểu "chọn giá trị khác trong cùng nhóm": đang chọn fa vẫn thấy mọi giá trị fa, fb bị thu hẹp.
    const f = await facets(U.admin, 'tongdat', { fa: 'Trực tiếp' });
    expect(f.fa).toEqual({ 'Trực tiếp': 1, 'Niêm yết': 1 });
    expect(f.fb).toEqual({ 'Tòa án': 1 });
    // Hồ sơ không có giá trị thì không vào nhóm; nghiệp vụ không dùng facet_b không có nhóm fb.
    expect((await facets(U.admin, 'xacminh', null)).fb).toBeUndefined();
  });

  it('Quá hạn báo kết quả tống đạt: 2 ngày làm việc từ Ngày tống đạt, hết hạn khi đã trả KQ; chỉ Tống đạt có hạn', async () => {
    // td_done: tống đạt 02/03/2026 (thứ Hai) => hạn hết 04/03/2026 23:59:59 giờ Việt Nam.
    const due = (await owner.query(`SELECT due_at FROM dms_case_index WHERE case_id = $1`, [
      cases.td_done,
    ])) as { rows: { due_at: Date }[] };
    expect(due.rows[0]!.due_at.toISOString()).toBe('2026-03-04T16:59:59.000Z');
    expect(ids(await search(U.admin, 'tongdat', { overdue: true }))).toEqual(want('td_done'));
    expect(ids(await search(U.admin, 'tongdat', { overdue: false }))).toEqual(
      want('td_open', 'td_open_b2'),
    );
    expect((await facets(U.admin, 'tongdat', null)).overdue).toEqual({ true: 1 });
    expect((await facets(U.admin, 'vibang', null)).overdue).toBeUndefined();
    expect(ids(await search(U.admin, 'vibang', { overdue: true }))).toEqual([]);
    // Đã trả kết quả thì hết quá hạn (chỉ mục tự dựng lại khi đổi ô).
    await owner.query(
      `INSERT INTO dms_case_returned (tenant_id, case_id, returned, changed_by) VALUES ($1,$2,true,$3)`,
      [T, cases.td_done, U.admin],
    );
    expect(ids(await search(U.admin, 'tongdat', { overdue: true }))).toEqual([]);
    expect((await facets(U.admin, 'tongdat', null)).overdue).toBeUndefined();
    await owner.query(`UPDATE dms_case_returned SET returned = false WHERE case_id = $1`, [
      cases.td_done,
    ]);
    expect(ids(await search(U.admin, 'tongdat', { overdue: true }))).toEqual(want('td_done'));
  });

  it('dms_parse_vn_date: chỉ nhận dd/mm/yyyy có thật, còn lại là NULL (không báo lỗi)', async () => {
    const r = await owner.query(
      `SELECT dms_parse_vn_date('02/03/2026')::text a, dms_parse_vn_date(' 2/3/2026 ')::text b,
              dms_parse_vn_date('31/02/2026') c, dms_parse_vn_date('2026-03-02') d, dms_parse_vn_date(NULL) e, dms_parse_vn_date('abc') f`,
    );
    expect(r.rows[0]).toEqual({
      a: '2026-03-02',
      b: '2026-03-02',
      c: null,
      d: null,
      e: null,
      f: null,
    });
  });

  it('Việc còn dở theo luật từng nghiệp vụ', async () => {
    expect(ids(await search(U.admin, 'tongdat', { open: true }))).toEqual(
      want('td_open', 'td_open_b2'),
    );
    expect(ids(await search(U.admin, 'tongdat', { open: false }))).toEqual(want('td_done'));
    expect(ids(await search(U.admin, 'xacminh', { open: true }))).toEqual(want('xm_open'));
    expect(ids(await search(U.admin, 'tochuc', { open: true }))).toEqual(want('tc_open'));
    expect(ids(await search(U.admin, 'tochuc', { open: false }))).toEqual(want('tc_done'));
    expect(ids(await search(U.admin, 'vibang', { open: true }))).toEqual([]);
  });

  it('Việc còn dở khớp thẻ số dms_domain_pending_counts (đều đếm theo hồ sơ)', async () => {
    const counts = Object.fromEntries(
      (await call('SELECT * FROM dms_domain_pending_counts($1,$2,$3,2026)', [T, U.admin, OFF])).map(
        (r: { domain: string; pending: number }) => [r.domain, Number(r.pending)],
      ),
    );
    for (const d of ['tongdat', 'xacminh', 'tochuc'])
      expect((await search(U.admin, d, { open: true })).length, d).toBe(counts[d]);
    // Tống đạt: thẻ số và bộ lọc cùng đếm hồ sơ chưa có ngày tống đạt.
    expect(counts.tongdat).toBe(2);
    expect((await search(U.admin, 'tongdat', { open: true })).length).toBe(2);
  });

  it('bộ lọc chỉ thu hẹp trong phạm vi chi nhánh, không mở rộng', async () => {
    // Văn thư chỉ thấy CN1: THV A có 2 hồ sơ (CN1 và CN2) nhưng văn thư chỉ nhận 1.
    expect(ids(await search(U.clerk, 'vibang', { thv: [U.thvA] }))).toEqual(want('vb_a1'));
    expect(ids(await search(U.clerk, 'tongdat', { open: true }))).toEqual(want('td_open'));
    const f = await facets(U.clerk, 'vibang', null);
    expect(f.thv?.[U.thvA]).toBe(1);
    expect(f.thv?.[U.thvB]).toBe(1);
  });

  it('facet đếm bỏ chính nhóm đó: chọn THV A vẫn thấy số của THV B', async () => {
    const f = await facets(U.admin, 'vibang', { thv: [U.thvA] });
    expect(f.thv?.[U.thvA]).toBe(2);
    expect(f.thv?.[U.thvB]).toBe(1);
    // Nhóm khác thì bị thu hẹp theo THV A: chỉ vb_a1 đã trả.
    expect(f.returned?.true).toBe(1);
    expect(f.returned?.false).toBe(1);
  });

  it('chỉ mục phiên bản cũ được dựng lại ở lần tìm kiếm đầu tiên', async () => {
    await owner.query(
      `UPDATE dms_case_index SET thv_user_id = NULL, open_flag = false, returned = false WHERE tenant_id = $1`,
      [T],
    );
    await owner.query(`UPDATE dms_index_state SET version = 1 WHERE tenant_id = $1`, [T]);
    expect(ids(await search(U.admin, 'vibang', { thv: [U.thvA] }))).toEqual(want('vb_a1', 'vb_a2'));
    expect(ids(await search(U.admin, 'xacminh', { open: true }))).toEqual(want('xm_open'));
    expect(ids(await search(U.admin, 'vibang', { returned: true }))).toEqual(
      want('vb_a1', 'vb_b1'),
    );
  });

  it('không có tham số mới thì kết quả như cũ', async () => {
    expect((await search(U.admin, 'vibang', null)).length).toBe(4);
    expect((await search(U.admin, 'vibang', {})).length).toBe(4);
  });
});
