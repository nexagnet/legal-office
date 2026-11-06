import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS (0109): ô "Tài liệu khác" chung cho 4 nghiệp vụ. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmso_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const OTHER = 'Tài liệu khác';

describe.skipIf(!ADMIN_URL)('DMS ô Tài liệu khác (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  const U = { a: id(), noAdd: id() };

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
  const op = async (fn: string, args: unknown[]) => {
    const rows = await call(
      `SELECT (r).ok, (r).code, (r).label FROM (SELECT ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS r) q`,
      args,
    );
    return rows[0] as { ok: boolean; code: string; label: string | null };
  };
  const mkCase = async (u: string, domain: string) =>
    (await op('dms_case_create_draft', [T, u, OFF, domain, `Hồ sơ ${domain}`, '{}'])).label!;
  const ensure = (u: string, caseId: string) => op('dms_document_other_ensure', [T, u, caseId]);
  const docsOf = (caseId: string) =>
    call(`SELECT id, kind, status FROM dms_documents WHERE case_id = $1 ORDER BY created_at, id`, [
      caseId,
    ]);
  const bookRows = async (caseId: string) =>
    Number(
      (await call(`SELECT count(*) AS n FROM dms_book_entries WHERE case_id = $1`, [caseId]))[0].n,
    );

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
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [OFF, T]);
    for (const uid of [U.a, U.noAdd])
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        uid,
      ]);
    const domains = ['vibang', 'tongdat', 'xacminh', 'tochuc'];
    const group = async (name: string, perms: string[], user: string) => {
      const g = await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,$3) RETURNING id`,
        [T, OFF, name],
      );
      for (const p of perms)
        await owner.query(
          `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
          [T, g.rows[0].id, p],
        );
      await owner.query(
        `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
        [T, g.rows[0].id, user],
      );
    };
    await group(
      'THV',
      domains.flatMap((d) =>
        ['read', 'draft', 'confirm', 'add_document', 'download'].map((a) => `${d}.${a}.own`),
      ),
      U.a,
    );
    // Có quyền đọc và soạn nháp nhưng KHÔNG có quyền thêm tài liệu.
    await group(
      'Không thêm tài liệu',
      domains.flatMap((d) => ['read', 'draft'].map((a) => `${d}.${a}.own`)),
      U.noAdd,
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it.each(['vibang', 'tongdat', 'xacminh', 'tochuc'])(
    '%s: tạo ô Tài liệu khác ở bản nháp, gọi lại vẫn chỉ một tài liệu',
    async (domain) => {
      const c = await mkCase(U.a, domain);
      const first = await ensure(U.a, c);
      expect(first).toMatchObject({ ok: true });
      const again = await ensure(U.a, c);
      expect(again).toMatchObject({ ok: true, label: first.label });
      const docs = await docsOf(c);
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({ id: first.label, kind: OTHER, status: 'DRAFT' });
    },
  );

  it('hai lần gọi đồng thời vẫn ra một tài liệu', async () => {
    const c = await mkCase(U.a, 'vibang');
    const [x, y] = await Promise.all([ensure(U.a, c), ensure(U.a, c)]);
    expect(x.label).toBe(y.label);
    expect(await docsOf(c)).toHaveLength(1);
  });

  it('hồ sơ đã ghi sổ vẫn tạo được ô Tài liệu khác (chỉ thêm, không sửa)', async () => {
    const c = await mkCase(U.a, 'vibang');
    expect(await op('dms_case_record', [T, U.a, c])).toMatchObject({ ok: true });
    const made = await ensure(U.a, c);
    expect(made).toMatchObject({ ok: true });
    expect((await docsOf(c)).find((d) => d.id === made.label)).toMatchObject({
      kind: OTHER,
      status: 'RECORDED',
    });
  });

  it('tống đạt: Tài liệu khác không vào Sổ S-01, giấy tờ cần tống đạt vẫn vào', async () => {
    // Thêm khi còn nháp rồi ghi sổ.
    const c = await mkCase(U.a, 'tongdat');
    await ensure(U.a, c);
    await op('dms_document_add', [T, U.a, c, 'Quyết định THA', 'Giấy tờ 1', false, null]);
    expect(await op('dms_case_record', [T, U.a, c])).toMatchObject({ ok: true });
    expect(await bookRows(c)).toBe(1);
    // Thêm sau khi đã ghi sổ.
    const c2 = await mkCase(U.a, 'tongdat');
    await op('dms_document_add', [T, U.a, c2, 'Quyết định THA', 'Giấy tờ 1', false, null]);
    expect(await op('dms_case_record', [T, U.a, c2])).toMatchObject({ ok: true });
    expect(await bookRows(c2)).toBe(1);
    await ensure(U.a, c2);
    expect(await bookRows(c2)).toBe(1);
    await op('dms_document_add', [T, U.a, c2, 'Quyết định THA', 'Giấy tờ 2', false, null]);
    expect(await bookRows(c2)).toBe(2);
  });

  it('từ chối: không có quyền thêm tài liệu, hồ sơ đã hủy, hồ sơ không tồn tại', async () => {
    const c = await mkCase(U.noAdd, 'vibang');
    expect((await ensure(U.noAdd, c)).ok).toBe(false);
    expect(await docsOf(c)).toHaveLength(0);

    const cancelled = await mkCase(U.a, 'vibang');
    expect(await op('dms_case_cancel_draft', [T, U.a, cancelled, 'Nhập nhầm'])).toMatchObject({
      ok: true,
    });
    expect(await ensure(U.a, cancelled)).toMatchObject({ ok: false, code: 'CASE_CANCELLED' });

    expect((await ensure(U.a, randomUUID())).ok).toBe(false);
  });
});
