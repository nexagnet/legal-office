import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';
import { LocalFileStore } from '../storage/file-store';

// C8: các luồng E2E còn thiếu qua HTTP thật + PostgreSQL thật + kho tệp trên đĩa. Toàn bộ dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsc8_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const PDF = Buffer.from('%PDF-1.4\n% synthetic scan\n');
const DOMAINS = ['vibang', 'tongdat', 'xacminh', 'tochuc', 'vtden', 'vtdi', 'vtnb'] as const;
const BOOK_OF: Record<(typeof DOMAINS)[number], string> = {
  tongdat: 'S-01',
  vibang: 'S-02',
  xacminh: 'S-04',
  tochuc: 'S-05',
  vtden: 'VT-DEN',
  vtdi: 'VT-DI',
  vtnb: 'VT-NB',
};
const ACTIONS = ['read', 'draft', 'confirm', 'add_document', 'download'];

describe.skipIf(!ADMIN_URL)('C8: xuất 7 sổ, hủy nháp, ma trận quyền, thử lại OCR (HTTP)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const storeDir = mkdtempSync(join(tmpdir(), 'lo-c8-'));
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  // full: đủ quyền 7 nghiệp vụ (.own); reader: chỉ đọc tất cả vi bằng; drafter: chỉ soạn nháp; stranger: không nhóm nào.
  const U = { full: id(), other: id(), reader: id(), drafter: id(), stranger: id() };

  const call = async (method: string, path: string, user: string, body?: unknown, raw?: Buffer) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'x-synthetic-user': user,
        'x-synthetic-tenant': T,
        ...(raw
          ? { 'content-type': 'application/pdf' }
          : body === undefined
            ? {}
            : { 'content-type': 'application/json' }),
      },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    return res;
  };
  const api = async (method: string, path: string, user: string, body?: unknown) => {
    const res = await call(method, path, user, body);
    const t = await res.text();
    return { status: res.status, json: t ? (JSON.parse(t) as Json) : {} };
  };
  const mkCase = async (user: string, domain: string, title: string, attributes = {}) => {
    const r = await api('POST', '/dms/cases', user, { officeId: OFF, domain, title, attributes });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    return r.json.label as string;
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
    appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 8 });
    server = await NestFactory.create(
      AppModule.register({
        pool: appPool,
        resolver: new SyntheticHeaderResolver(),
        fileStore: new LocalFileStore(storeDir),
      }),
      { logger: false },
    );
    await server.listen(0);
    base = (await server.getUrl()).replace('[::1]', 'localhost');

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A')`, [T]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [OFF, T]);
    for (const u of Object.values(U))
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        u,
        T,
        u,
      ]);
    const mk = async (name: string, perms: string[], users: string[]) => {
      const g = (
        await owner.query(
          `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,$3) RETURNING id`,
          [T, OFF, name],
        )
      ).rows[0].id;
      for (const p of perms)
        await owner.query(
          `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
          [T, g, p],
        );
      for (const u of users)
        await owner.query(
          `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
          [T, g, u],
        );
    };
    const own = DOMAINS.flatMap((d) => ACTIONS.map((a) => `${d}.${a}.own`));
    await mk('Đủ quyền', own, [U.full, U.other]);
    await mk('Chỉ đọc', ['vibang.read.all'], [U.reader]);
    await mk('Chỉ soạn nháp', ['vibang.read.own', 'vibang.draft.own'], [U.drafter]);
  }, 120_000);

  afterAll(async () => {
    await server?.close();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
    rmSync(storeDir, { recursive: true, force: true });
  });

  it('xuất đủ 7 sổ (S-01, S-02, S-04, S-05, VT-DEN, VT-DI, VT-NB): ghi sổ rồi JSON, CSV, PDF đều có dòng đúng', async () => {
    const year = new Date().getFullYear();
    const spec = await api('GET', '/dms/books', U.full);
    expect(spec.json.books.map((b: Json) => b.code)).toEqual(['S-01', 'S-02', 'S-04', 'S-05']);
    expect(spec.json.vanthu.map((b: Json) => b.code)).toEqual(['VT-DEN', 'VT-DI', 'VT-NB']);
    for (const domain of DOMAINS) {
      const code = BOOK_OF[domain];
      const title = `Thử xuất ${code}`;
      const caseId = await mkCase(U.full, domain, title);
      const rec = await api('POST', `/dms/cases/${caseId}/record`, U.full);
      expect(rec.status, `${code}: ${JSON.stringify(rec.json)}`).toBe(200);
      const json = await api('GET', `/dms/books/${code}?officeId=${OFF}&year=${year}`, U.full);
      expect(json.status, code).toBe(200);
      const mine = json.json.rows.find((r: Json) => r.case_id === caseId);
      expect(mine, `${code} có dòng của hồ sơ vừa ghi sổ`).toBeTruthy();
      expect(Number(mine.stt)).toBeGreaterThanOrEqual(1);
      const csv = await call(
        'GET',
        `/dms/books/${code}?officeId=${OFF}&year=${year}&format=csv`,
        U.full,
      );
      expect(csv.status, code).toBe(200);
      expect(csv.headers.get('content-type')).toContain('text/csv');
      const text = await csv.text();
      expect(text.split('\n').length, `${code}: có dòng tiêu đề và dữ liệu`).toBeGreaterThanOrEqual(
        2,
      );
      const pdf = await call(
        'GET',
        `/dms/books/${code}?officeId=${OFF}&year=${year}&format=pdf`,
        U.full,
      );
      expect(pdf.status, code).toBe(200);
      expect(pdf.headers.get('content-type')).toContain('application/pdf');
      expect(
        Buffer.from(await pdf.arrayBuffer())
          .subarray(0, 5)
          .toString(),
      ).toBe('%PDF-');
      // Người khác (cùng nhóm .own nhưng không phải người tạo) không thấy dòng của hồ sơ này.
      const theirs = await api('GET', `/dms/books/${code}?officeId=${OFF}&year=${year}`, U.other);
      expect(
        theirs.json.rows.some((r: Json) => r.case_id === caseId),
        `${code}: cách ly`,
      ).toBe(false);
    }
  });

  it('hủy nháp: cần lý do, giữ lịch sử, không ghi sổ được nữa, hồ sơ đã ghi sổ không hủy được, người khác không hủy được', async () => {
    const c = await mkCase(U.full, 'vibang', 'Nháp sẽ hủy');
    expect((await api('POST', `/dms/cases/${c}/cancel-draft`, U.full, {})).status).toBe(400);
    expect(
      (await api('POST', `/dms/cases/${c}/cancel-draft`, U.other, { reason: 'x' })).status,
    ).toBeGreaterThanOrEqual(403);
    expect(
      (await api('POST', `/dms/cases/${c}/cancel-draft`, U.stranger, { reason: 'x' })).status,
    ).toBeGreaterThanOrEqual(403);
    const ok = await api('POST', `/dms/cases/${c}/cancel-draft`, U.full, { reason: 'Nhập nhầm' });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    const detail = await api('GET', `/dms/cases/${c}`, U.full);
    expect(detail.json.status ?? detail.json.row?.status).toBe('CANCELLED');
    // Đã hủy: không ghi sổ, không hủy lần hai, không còn trong danh sách chính thức.
    expect((await api('POST', `/dms/cases/${c}/record`, U.full)).status).toBeGreaterThanOrEqual(
      400,
    );
    expect(
      (await api('POST', `/dms/cases/${c}/cancel-draft`, U.full, { reason: 'lần 2' })).status,
    ).toBeGreaterThanOrEqual(400);
    const cancelled = await api(
      'GET',
      `/dms/cases?officeId=${OFF}&domain=vibang&status=CANCELLED`,
      U.full,
    );
    expect(cancelled.json.rows.some((r: Json) => r.id === c)).toBe(true);
    // Lịch sử còn nguyên trong cơ sở dữ liệu (không xoá).
    const kept = await owner.query(`SELECT status FROM dms_case_files WHERE id = $1`, [c]);
    expect(kept.rows).toEqual([{ status: 'CANCELLED' }]);
    // Hồ sơ đã ghi sổ thì không hủy nháp được.
    const r = await mkCase(U.full, 'vibang', 'Đã ghi sổ');
    expect((await api('POST', `/dms/cases/${r}/record`, U.full)).status).toBe(200);
    expect(
      (await api('POST', `/dms/cases/${r}/cancel-draft`, U.full, { reason: 'muộn' })).status,
    ).toBeGreaterThanOrEqual(400);
  });

  it('ma trận quyền: mỗi vai chỉ làm đúng việc được cấp, mặc định từ chối', async () => {
    const mineCase = await mkCase(U.full, 'vibang', 'Hồ sơ của full');
    const matrix: {
      who: string;
      user: string;
      create: number;
      readDetail: number;
      record: number;
    }[] = [
      { who: 'đủ quyền', user: U.full, create: 201, readDetail: 200, record: 200 },
      { who: 'chỉ soạn nháp', user: U.drafter, create: 201, readDetail: 200, record: 403 },
      { who: 'chỉ đọc', user: U.reader, create: 403, readDetail: -1, record: 403 },
      { who: 'không nhóm nào', user: U.stranger, create: 403, readDetail: -1, record: 403 },
    ];
    for (const m of matrix) {
      const created = await api('POST', '/dms/cases', m.user, {
        officeId: OFF,
        domain: 'vibang',
        title: `Thử ${m.who}`,
        attributes: {},
      });
      expect(created.status, `${m.who}: tạo nháp`).toBe(m.create);
      if (m.create === 201) {
        const own = created.json.label as string;
        expect(
          (await api('GET', `/dms/cases/${own}`, m.user)).status,
          `${m.who}: xem hồ sơ của mình`,
        ).toBe(m.readDetail);
        expect(
          (await api('POST', `/dms/cases/${own}/record`, m.user)).status,
          `${m.who}: ghi sổ`,
        ).toBe(m.record);
      }
      // Hồ sơ nháp của người khác: không ai ngoài người tạo thấy; không ghi sổ hộ.
      expect(
        (await api('POST', `/dms/cases/${mineCase}/record`, m.user)).status === 200 &&
          m.user !== U.full,
        `${m.who}: không ghi sổ hộ`,
      ).toBe(false);
    }
    // Nghiệp vụ không được cấp thì từ chối (người chỉ soạn nháp Vi bằng không soạn được Tống đạt).
    expect(
      (
        await api('POST', '/dms/cases', U.drafter, {
          officeId: OFF,
          domain: 'tongdat',
          title: 'x',
          attributes: {},
        })
      ).status,
    ).toBe(403);
    // Người chỉ đọc đọc được sổ nhưng không tạo/tải/ghi: đã kiểm ở trên; sổ của nghiệp vụ không được cấp thì rỗng.
    const sotd = await api(
      'GET',
      `/dms/books/S-01?officeId=${OFF}&year=${new Date().getFullYear()}`,
      U.reader,
    );
    expect(sotd.json.rows ?? []).toEqual([]);
  });

  it('thử lại OCR qua HTTP: chỉ tệp FAILED, cần quyền thêm tài liệu, đặt lại hàng đợi', async () => {
    const c = await mkCase(U.full, 'vibang', 'Hồ sơ có scan lỗi OCR');
    const d = await api('POST', `/dms/cases/${c}/documents`, U.full, {
      kind: 'N-04',
      title: 'Vi bằng',
      isOfficial: true,
    });
    expect(d.status).toBe(201);
    const up = await call(
      'POST',
      `/dms/documents/${d.json.label}/files?label=scan&isScan=true`,
      U.full,
      undefined,
      PDF,
    );
    expect(up.status).toBe(200);
    const fileId = ((await up.json()) as Json).label as string;
    expect((await api('POST', `/dms/cases/${c}/record`, U.full)).status).toBe(200);
    // Chưa lỗi (chưa vào hàng đợi): từ chối.
    expect((await api('POST', `/dms/files/${fileId}/ocr-retry`, U.full)).status).toBe(409);
    // Giả lập OCR hết 3 lần thử.
    await owner.query(
      `INSERT INTO dms_ocr_results (tenant_id, version_id, status, attempts, error, finished_at)
       SELECT v.tenant_id, v.id, 'FAILED', 3, 'ENGINE_CRASH', now() FROM dms_document_versions v WHERE v.file_id = $1`,
      [fileId],
    );
    expect((await api('POST', `/dms/files/${fileId}/ocr-retry`, U.stranger)).status).toBe(404);
    expect(
      (await api('POST', `/dms/files/${fileId}/ocr-retry`, U.reader)).status,
    ).toBeGreaterThanOrEqual(403);
    const ok = await api('POST', `/dms/files/${fileId}/ocr-retry`, U.full);
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    expect(ok.json.code).toBe('OCR_RETRY_QUEUED');
    const st = await api('GET', `/dms/files/ocr-status?ids=${fileId}`, U.full);
    expect(st.status, JSON.stringify(st.json)).toBe(200);
    expect(st.json.rows[0].ocr_status).toBe('PENDING');
    // Đã chờ rồi thì không đặt lại lần nữa.
    expect((await api('POST', `/dms/files/${fileId}/ocr-retry`, U.full)).status).toBe(409);
  });

  it('các đường đọc từng bị chặn nhầm (500 "unsafe function name") nay trả 200: ocr-status, thv/options', async () => {
    const opts = await api('GET', '/dms/thv/options', U.full);
    expect(opts.status, JSON.stringify(opts.json)).toBe(200);
    expect(Array.isArray(opts.json.items)).toBe(true);
    const st = await api('GET', `/dms/files/ocr-status?ids=${id()}`, U.full);
    expect(st.status).toBe(200);
    expect(st.json.rows).toEqual([]);
  });
});
