import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsc_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS lọc theo cột (0130, PostgreSQL)', () => {
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
      attrs: {
        dia_chi_noi_lap: '12 Lê Duẩn, Phường Cửa Nam, Hà Nội',
        nguoi_yeu_cau: 'Nguyễn Văn Ánh',
        so_ngay_vi_bang: '001 ngày 05/03/2026',
      },
    });
    await addCase('vb_a2', 'vibang', {
      thv: U.thvA,
      branch: B2,
      attrs: {
        dia_chi_noi_lap: ' TP Hồ Chí Minh ',
        nguoi_yeu_cau: 'Trần Thị Bình',
        so_ngay_vi_bang: '002 ngày 20/04/2026',
      },
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

  const cols = (c: object, domain = 'vibang', u = U.admin) => search(u, domain, { cols: c });
  const col = async (key: string, extra: object | null, term: string | null = null) =>
    (await call(
      `SELECT * FROM dms_col_values($1,$2,$3,'vibang','RECORDED',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,$4::jsonb,$5,$6)`,
      [T, U.admin, OFF, extra ? JSON.stringify(extra) : null, key, term],
    )) as { value: string; n: string }[];

  it('chữ chứa: không phân biệt hoa thường và dấu', async () => {
    expect(ids(await cols({ nguoi_yeu_cau: { c: 'nguyen van anh' } }))).toEqual(want('vb_a1'));
    expect(ids(await cols({ nguoi_yeu_cau: { c: 'BÌNH' } }))).toEqual(want('vb_a2'));
    expect(ids(await cols({ nguoi_yeu_cau: { c: 'khong co' } }))).toEqual([]);
  });

  it('khoảng ngày theo ngày đầu tiên trong ô', async () => {
    expect(ids(await cols({ so_ngay_vi_bang: { d: { from: '2026-04-01' } } }))).toEqual(
      want('vb_a2'),
    );
    expect(ids(await cols({ so_ngay_vi_bang: { d: { to: '2026-03-31' } } }))).toEqual(
      want('vb_a1'),
    );
  });

  it('có/không và chọn nhiều', async () => {
    expect(ids(await cols({ nguoi_yeu_cau: { b: true } }))).toEqual(want('vb_a1', 'vb_a2'));
    expect(ids(await cols({ nguoi_yeu_cau: { b: false } }))).toEqual(want('vb_b1', 'vb_none'));
    expect(ids(await cols({ nguoi_yeu_cau: { in: ['Trần Thị Bình'] } }))).toEqual(want('vb_a2'));
  });

  it('kết hợp nhiều cột là AND; khóa lạ không làm hỏng và không lộ dữ liệu', async () => {
    expect(ids(await cols({ nguoi_yeu_cau: { b: true }, so_ngay_vi_bang: { c: '002' } }))).toEqual(
      want('vb_a2'),
    );
    expect(ids(await cols({ khong_co_cot_nay: { c: 'x' } }))).toEqual([]);
    expect(ids(await cols({ "a'; DROP TABLE tenants;--": { c: 'x' } }))).toHaveLength(4);
  });

  it('chỉ thu hẹp trong phạm vi xem: Văn thư chỉ có CN1 không thấy hồ sơ CN2', async () => {
    expect(ids(await cols({ nguoi_yeu_cau: { b: true } }, 'vibang', U.clerk))).toEqual(
      want('vb_a1'),
    );
  });

  it('dms_col_values: đếm giá trị, bỏ chính cột đó khi tính', async () => {
    const all = await col('nguoi_yeu_cau', null);
    expect(all.map((r) => r.value).sort()).toEqual(['Nguyễn Văn Ánh', 'Trần Thị Bình']);
    const filtered = await col('nguoi_yeu_cau', { cols: { nguoi_yeu_cau: { c: 'binh' } } });
    expect(filtered).toHaveLength(2);
    expect(await col('nguoi_yeu_cau', null, 'binh')).toHaveLength(1);
    await expect(col('a b', null)).rejects.toThrow();
  });
});
