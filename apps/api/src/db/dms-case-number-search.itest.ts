import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Tìm theo SỐ HỒ SƠ (0123): trước đây search_text không chứa case_number nên gõ "038/2026/VB-TPL" không ra gì.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
// DROP DATABASE ... WITH (FORCE) ở afterAll cắt kết nối còn mở; pool phát lỗi 57P01 mà không ai bắt
// thì vitest báo "Unhandled Errors" dù mọi test đều qua.
const ignorePoolError = () => {};
const DB = `lo_dmsn_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS tìm theo số hồ sơ (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  const B1 = id();
  const ADMIN = id();
  const cases: Record<string, string> = {};

  const search = async (domain: string, q: string) => {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [T]);
      const res = await client.query(
        `SELECT id FROM dms_search_cases($1,$2,$3,$4,'RECORDED',$5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'newest',NULL,200,0,true)`,
        [T, ADMIN, OFF, domain, q],
      );
      await client.query('COMMIT');
      return res.rows.map((r: { id: string }) => r.id).sort();
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  };
  const one = (...keys: string[]) => keys.map((k) => cases[k]).sort();

  const addCase = async (key: string, domain: string, caseNumber: string | null) => {
    const cid = id();
    cases[key] = cid;
    await owner.query(
      `INSERT INTO dms_case_files (id, tenant_id, office_id, domain, title, attributes, status, created_by, created_at,
                                   recorded_by, recorded_at, branch_id, case_number)
       VALUES ($1,$2,$3,$4,$5,'{}','RECORDED',$6,'2026-03-10T05:00:00Z',$6,'2026-03-10T05:00:00Z',$7,$8)`,
      [cid, T, OFF, domain, `Hồ sơ ${key}`, ADMIN, B1, caseNumber],
    );
  };

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${DB}`);
    await admin.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legal_app') THEN CREATE ROLE legal_app LOGIN; END IF; END $$`,
    );
    owner = new pg.Pool({ connectionString: withDb(ADMIN_URL!, DB), max: 2 });
    owner.on('error', ignorePoolError);
    await owner.query(MIGRATION);
    await owner.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO legal_app');
    await owner.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO legal_app');
    const appUrl = new URL(withDb(ADMIN_URL!, DB));
    appUrl.username = 'legal_app';
    appUrl.password = '';
    app = new pg.Pool({ connectionString: appUrl.toString(), max: 4 });
    app.on('error', ignorePoolError);

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A')`, [T]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP')`, [OFF, T]);
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN1')`,
      [B1, T, OFF],
    );
    await owner.query(
      `INSERT INTO users (id, tenant_id, external_ref, full_name) VALUES ($1,$2,'admin@x.invalid','Admin')`,
      [ADMIN, T],
    );
    await owner.query(
      `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,'ADMIN')`,
      [T, ADMIN, OFF],
    );
    await addCase('vb_tpl', 'vibang', '038/2026/VB-TPL');
    await addCase('vb_thv', 'vibang', '138/2026/VB-THV');
    await addCase('vb_other', 'vibang', '007/2026/VB-THV');
    await addCase('vb_nonum', 'vibang', null);
    await addCase('td', 'tongdat', '038/2026/TĐ-TPL');
    await addCase('xm', 'xacminh', '012/2026/XM-TPL');
    await addCase('tc', 'tochuc', '007/2026/TC-TPL');
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await admin.end();
  });

  it('tìm được theo số đầy đủ, không phân biệt hoa thường', async () => {
    expect(await search('vibang', '038/2026/VB-TPL')).toEqual(one('vb_tpl'));
    expect(await search('vibang', '038/2026/vb-tpl')).toEqual(one('vb_tpl'));
    expect(await search('vibang', '138/2026/VB-THV')).toEqual(one('vb_thv'));
    expect(await search('tongdat', '038/2026/TĐ-TPL')).toEqual(one('td'));
    expect(await search('tongdat', '038/2026/td-tpl')).toEqual(one('td'));
    expect(await search('xacminh', '012/2026/XM-TPL')).toEqual(one('xm'));
    expect(await search('tochuc', '007/2026/tc-tpl')).toEqual(one('tc'));
  });

  it('tìm được theo số rút gọn (038/2026, 038, 38) và theo ký hiệu', async () => {
    expect(await search('vibang', '038/2026')).toEqual(one('vb_tpl'));
    expect(await search('vibang', '038')).toEqual(one('vb_tpl'));
    expect(await search('vibang', '38')).toEqual(one('vb_tpl', 'vb_thv'));
    expect(await search('vibang', 'vb-thv')).toEqual(one('vb_thv', 'vb_other'));
    expect(await search('vibang', '999/2026')).toEqual([]);
  });

  it('số hồ sơ cấp sau khi tạo (ghi sổ) cũng được lập chỉ mục', async () => {
    const cid = id();
    await owner.query(
      `INSERT INTO dms_case_files (id, tenant_id, office_id, domain, title, attributes, status, created_by, branch_id)
       VALUES ($1,$2,$3,'vibang','Hồ sơ nháp','{}','DRAFT',$4,$5)`,
      [cid, T, OFF, ADMIN, B1],
    );
    expect(await search('vibang', '555/2026')).toEqual([]);
    await owner.query(
      `UPDATE dms_case_files SET status='RECORDED', recorded_by=$2, recorded_at=now(), case_number='555/2026/VB-THV' WHERE id=$1`,
      [cid, ADMIN],
    );
    expect(await search('vibang', '555/2026/VB-THV')).toEqual([cid]);
  });
});
