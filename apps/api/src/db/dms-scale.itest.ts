import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Tìm kiếm/lọc ở quy mô lớn (0098): hàm mới phải cho ĐÚNG tập hồ sơ mà dms_list_cases (dms_case_visible từng dòng) cho,
// chỉ nhanh hơn. PostgreSQL thật, dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmss_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const DOMAINS = ['vibang', 'tongdat', 'xacminh', 'tochuc', 'vtden', 'vtdi', 'vtnb'] as const;

describe.skipIf(!ADMIN_URL)('DMS tìm kiếm và lọc quy mô lớn (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let app: pg.Pool;
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  const B1 = id();
  const B2 = id();
  const B3 = id();
  const U = { admin: id(), clerk: id(), own: id(), none: id(), suspended: id() };
  const caseIds: string[] = [];

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
  interface Filters {
    domain?: string | null;
    status?: string | null;
    q?: string | null;
    year?: number | null;
    from?: string | null;
    to?: string | null;
    branch?: string | null;
    creator?: string | null;
    kind?: string | null;
    scan?: string | null;
    pending?: boolean | null;
  }
  const search = (
    u: string,
    f: Filters = {},
    page: { sort?: string; cursor?: string | null; limit?: number; offset?: number } = {},
  ) =>
    call(
      'SELECT * FROM dms_search_cases($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true)',
      [
        T,
        u,
        OFF,
        f.domain ?? null,
        f.status ?? null,
        f.q ?? null,
        f.year ?? null,
        f.from ?? null,
        f.to ?? null,
        f.branch ?? null,
        f.creator ?? null,
        f.kind ?? null,
        f.scan ?? null,
        f.pending ?? null,
        page.sort ?? 'newest',
        page.cursor ?? null,
        page.limit ?? 200,
        page.offset ?? 0,
      ],
    );
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  const oldList = async (u: string, domain: string | null, status: string | null) =>
    ids(
      await call('SELECT id FROM dms_list_cases($1,$2,$3,$4,$5,200,0)', [
        T,
        u,
        OFF,
        domain,
        status,
      ]),
    );
  const facets = async (u: string, f: Filters = {}) => {
    const rows = await call(
      'SELECT * FROM dms_case_facet_counts($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [
        T,
        u,
        OFF,
        f.domain ?? null,
        f.status ?? null,
        f.q ?? null,
        f.year ?? null,
        f.from ?? null,
        f.to ?? null,
        f.branch ?? null,
        f.creator ?? null,
        f.kind ?? null,
        f.scan ?? null,
        f.pending ?? null,
      ],
    );
    const by: Record<string, Record<string, number>> = {};
    for (const r of rows as { group_key: string; value: string; n: string }[]) {
      (by[r.group_key] ??= {})[r.value] = Number(r.n);
    }
    return by;
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
      [B3, 'CN3'],
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
    await owner.query(
      `UPDATE users SET suspended_at = now(), suspended_by = $2, suspend_reason = 'test' WHERE id = $1`,
      [U.suspended, U.admin],
    );
    const group = async (name: string, kind: 'all' | 'own', users: string[]) => {
      const g = await owner.query(
        `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,$3) RETURNING id`,
        [T, OFF, name],
      );
      for (const d of DOMAINS)
        await owner.query(
          `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
          [T, g.rows[0].id, `${d}.read.${kind}`],
        );
      for (const u of users)
        await owner.query(
          `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
          [T, g.rows[0].id, u],
        );
    };
    await group('Xem tất cả', 'all', [U.clerk, U.suspended]);
    await group('Chỉ của mình', 'own', [U.own]);
    for (const [u, b] of [
      [U.clerk, B1],
      [U.clerk, B2],
      [U.own, B1],
      [U.suspended, B1],
    ] as const)
      await owner.query(
        `INSERT INTO dms_branch_access (tenant_id, office_id, user_id, branch_id, granted_by, grant_reason) VALUES ($1,$2,$3,$4,$5,'t')`,
        [T, OFF, u, b, U.admin],
      );

    // 7 miền x trạng thái x chi nhánh (kể cả không chi nhánh) x người tạo: mọi tổ hợp quyền đều có đại diện.
    const kinds = ['Biên bản', 'Quyết định', 'Hợp đồng'];
    const creators = [U.admin, U.clerk, U.own, U.none];
    const branches: (string | null)[] = [B1, B2, B3, null];
    let n = 0;
    for (const domain of DOMAINS)
      for (const status of ['RECORDED', 'DRAFT', 'CANCELLED'] as const)
        for (const branch of branches)
          for (const creator of creators) {
            n += 1;
            const cid = id();
            caseIds.push(cid);
            const when = new Date(Date.UTC(2025 + (n % 2), n % 12, 1 + (n % 27), 5, n % 60));
            await owner.query(
              `INSERT INTO dms_case_files (id, tenant_id, office_id, domain, title, attributes, status, created_by, created_at,
                                           recorded_by, recorded_at, cancelled_by, cancelled_at, cancel_reason, branch_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
              [
                cid,
                T,
                OFF,
                domain,
                n % 5 === 0 ? `Vi bằng Nguyễn Văn Đức số ${n}` : `Hồ sơ ${domain} số ${n}`,
                JSON.stringify({
                  so_ky_hieu: `${n}/GTT`,
                  nguoi_yeu_cau: n % 3 === 0 ? 'Trần Thị Hương' : 'Lê Minh',
                }),
                status,
                creator,
                when,
                status === 'RECORDED' ? creator : null,
                status === 'RECORDED' ? when : null,
                status === 'CANCELLED' ? creator : null,
                status === 'CANCELLED' ? when : null,
                status === 'CANCELLED' ? 'test' : null,
                branch,
              ],
            );
            const docs = n % 4; // 0..3 tài liệu
            for (let d = 0; d < docs; d++) {
              const did = id();
              await owner.query(
                `INSERT INTO dms_documents (id, tenant_id, case_id, kind, title, status, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [
                  did,
                  T,
                  cid,
                  kinds[(n + d) % 3],
                  `Tài liệu ${d}`,
                  status === 'DRAFT' ? 'DRAFT' : 'RECORDED',
                  creator,
                ],
              );
              if (n % 3 !== 0)
                await owner.query(
                  `INSERT INTO dms_document_files (tenant_id, document_id, label, is_scan, created_by) VALUES ($1,$2,'f.pdf',$3,$4)`,
                  [T, did, d % 2 === 0, creator],
                );
            }
          }
  }, 120_000);

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('cùng tập hồ sơ với dms_list_cases cho mọi vai, miền và trạng thái', async () => {
    let compared = 0;
    for (const who of Object.values(U))
      for (const domain of [null, ...DOMAINS])
        for (const status of [null, 'RECORDED', 'DRAFT', 'CANCELLED']) {
          const [a, b] = await Promise.all([
            oldList(who, domain, status),
            search(who, { domain, status }).then(ids),
          ]);
          expect(new Set(b), `${who} ${domain} ${status}`).toEqual(new Set(a));
          compared += a.length;
        }
    expect(compared).toBeGreaterThan(500); // không so sánh trên tập rỗng
  });

  it('hồ sơ không gắn chi nhánh chỉ Admin thấy; người bị khoá và người không quyền không thấy gì', async () => {
    const adminRows = await search(U.admin, { status: 'RECORDED' });
    const noBranch = await owner.query(
      `SELECT id FROM dms_case_files WHERE branch_id IS NULL AND status = 'RECORDED'`,
    );
    const adminSeesNoBranch = new Set(ids(adminRows));
    for (const r of noBranch.rows) expect(adminSeesNoBranch.has(r.id)).toBe(true);
    for (const who of [U.clerk, U.own]) {
      const rows = await search(who);
      expect(rows.every((r: { branch_id: string | null }) => r.branch_id !== null)).toBe(true);
    }
    expect(await search(U.none)).toHaveLength(0);
    expect(await search(U.suspended)).toHaveLength(0);
  });

  it('lọc: miền, năm ghi sổ, người tạo, chi nhánh, loại tài liệu, tình trạng scan, khoảng ngày', async () => {
    const all = await search(U.admin, { status: 'RECORDED' });
    expect(all.length).toBeGreaterThan(50);
    const byBranch = await search(U.admin, { status: 'RECORDED', branch: B1 });
    expect(byBranch.length).toBeGreaterThan(0);
    expect(byBranch.every((r: { branch_id: string }) => r.branch_id === B1)).toBe(true);
    const byCreator = await search(U.admin, { status: 'RECORDED', creator: U.clerk });
    expect(byCreator.every((r: { created_by: string }) => r.created_by === U.clerk)).toBe(true);
    const byKind = await search(U.admin, { status: 'RECORDED', kind: 'Hợp đồng' });
    expect(byKind.length).toBeGreaterThan(0);
    expect(byKind.every((r: { doc_kinds: string[] }) => r.doc_kinds.includes('Hợp đồng'))).toBe(
      true,
    );
    const missing = await search(U.admin, { status: 'RECORDED', scan: 'missing' });
    expect(
      missing.every(
        (r: { document_count: number; scan_count: number }) =>
          r.document_count > 0 && r.scan_count === 0,
      ),
    ).toBe(true);
    const complete = await search(U.admin, { status: 'RECORDED', scan: 'complete' });
    expect(complete.every((r: { scan_count: number }) => r.scan_count > 0)).toBe(true);
    const y2026 = await search(U.admin, { status: 'RECORDED', year: 2026 });
    expect(
      y2026.every(
        (r: { recorded_at: Date }) =>
          r.recorded_at.getUTCFullYear() === 2026 || r.recorded_at.getUTCMonth() === 11,
      ),
    ).toBe(true);
    const ranged = await search(U.admin, {
      status: 'RECORDED',
      from: '2025-03-01T00:00:00Z',
      to: '2025-06-01T00:00:00Z',
    });
    expect(
      ranged.every(
        (r: { recorded_at: Date }) =>
          r.recorded_at >= new Date('2025-03-01') && r.recorded_at < new Date('2025-06-01'),
      ),
    ).toBe(true);
    // Lọc không có kết quả khi kết hợp mâu thuẫn
    expect(await search(U.admin, { domain: 'vibang', scan: 'bogus' })).toHaveLength(0);
  });

  it('tìm chữ: không dấu / có dấu / chữ hoa, số hiệu, thuộc tính, nhiều từ phải cùng có mặt', async () => {
    const withAccent = ids(await search(U.admin, { q: 'Nguyễn Văn Đức' }));
    const noAccent = ids(await search(U.admin, { q: 'nguyen van duc' }));
    const upper = ids(await search(U.admin, { q: 'NGUYEN VAN DUC' }));
    expect(withAccent.length).toBeGreaterThan(0);
    expect(new Set(noAccent)).toEqual(new Set(withAccent));
    expect(new Set(upper)).toEqual(new Set(withAccent));
    expect((await search(U.admin, { q: '10/gtt' })).length).toBeGreaterThan(0); // số hiệu
    expect((await search(U.admin, { q: 'tran thi huong' })).length).toBeGreaterThan(0); // đương sự trong thuộc tính
    expect(await search(U.admin, { q: 'nguyen khong-ton-tai' })).toHaveLength(0);
    // Ký tự đại diện / cú pháp không có tác dụng
    expect(await search(U.admin, { q: "%' OR 1=1 --" })).toHaveLength(0);
  });

  it('phân trang keyset đi hết đúng một lần, cả hai chiều; offset cho cùng thứ tự', async () => {
    for (const sort of ['newest', 'oldest']) {
      const full = ids(await search(U.admin, {}, { sort, limit: 200 }));
      const walked: string[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 100; i++) {
        const page: { id: string; cursor: string }[] = await search(
          U.admin,
          {},
          { sort, cursor, limit: 7 },
        );
        if (page.length === 0) break;
        walked.push(...page.map((r) => r.id));
        cursor = page[page.length - 1]!.cursor;
      }
      expect(walked).toEqual(full);
      expect(new Set(walked).size).toBe(walked.length);
      expect(ids(await search(U.admin, {}, { sort, limit: 7, offset: 14 }))).toEqual(
        full.slice(14, 21),
      );
    }
  });

  it('total_capped đếm đúng tập đã lọc', async () => {
    const rows = await search(U.admin, { domain: 'vibang', status: 'RECORDED' }, { limit: 3 });
    const real = await owner.query(
      `SELECT count(*)::int AS n FROM dms_case_files WHERE domain = 'vibang' AND status = 'RECORDED'`,
    );
    expect(Number(rows[0].total_capped)).toBe(real.rows[0].n);
  });

  it('facet có đếm: mỗi nhóm đếm theo các bộ lọc KHÁC, tổng khớp danh sách', async () => {
    const f = { status: 'RECORDED', domain: 'vibang' };
    const base = await facets(U.admin, f);
    const total = (await search(U.admin, f)).length;
    expect(Object.values(base.creator!).reduce((a, b) => a + b, 0)).toBe(total);
    expect(Object.values(base.branch!).reduce((a, b) => a + b, 0)).toBe(total);
    expect(Object.values(base.scan!).reduce((a, b) => a + b, 0)).toBe(total);
    // Chọn người tạo: facet người tạo vẫn thấy mọi người (đổi sang người khác ra bao nhiêu), facet chi nhánh thu hẹp theo người đó.
    const picked = await facets(U.admin, { ...f, creator: U.clerk });
    expect(picked.creator).toEqual(base.creator);
    const onlyClerk = await search(U.admin, { ...f, creator: U.clerk });
    expect(Object.values(picked.branch!).reduce((a, b) => a + b, 0)).toBe(onlyClerk.length);
    // Facet cũng tôn trọng quyền xem: người chỉ thấy chi nhánh 1-2 không được thấy số của chi nhánh 3 hay "chưa gắn".
    const scoped = await facets(U.clerk, f);
    expect(Object.keys(scoped.branch ?? {}).sort()).toEqual([B1, B2].sort());
  });

  it('chỉ mục tự cập nhật khi thêm tài liệu/tệp, hủy tài liệu, yêu cầu sửa đổi chờ duyệt', async () => {
    const cid = id();
    await owner.query(
      `INSERT INTO dms_case_files (id, tenant_id, office_id, domain, title, status, created_by, branch_id) VALUES ($1,$2,$3,'tongdat','Hồ sơ cập nhật','DRAFT',$4,$5)`,
      [cid, T, OFF, U.admin, B1],
    );
    const row = async () =>
      (await search(U.admin, { q: 'cap nhat', status: 'DRAFT' })).find(
        (r: { id: string }) => r.id === cid,
      );
    expect((await row())?.document_count).toBe(0);
    const did = id();
    await owner.query(
      `INSERT INTO dms_documents (id, tenant_id, case_id, kind, title, status, created_by) VALUES ($1,$2,$3,'Biên bản','Tờ trình đặc biệt','DRAFT',$4)`,
      [did, T, cid, U.admin],
    );
    await owner.query(
      `INSERT INTO dms_document_files (tenant_id, document_id, label, is_scan, created_by) VALUES ($1,$2,'a.pdf',true,$3)`,
      [T, did, U.admin],
    );
    const r = await row();
    expect(r?.document_count).toBe(1);
    expect(r?.scan_count).toBe(1);
    expect(r?.doc_kinds).toEqual(['Biên bản']);
    expect(
      (await search(U.admin, { q: 'to trinh dac biet' })).map((x: { id: string }) => x.id),
    ).toContain(cid);
    await owner.query(`UPDATE dms_documents SET status = 'CANCELLED' WHERE id = $1`, [did]);
    expect((await row())?.document_count).toBe(0);
    // cùng số đếm với hàm cũ
    const old = (
      await call('SELECT * FROM dms_list_cases($1,$2,$3,$4,$5,200,0)', [
        T,
        U.admin,
        OFF,
        'tongdat',
        'DRAFT',
      ])
    ).find((x: { id: string }) => x.id === cid);
    expect(old.document_count).toBe(0);
  });

  it('nạp chỉ mục lần đầu cho dữ liệu có trước migration (idempotent)', async () => {
    const before = ids(await search(U.admin, { status: 'RECORDED' }));
    await owner.query('DELETE FROM dms_case_index');
    await owner.query('DELETE FROM dms_index_state');
    const after = ids(await search(U.admin, { status: 'RECORDED' }));
    expect(new Set(after)).toEqual(new Set(before));
    expect((await owner.query('SELECT count(*)::int AS n FROM dms_case_index')).rows[0].n).toBe(
      (await owner.query('SELECT count(*)::int AS n FROM dms_case_files')).rows[0].n,
    );
  });

  it('tìm trong nội dung OCR: đúng quyền, lọc, xếp hạng, bỏ bản cũ', async () => {
    const target = (
      await owner.query(
        `SELECT c.id FROM dms_case_files c WHERE c.status = 'RECORDED' AND c.branch_id = $1 AND c.domain = 'vibang' ORDER BY c.id LIMIT 1`,
        [B3],
      )
    ).rows[0].id as string;
    const visible = (
      await owner.query(
        `SELECT c.id FROM dms_case_files c WHERE c.status = 'RECORDED' AND c.branch_id = $1 AND c.domain = 'vibang' ORDER BY c.id LIMIT 1`,
        [B1],
      )
    ).rows[0].id as string;
    const mk = async (caseId: string, text: string, current = true) => {
      const doc = id();
      const file = id();
      const ver = id();
      await owner.query(
        `INSERT INTO dms_documents (id, tenant_id, case_id, kind, title, status, created_by) VALUES ($1,$2,$3,'Biên bản','OCR doc','RECORDED',$4)`,
        [doc, T, caseId, U.admin],
      );
      await owner.query(
        `INSERT INTO dms_document_files (id, tenant_id, document_id, label, is_scan, created_by) VALUES ($1,$2,$3,'s.pdf',true,$4)`,
        [file, T, doc, U.admin],
      );
      await owner.query(
        `INSERT INTO dms_document_versions (id, tenant_id, file_id, version, object_key, sha256, mime, size_bytes, created_by) VALUES ($1,$2,$3,1,$4,$5,'application/pdf',10,$6)`,
        [ver, T, file, `k/${ver}`, 'a'.repeat(64), U.admin],
      );
      await owner.query(
        `INSERT INTO dms_ocr_results (tenant_id, version_id, status, ocr_text, search_text) VALUES ($1,$2,'DONE',$3,dms_fold($3))`,
        [T, ver, text],
      );
      if (!current) {
        // Phiên bản mới của tệp (qua yêu cầu sửa đổi đã duyệt): bản OCR cũ hết là bản hiện hành.
        const am = await owner.query(
          `INSERT INTO dms_amendment_requests (tenant_id, office_id, case_id, document_id, file_id, kind, proposed, reason,
                                               evidence_object_key, evidence_sha256, evidence_mime, evidence_size_bytes, status,
                                               requested_by, reviewed_by, reviewed_at)
           VALUES ($1,$2,$3,$4,$5,'FILE_VERSION','{}','test',$6,$7,'application/pdf',10,'APPROVED',$8,$9,now()) RETURNING id`,
          [T, OFF, caseId, doc, file, `ev/${ver}`, 'c'.repeat(64), U.admin, U.clerk],
        );
        await owner.query(
          `INSERT INTO dms_document_versions (tenant_id, file_id, version, object_key, sha256, mime, size_bytes, created_by, amendment_id)
           VALUES ($1,$2,2,$3,$4,'application/pdf',10,$5,$6)`,
          [T, file, `k/${ver}/v2`, 'b'.repeat(64), U.admin, am.rows[0].id],
        );
      }
      return file;
    };
    const f1 = await mk(visible, 'Tranh chấp đồng thau tại Hà Nội');
    await mk(target, 'Tranh chấp đồng thau tại Hà Nội');
    await mk(visible, 'Tranh chấp đồng thau cũ', false);
    const content = (u: string, tsq: string, extra: Partial<{ branch: string | null }> = {}) =>
      call('SELECT * FROM dms_search_content($1,$2,$3,NULL,$4,NULL,$5,NULL,NULL,20,0)', [
        T,
        u,
        OFF,
        tsq,
        extra.branch ?? null,
      ]);
    const adminHits = await content(U.admin, 'dong & thau:*');
    expect(adminHits.length).toBe(2); // bản cũ bị loại
    expect(adminHits.every((r: { ranked: boolean }) => r.ranked)).toBe(true);
    const clerkHits = await content(U.clerk, 'dong & thau:*'); // clerk chỉ có CN1, CN2
    expect(clerkHits.map((r: { case_id: string }) => r.case_id)).toEqual([visible]);
    expect(clerkHits[0].file_id).toBe(f1);
    expect(await content(U.none, 'dong & thau:*')).toHaveLength(0);
    expect(await content(U.admin, 'dong & thau:*', { branch: B3 })).toHaveLength(1);
    expect(await content(U.admin, 'khong & ton & tai')).toHaveLength(0);
  });

  it('SECURITY DEFINER không làm lộ: facet và tìm OCR chỉ đếm/thấy đúng phạm vi chi nhánh + quyền xem, hồ sơ không chi nhánh chỉ Admin', async () => {
    const mkOcr = async (caseId: string, text: string) => {
      const doc = id();
      const file = id();
      const ver = id();
      await owner.query(
        `INSERT INTO dms_documents (id, tenant_id, case_id, kind, title, status, created_by) VALUES ($1,$2,$3,'Biên bản','leak doc','RECORDED',$4)`,
        [doc, T, caseId, U.admin],
      );
      await owner.query(
        `INSERT INTO dms_document_files (id, tenant_id, document_id, label, is_scan, created_by) VALUES ($1,$2,$3,'l.pdf',true,$4)`,
        [file, T, doc, U.admin],
      );
      await owner.query(
        `INSERT INTO dms_document_versions (id, tenant_id, file_id, version, object_key, sha256, mime, size_bytes, created_by) VALUES ($1,$2,$3,1,$4,$5,'application/pdf',10,$6)`,
        [ver, T, file, `k/${ver}`, 'd'.repeat(64), U.admin],
      );
      await owner.query(
        `INSERT INTO dms_ocr_results (tenant_id, version_id, status, ocr_text, search_text) VALUES ($1,$2,'DONE',$3,dms_fold($3))`,
        [T, ver, text],
      );
    };
    // Mỗi chi nhánh (và "không chi nhánh") có một hồ sơ đã ghi sổ chứa cùng một từ khoá hiếm.
    const byBranch = new Map<string | null, string>();
    for (const b of [B1, B2, B3, null] as (string | null)[]) {
      const c = (
        await owner.query(
          `SELECT id FROM dms_case_files WHERE status = 'RECORDED' AND domain = 'tongdat' AND branch_id IS NOT DISTINCT FROM $1 ORDER BY id LIMIT 1`,
          [b],
        )
      ).rows[0].id as string;
      byBranch.set(b, c);
      await mkOcr(c, 'bí mật xyzzyleak nội bộ');
    }
    const hits = async (u: string) =>
      new Set(
        (
          await call(
            'SELECT case_id FROM dms_search_content($1,$2,$3,NULL,$4,NULL,NULL,NULL,NULL,50,0)',
            [T, u, OFF, 'xyzzyleak:*'],
          )
        ).map((r: { case_id: string }) => r.case_id),
      );
    // Kỳ vọng lấy từ chốt chặn cũ dms_case_visible (qua dms_list_cases): nội dung OCR không lộ rộng hơn danh sách hồ sơ.
    const planted = new Set(byBranch.values());
    for (const who of Object.values(U)) {
      const allowed = new Set(
        (await oldList(who, 'tongdat', 'RECORDED')).filter((c) => planted.has(c)),
      );
      expect(await hits(who), `ocr ${who}`).toEqual(allowed);
    }
    expect(await hits(U.admin)).toEqual(planted); // Admin thấy cả bốn, kể cả không chi nhánh
    const clerkHits = await hits(U.clerk);
    expect(clerkHits.has(byBranch.get(B3)!)).toBe(false); // chi nhánh khác
    expect(clerkHits.has(byBranch.get(null)!)).toBe(false); // chưa gắn chi nhánh: chỉ Admin
    expect(clerkHits.has(byBranch.get(B1)!) && clerkHits.has(byBranch.get(B2)!)).toBe(true);
    expect(await hits(U.none)).toEqual(new Set());
    expect(await hits(U.suspended)).toEqual(new Set());
    // Facet: tổng đếm của mỗi người đúng bằng số hồ sơ họ xem được qua hàm cũ (dms_case_visible), không hơn.
    for (const who of [U.admin, U.clerk, U.own, U.none, U.suspended]) {
      const f = await facets(who, { status: 'RECORDED' });
      const visible = (await oldList(who, null, 'RECORDED')).length;
      for (const g of ['creator', 'branch', 'scan'])
        expect(
          Object.values(f[g] ?? {}).reduce((a, b) => a + b, 0),
          `${who} ${g}`,
        ).toBe(visible);
      if (who !== U.admin) {
        expect(Object.keys(f.branch ?? {})).not.toContain(''); // không có nhóm "chưa gắn chi nhánh"
        expect(Object.keys(f.branch ?? {})).not.toContain(B3);
      }
    }
  });

  it('hàm đọc nặng từ chối tenant không khớp phiên; bảng chỉ mục vẫn bị RLS chặn khi truy cập trực tiếp', async () => {
    const other = id();
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [other]);
      await expect(
        client.query(
          'SELECT * FROM dms_search_cases($1,$2,$3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,$4,NULL,10,0,false)',
          [T, U.admin, OFF, 'newest'],
        ),
      ).rejects.toThrow(/tenant mismatch/);
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [other]);
      expect((await client.query('SELECT count(*)::int AS n FROM dms_case_index')).rows[0].n).toBe(
        0,
      );
      expect(
        (await client.query('SELECT count(*)::int AS n FROM dms_ocr_search_index')).rows[0].n,
      ).toBe(0);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
    // Không đặt tenant: không thấy gì.
    const bare = await app.connect();
    try {
      expect((await bare.query('SELECT count(*)::int AS n FROM dms_case_index')).rows[0].n).toBe(0);
    } finally {
      bare.release();
    }
  });

  it('bộ lọc đã lưu: của riêng từng người, ghi đè theo tên, giới hạn số lượng', async () => {
    const save = (u: string, name: string, params: object) =>
      call(
        'SELECT (r).ok, (r).code, (r).label FROM (SELECT dms_saved_filter_save($1,$2,$3,$4,$5,$6::jsonb) AS r) q',
        [T, u, OFF, 'vibang', name, JSON.stringify(params)],
      );
    const list = (u: string) =>
      call('SELECT * FROM dms_saved_filter_list($1,$2,$3,$4)', [T, u, OFF, 'vibang']);
    expect((await save(U.admin, 'Thiếu scan 2026', { scan: 'missing', year: 2026 }))[0].ok).toBe(
      true,
    );
    expect((await save(U.admin, 'Thiếu scan 2026', { scan: 'missing', year: 2025 }))[0].ok).toBe(
      true,
    );
    expect(await list(U.admin)).toHaveLength(1);
    expect((await list(U.admin))[0].params).toEqual({ scan: 'missing', year: 2025 });
    expect(await list(U.clerk)).toHaveLength(0);
    expect((await save(U.none, 'x', {}))[0].ok).toBe(true); // thành viên văn phòng nào cũng lưu được bộ lọc của mình
    const sid = (await list(U.admin))[0].id;
    const rm = await call('SELECT (r).ok FROM (SELECT dms_saved_filter_remove($1,$2,$3) AS r) q', [
      T,
      U.clerk,
      sid,
    ]);
    expect(rm[0].ok).toBe(false); // không xoá được của người khác
    expect(
      (
        await call('SELECT (r).ok FROM (SELECT dms_saved_filter_remove($1,$2,$3) AS r) q', [
          T,
          U.admin,
          sid,
        ])
      )[0].ok,
    ).toBe(true);
  });

  it('tìm và hiển thị theo giá trị HIỆN HÀNH sau sửa đổi đã duyệt; dòng sổ của một trang hồ sơ', async () => {
    const cid = id();
    const did = id();
    await owner.query(
      `INSERT INTO dms_case_files (id, tenant_id, office_id, domain, title, status, created_by, branch_id, recorded_at, recorded_by, attributes)
       VALUES ($1,$2,$3,'vibang','Vi bằng Cũ Kỹ','RECORDED',$4,$5,now(),$4,'{"ben":"Ông Trần Gốc"}')`,
      [cid, T, OFF, U.admin, B1],
    );
    await owner.query(
      `INSERT INTO dms_documents (id, tenant_id, case_id, kind, title, status, created_by) VALUES ($1,$2,$3,'Biên bản','BB gốc','RECORDED',$4)`,
      [did, T, cid, U.admin],
    );
    const am = await owner.query(
      `INSERT INTO dms_amendment_requests (tenant_id, office_id, case_id, kind, proposed, reason, evidence_object_key, evidence_sha256,
                                           evidence_mime, evidence_size_bytes, status, requested_by, reviewed_by, reviewed_at)
       VALUES ($1,$2,$3,'CASE_FIELDS','{}','test','ev/rev',$4,'application/pdf',10,'APPROVED',$5,$6,now()) RETURNING id`,
      [T, OFF, cid, 'd'.repeat(64), U.admin, U.clerk],
    );
    const ids = async (q: string) =>
      (await search(U.admin, { q })).map((x: { id: string }) => x.id);
    expect(await ids('tran goc')).toContain(cid);
    await owner.query(
      `INSERT INTO dms_case_revisions (tenant_id, case_id, rev, title, attributes, amendment_id, created_by)
       VALUES ($1,$2,1,'Vi bằng Mới Tinh','{"ben":"Bà Lê Đổi"}',$3,$4)`,
      [T, cid, am.rows[0].id, U.admin],
    );
    expect(await ids('tran goc')).not.toContain(cid);
    expect(await ids('le doi')).toContain(cid);
    const shown = (await search(U.admin, { q: 'moi tinh' })).find(
      (x: { id: string }) => x.id === cid,
    );
    expect(shown.title).toBe('Vi bằng Mới Tinh');
    expect(shown.attributes.ben).toBe('Bà Lê Đổi');
    // khớp danh sách cũ
    const old = (
      await call('SELECT * FROM dms_list_cases($1,$2,$3,$4,$5,200,0)', [
        T,
        U.admin,
        OFF,
        'vibang',
        'RECORDED',
      ])
    ).find((x: { id: string }) => x.id === cid);
    expect(old.title).toBe(shown.title);

    await owner.query(
      `INSERT INTO dms_book_entries (tenant_id, office_id, book, year, stt, case_id, document_id, allocated_by) VALUES ($1,$2,'S-02',2026,9001,$3,NULL,$4)`,
      [T, OFF, cid, U.admin],
    );
    const rowsFor = (u: string) =>
      call('SELECT * FROM dms_book_rows_for_cases($1,$2,$3,$4,$5)', [T, u, OFF, 'S-02', [cid]]);
    const br = await rowsFor(U.admin);
    expect(br).toHaveLength(1);
    expect(br[0].stt).toBe(9001);
    expect(br[0].case_title).toBe('Vi bằng Mới Tinh');
    expect(await rowsFor(U.none)).toHaveLength(0); // cùng luật hiển thị: không quyền thì không thấy
  });

  it('danh sách miền cố định khớp ràng buộc CHECK của dms_case_files', async () => {
    const def = (
      await owner.query(
        `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'dms_case_files_domain_check'`,
      )
    ).rows[0].d as string;
    for (const d of DOMAINS) expect(def).toContain(`'${d}'`);
    expect((def.match(/'[a-z]+'/g) ?? []).length).toBe(DOMAINS.length);
    const fn = (await owner.query(`SELECT prosrc FROM pg_proc WHERE proname = 'dms_visible_scope'`))
      .rows[0].prosrc as string;
    for (const d of DOMAINS) expect(fn).toContain(`'${d}'`);
  });
});
