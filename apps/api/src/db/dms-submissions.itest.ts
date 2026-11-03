import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DMS GĐ 1 (0104): Trình / Duyệt chung. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmst_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('DMS Trình / Duyệt (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF_B = id();
  const OFF2 = id();
  const U = { admin: id(), thv: id(), ketoan: id(), outsider: id(), foreign: id(), adminB: id() };
  let keySeq = 0;

  const call = async (tenant: string, sql: string, args: unknown[]) => {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
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
  const op = async (tenant: string, fn: string, args: unknown[]) => {
    const rows = await call(
      tenant,
      `SELECT (r).ok, (r).code, (r).label FROM (SELECT ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS r) q`,
      args,
    );
    return rows[0] as { ok: boolean; code: string; label: string | null };
  };
  /** Tải một tệp lên bước đệm và trả id bước đệm. */
  const stage = async (u: string, tenant: string = T) => {
    keySeq += 1;
    const sha = String(keySeq % 10).repeat(64);
    const r = await op(tenant, 'dms_stage_upload', [
      tenant,
      u,
      `submissions/${tenant}/${randomUUID()}.pdf`,
      sha,
      'application/pdf',
      1234,
    ]);
    expect(r.ok).toBe(true);
    return r.label!;
  };
  const submit = async (
    u: string,
    opts: {
      title?: string;
      description?: string;
      caseId?: string | null;
      office?: string;
      staged?: string[];
      labels?: string[];
      tenant?: string;
    } = {},
  ) => {
    const staged = opts.staged ?? [await stage(u, opts.tenant ?? T)];
    return op(opts.tenant ?? T, 'dms_submission_create', [
      opts.tenant ?? T,
      u,
      opts.office ?? OFF,
      opts.title ?? 'Công văn gửi Sở Tư pháp',
      opts.description ?? 'Bản trình kèm công văn',
      opts.caseId ?? null,
      staged,
      opts.labels ?? staged.map((_, i) => `scan-${i + 1}.pdf`),
    ]);
  };
  const decide = (u: string, sub: string, approve: boolean | null, note: string | null = null) =>
    op(T, 'dms_submission_decide', [T, u, sub, approve, note]);
  const list = (u: string, q: string | null = null, status: string | null = null, office = OFF) =>
    call(T, 'SELECT * FROM dms_submission_list($1,$2,$3,$4,$5,50,0)', [T, u, office, status, q]);
  const get = (u: string, sub: string) =>
    call(T, 'SELECT * FROM dms_submission_get($1,$2,$3)', [T, u, sub]);
  const files = (u: string, sub: string) =>
    call(T, 'SELECT * FROM dms_submission_files_list($1,$2,$3)', [T, u, sub]);
  const count = async () =>
    Number((await call(T, 'SELECT count(*) AS n FROM dms_submissions', []))[0].n);

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
      `INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A'),($3,$2,'VP A2'),($4,$5,'VP B')`,
      [OFF, T, OFF_B, OFF2, T2],
    );
    for (const [uid, tenant] of [
      [U.admin, T],
      [U.thv, T],
      [U.ketoan, T],
      [U.outsider, T],
      [U.adminB, T],
      [U.foreign, T2],
    ]) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        tenant,
        uid,
      ]);
    }
    const member = (tenant: string, user: string, office: string, role: string) =>
      owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4)`,
        [tenant, user, office, role],
      );
    await member(T, U.admin, OFF, 'ADMIN');
    await member(T, U.thv, OFF, 'THV');
    await member(T, U.ketoan, OFF, 'KE_TOAN');
    await member(T, U.adminB, OFF_B, 'ADMIN');
    await member(T2, U.foreign, OFF2, 'ADMIN');
    // U.outsider cùng tenant nhưng không thuộc văn phòng nào.
    const g = await owner.query(
      `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'THV tạo') RETURNING id`,
      [T, OFF],
    );
    for (const p of ['vibang.read.own', 'vibang.draft.own', 'vibang.confirm.own'])
      await owner.query(
        `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
        [T, g.rows[0].id, p],
      );
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, g.rows[0].id, U.thv],
    );
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('mọi thành viên văn phòng trình được; người ngoài văn phòng hoặc ngoài tenant thì không', async () => {
    for (const u of [U.thv, U.ketoan, U.admin]) {
      const r = await submit(u);
      expect(r.code).toBe('SUBMISSION_CREATED');
      expect(r.label).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect((await submit(U.outsider)).code).toBe('PERMISSION_DENIED');
    expect((await submit(U.thv, { office: OFF_B })).code).toBe('PERMISSION_DENIED');
    const foreign = await op(T, 'dms_submission_create', [
      T,
      U.foreign,
      OFF,
      'x',
      '',
      null,
      [],
      [],
    ]);
    expect(foreign.code).toBe('PERMISSION_DENIED');
  });

  it('đầu vào: tiêu đề bắt buộc, cần ít nhất một scan, nhãn khớp số tệp; lỗi không để lại bản trình', async () => {
    const before = await count();
    expect((await submit(U.thv, { title: '   ' })).code).toBe('INVALID_INPUT');
    expect((await submit(U.thv, { title: 'x'.repeat(301) })).code).toBe('INVALID_INPUT');
    expect((await submit(U.thv, { staged: [], labels: [] })).code).toBe('INVALID_INPUT');
    const s1 = await stage(U.thv);
    expect((await submit(U.thv, { staged: [s1], labels: [] })).code).toBe('INVALID_INPUT');
    expect((await submit(U.thv, { staged: [s1, s1], labels: ['a', 'b'] })).code).toBe(
      'INVALID_INPUT',
    );
    expect((await submit(U.thv, { staged: [s1], labels: ['  '] })).code).toBe('INVALID_INPUT');
    expect(await count()).toBe(before);
    // Tệp đệm chưa bị dùng sau các lần lỗi nên vẫn dùng được.
    expect((await submit(U.thv, { staged: [s1], labels: ['ok.pdf'] })).ok).toBe(true);
  });

  it('tệp đệm: chỉ của chính người trình, dùng một lần; lỗi hoàn tác cả bản trình', async () => {
    const before = await count();
    const mine = await stage(U.thv);
    const other = await stage(U.ketoan);
    expect((await submit(U.thv, { staged: [other], labels: ['x.pdf'] })).code).toBe(
      'UPLOAD_NOT_FOUND',
    );
    expect((await submit(U.thv, { staged: [mine, randomUUID()], labels: ['a', 'b'] })).code).toBe(
      'UPLOAD_NOT_FOUND',
    );
    expect(await count()).toBe(before);
    expect((await submit(U.thv, { staged: [mine], labels: ['x.pdf'] })).ok).toBe(true);
    expect((await submit(U.thv, { staged: [mine], labels: ['x.pdf'] })).code).toBe(
      'UPLOAD_ALREADY_USED',
    );
    expect(await count()).toBe(before + 1);
  });

  it('hồ sơ liên quan tuỳ chọn: phải thấy được và cùng văn phòng', async () => {
    const mk = async (domain: string, u: string, office: string) =>
      (await op(T, 'dms_case_create_draft', [T, u, office, domain, 'Hồ sơ gắn', '{}'])).label!;
    // Cấp quyền tạo ở OFF_B cho thv để có hồ sơ khác văn phòng.
    const gb = await owner.query(
      `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'THV B') RETURNING id`,
      [T, OFF_B],
    );
    for (const p of ['vibang.read.own', 'vibang.draft.own'])
      await owner.query(
        `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
        [T, gb.rows[0].id, p],
      );
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, gb.rows[0].id, U.thv],
    );
    await owner.query(
      `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,'THV')`,
      [T, U.thv, OFF_B],
    );
    const mine = await mk('vibang', U.thv, OFF);
    const elsewhere = await mk('vibang', U.thv, OFF_B);
    const r = await submit(U.thv, { caseId: mine, title: 'Có hồ sơ liên quan' });
    expect(r.ok).toBe(true);
    const detail = (await get(U.thv, r.label!))[0];
    expect(detail.case_id).toBe(mine);
    expect(detail.case_title).toBe('Hồ sơ gắn');
    // Hồ sơ nháp của người khác không thấy được: không lộ sự tồn tại.
    expect((await submit(U.ketoan, { caseId: mine })).code).toBe('CASE_NOT_FOUND');
    // Hồ sơ ở văn phòng khác không gắn được.
    expect((await submit(U.thv, { caseId: elsewhere })).code).toBe('CASE_NOT_FOUND');
    expect((await submit(U.thv, { caseId: randomUUID() })).code).toBe('CASE_NOT_FOUND');
  });

  it('thấy gì: người trình thấy bản của mình, Admin thấy cả văn phòng, người khác và tenant khác không thấy', async () => {
    const t = await submit(U.thv, { title: 'Bản của THV' });
    const k = await submit(U.ketoan, { title: 'Bản của kế toán' });
    const mine = (await list(U.thv)).map((r) => r.id);
    expect(mine).toContain(t.label);
    expect(mine).not.toContain(k.label);
    const all = (await list(U.admin)).map((r) => r.id);
    expect(all).toContain(t.label);
    expect(all).toContain(k.label);
    expect(await list(U.outsider)).toEqual([]);
    expect(await list(U.adminB, null, null, OFF)).toEqual([]);
    expect(await get(U.ketoan, t.label!)).toEqual([]);
    expect(await get(U.outsider, t.label!)).toEqual([]);
    expect(await get(U.adminB, t.label!)).toEqual([]);
    expect(await files(U.ketoan, t.label!)).toEqual([]);
    expect((await get(U.admin, t.label!))[0]).toMatchObject({
      title: 'Bản của THV',
      file_count: 1,
    });
    expect((await files(U.thv, t.label!)).length).toBe(1);
    const foreignRows = await call(
      T2,
      'SELECT * FROM dms_submission_list($1,$2,$3,NULL,NULL,50,0)',
      [T2, U.foreign, OFF2],
    );
    expect(foreignRows).toEqual([]);
  });

  it('tìm không dấu theo tiêu đề và mô tả; ký tự % và _ được coi là chữ thường; lọc trạng thái; có tổng', async () => {
    const a = await submit(U.thv, {
      title: 'Báo cáo quý Ba',
      description: 'Gồm số liệu Vi bằng',
    });
    await submit(U.thv, { title: 'Tờ trình khác', description: 'Giảm 50% phí' });
    await submit(U.thv, { title: 'Mã A_B', description: '' });
    const byTitle = await list(U.admin, 'bao cao quy ba');
    expect(byTitle.map((r) => r.id)).toEqual([a.label]);
    expect(byTitle[0].total).toBe('1');
    expect((await list(U.admin, 'SO LIEU VI BANG')).map((r) => r.id)).toEqual([a.label]);
    expect((await list(U.admin, '50%')).length).toBe(1);
    expect((await list(U.admin, 'A_B')).length).toBe(1);
    expect((await list(U.admin, 'AxB')).length).toBe(0);
    expect((await list(U.admin, '%')).length).toBe(1);
    expect((await list(U.admin, 'khong co gi')).length).toBe(0);
    // Người trình chỉ tìm trong bản của mình.
    expect((await list(U.ketoan, 'bao cao quy ba')).length).toBe(0);
    expect((await list(U.admin, 'bao cao', 'PENDING')).length).toBe(1);
    expect((await list(U.admin, 'bao cao', 'APPROVED')).length).toBe(0);
  });

  it('tải thêm scan: chỉ người trình và chỉ khi chờ duyệt', async () => {
    const s = (await submit(U.thv, { title: 'Tải thêm' })).label!;
    const extra = await stage(U.thv);
    expect(
      (await op(T, 'dms_submission_add_files', [T, U.ketoan, s, [extra], ['x.pdf']])).code,
    ).toBe('SUBMISSION_NOT_FOUND');
    // Admin thấy bản trình nhưng không phải người trình nên không tự thêm scan hộ.
    const adminStage = await stage(U.admin);
    expect(
      (await op(T, 'dms_submission_add_files', [T, U.admin, s, [adminStage], ['y.pdf']])).code,
    ).toBe('PERMISSION_DENIED');
    expect((await op(T, 'dms_submission_add_files', [T, U.thv, s, [extra], ['x.pdf']])).ok).toBe(
      true,
    );
    expect((await files(U.thv, s)).length).toBe(2);
    expect((await op(T, 'dms_submission_add_files', [T, U.thv, s, [extra], ['x.pdf']])).code).toBe(
      'UPLOAD_ALREADY_USED',
    );
    expect((await decide(U.admin, s, true)).ok).toBe(true);
    const late = await stage(U.thv);
    expect((await op(T, 'dms_submission_add_files', [T, U.thv, s, [late], ['z.pdf']])).code).toBe(
      'SUBMISSION_NOT_PENDING',
    );
    expect((await files(U.thv, s)).length).toBe(2);
  });

  it('chỉ Admin duyệt; từ chối cần lý do; quyết định là cuối cùng', async () => {
    const s = (await submit(U.thv, { title: 'Chờ duyệt' })).label!;
    expect((await decide(U.thv, s, true)).code).toBe('PERMISSION_DENIED');
    expect((await decide(U.ketoan, s, true)).code).toBe('SUBMISSION_NOT_FOUND');
    expect((await decide(U.adminB, s, true)).code).toBe('SUBMISSION_NOT_FOUND');
    expect((await decide(U.admin, s, null)).code).toBe('INVALID_INPUT');
    expect((await decide(U.admin, s, false, '  ')).code).toBe('REASON_REQUIRED');
    expect((await decide(U.admin, s, false, 'Thiếu chữ ký')).code).toBe('SUBMISSION_REJECTED');
    expect((await get(U.thv, s))[0]).toMatchObject({
      status: 'REJECTED',
      decision_note: 'Thiếu chữ ký',
      decided_by: U.admin,
    });
    expect((await decide(U.admin, s, true)).code).toBe('SUBMISSION_NOT_PENDING');

    const ok = (await submit(U.thv, { title: 'Sẽ duyệt' })).label!;
    expect((await decide(U.admin, ok, true)).code).toBe('SUBMISSION_APPROVED');
    expect((await get(U.admin, ok))[0]).toMatchObject({ status: 'APPROVED', decision_note: null });
    // Admin tự trình thì tự duyệt được (văn phòng nhỏ; mọi quyết định đều ghi nhật ký).
    const own = (await submit(U.admin, { title: 'Admin tự trình' })).label!;
    expect((await decide(U.admin, own, true)).ok).toBe(true);
  });

  it('tải scan: người trình và Admin được, người khác không; mọi lần ghi nhật ký', async () => {
    const s = (await submit(U.thv, { title: 'Tải xuống' })).label!;
    const f = (await files(U.thv, s))[0];
    const dl = (u: string) =>
      call(T, 'SELECT * FROM dms_submission_file_download($1,$2,$3)', [T, u, f.id]);
    expect((await dl(U.thv))[0]).toMatchObject({ label: f.label, mime: 'application/pdf' });
    expect((await dl(U.admin)).length).toBe(1);
    expect(await dl(U.ketoan)).toEqual([]);
    expect(await dl(U.outsider)).toEqual([]);
    const n = await call(
      T,
      `SELECT count(*) AS n FROM dms_audit_records WHERE target_id = $1 AND action = 'dms.submission.download'`,
      [f.id],
    );
    expect(Number(n[0].n)).toBe(2);
  });

  it('huy hiệu chờ duyệt: Admin thấy số bản chờ, người khác nhận 0, Admin văn phòng khác nhận 0', async () => {
    const pc = async (u: string, office = OFF) =>
      Number(
        (await call(T, 'SELECT dms_submission_pending_count($1,$2,$3) AS n', [T, u, office]))[0].n,
      );
    const before = await pc(U.admin);
    const s = (await submit(U.thv, { title: 'Đếm' })).label!;
    expect(await pc(U.admin)).toBe(before + 1);
    expect(await pc(U.thv)).toBe(0);
    expect(await pc(U.adminB)).toBe(0);
    await decide(U.admin, s, true);
    expect(await pc(U.admin)).toBe(before);
  });

  it('bất biến: không sửa nội dung, không xóa bản trình hay tệp, không sửa sau khi đã quyết định', async () => {
    const s = (await submit(U.thv, { title: 'Bất biến' })).label!;
    const f = (await files(U.thv, s))[0];
    await expect(
      call(T, `UPDATE dms_submissions SET title = 'Đã sửa' WHERE id = $1`, [s]),
    ).rejects.toThrow();
    await expect(
      call(T, `UPDATE dms_submissions SET description = 'Đã sửa' WHERE id = $1`, [s]),
    ).rejects.toThrow();
    await expect(call(T, 'DELETE FROM dms_submissions WHERE id = $1', [s])).rejects.toThrow();
    await expect(
      call(T, `UPDATE dms_submission_files SET label = 'x' WHERE id = $1`, [f.id]),
    ).rejects.toThrow();
    await expect(
      call(T, 'DELETE FROM dms_submission_files WHERE id = $1', [f.id]),
    ).rejects.toThrow();
    await decide(U.admin, s, true);
    await expect(
      call(
        T,
        `UPDATE dms_submissions SET status = 'REJECTED', decision_note = 'đổi ý' WHERE id = $1`,
        [s],
      ),
    ).rejects.toThrow();
    expect((await get(U.admin, s))[0].status).toBe('APPROVED');
  });
});
