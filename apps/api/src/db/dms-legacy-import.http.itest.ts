import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';
import { ApiError, ImportApi } from '../legacy-import/client';
import { Ledger } from '../legacy-import/ledger';
import { runImport } from '../legacy-import/run';
import {
  LocalFileStore,
  type DirectTransferStore,
  type PresignedUpload,
} from '../storage/file-store';

// Nhập tài liệu cũ đầu-cuối: công cụ nhập -> API thật -> PostgreSQL thật -> kho (giả lập S3 trên máy). Toàn bộ dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmslh_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/** Kho giả lập S3: nhận PUT có kiểm tra checksum và Content-Length như kho thật, và cho phép gây lỗi theo yêu cầu. */
class FakeS3 extends LocalFileStore implements DirectTransferStore {
  server!: Server;
  port = 0;
  puts = 0;
  failPutFor = new Map<string, { status: number; times: number }>();
  constructor(root: string) {
    super(root);
  }
  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      const key = decodeURIComponent(url.searchParams.get('key') ?? '');
      if (req.method === 'GET') {
        void this.get(key).then((b) => {
          res.statusCode = b ? 200 : 404;
          res.end(b ?? undefined);
        });
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const fail = this.failPutFor.get(key);
        if (fail && fail.times > 0) {
          fail.times--;
          res.statusCode = fail.status;
          res.end();
          return;
        }
        const body = Buffer.concat(chunks);
        const want = req.headers['x-amz-checksum-sha256'];
        const got = createHash('sha256').update(body).digest('base64');
        if (want !== got || Number(req.headers['content-length']) !== body.length) {
          res.statusCode = 400;
          res.end();
          return;
        }
        this.puts++;
        void this.put(key, body).then(() => {
          res.statusCode = 200;
          res.end();
        });
      });
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.port = (this.server.address() as { port: number }).port;
  }
  presignPut(
    key: string,
    o: { sha256Hex: string; size: number; mime: string; ttlSeconds: number },
  ): Promise<PresignedUpload> {
    return Promise.resolve({
      url: `http://127.0.0.1:${this.port}/put?key=${encodeURIComponent(key)}`,
      headers: {
        'content-type': o.mime,
        'x-amz-checksum-sha256': Buffer.from(o.sha256Hex, 'hex').toString('base64'),
      },
      expiresAt: new Date(Date.now() + o.ttlSeconds * 1000),
    });
  }
  presignGet(key: string): Promise<string> {
    return Promise.resolve(`http://127.0.0.1:${this.port}/get?key=${encodeURIComponent(key)}`);
  }
  async head(key: string): Promise<{ size: number } | null> {
    const b = await this.get(key);
    return b ? { size: b.length } : null;
  }
}

describe.skipIf(!ADMIN_URL)('Nhập tài liệu cũ đầu-cuối (công cụ nhập + API + PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const work = mkdtempSync(join(tmpdir(), 'lo-legacy-'));
  const store = new FakeS3(join(work, 'store'));
  const src = join(work, 'kho-khach');
  const T = randomUUID();
  const OFF = randomUUID();
  const U = { imp: randomUUID(), rd: randomUUID(), none: randomUUID() };
  const hdr = (u: string) => ({ 'x-synthetic-user': u, 'x-synthetic-tenant': T });
  const apiFor = (u: string, extra: Partial<ConstructorParameters<typeof ImportApi>[0]> = {}) =>
    new ImportApi({ baseUrl: base, headers: hdr(u), sleep: () => Promise.resolve(), ...extra });
  const get = async (path: string, u: string) => {
    const res = await fetch(`${base}${path}`, { headers: hdr(u) });
    const t = await res.text();
    return { status: res.status, text: t, json: t.startsWith('{') ? JSON.parse(t) : {} };
  };
  const dbCount = async (sql: string, args: unknown[] = []) =>
    Number((await owner.query(sql, args)).rows[0].n);

  const PDF_A = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('hồ sơ A giả lập')]);
  const PDF_B = Buffer.from('%PDF-1.4\nho so B gia lap');

  beforeAll(async () => {
    mkdirSync(join(src, '2016/Vi bang/HS-001'), { recursive: true });
    mkdirSync(join(src, '2017/Tong dat'), { recursive: true });
    writeFileSync(join(src, '2016/Vi bang/HS-001/bien-ban.pdf'), PDF_A);
    writeFileSync(join(src, '2017/Tong dat/ban-sao-bien-ban.pdf'), PDF_A); // trùng nội dung
    writeFileSync(join(src, '2017/Tong dat/Công văn số 12.pdf'), PDF_B);
    writeFileSync(join(src, '2017/Tong dat/ghi-chu.docx'), 'noi dung word gia lap');
    writeFileSync(join(src, '2017/rong.txt'), '');
    writeFileSync(join(src, '2017/Thumbs.db'), 'rac');
    writeFileSync(join(src, '2017/~$tam.docx'), 'rac');
    symlinkSync('/etc', join(src, 'lien-ket'));

    await store.start();
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
        fileStore: store,
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
    for (const [name, perm, user] of [
      ['Nhập cũ', 'dms.legacy.import', U.imp],
      ['Xem cũ', 'dms.legacy.read', U.rd],
    ] as const) {
      const g = (
        await owner.query(
          `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,$3) RETURNING id`,
          [T, OFF, name],
        )
      ).rows[0].id;
      await owner.query(
        `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,$3)`,
        [T, g, perm],
      );
      await owner.query(
        `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
        [T, g, user],
      );
    }
  });

  afterAll(async () => {
    await server?.close();
    await new Promise((r) => store.server?.close(r));
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  let batch = '';

  it('người không có quyền nhập không mở được đợt; người có quyền mở được', async () => {
    await expect(apiFor(U.none).openBatch(OFF, 'x')).rejects.toMatchObject({ status: 403 });
    await expect(apiFor(U.rd).openBatch(OFF, 'x')).rejects.toMatchObject({ status: 403 });
    const r = await apiFor(U.imp).openBatch(OFF, 'Kho cũ 2016-2017', 'D:\\Luu tru');
    batch = r.label;
    expect(batch).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('nhập cả kho: giữ cấu trúc, tệp trùng chỉ tải một lần, bỏ qua tệp rác và liên kết', async () => {
    const ledger = await Ledger.open(join(work, 'ledger1.jsonl'));
    const sum = await runImport({
      root: src,
      batchId: batch,
      api: apiFor(U.imp),
      ledger,
      concurrency: 3,
    });
    expect(sum.failed).toEqual([]);
    expect(sum.scanned).toBe(5);
    expect(sum.registered).toBe(5);
    expect(sum.skipped).toEqual({ IGNORED: 2, SYMLINK: 1 });
    // 5 tệp, 4 nội dung khác nhau (bản sao biên bản trùng), nên chỉ 4 lần PUT; tệp rỗng cũng là một đối tượng.
    expect(store.puts).toBe(4);
    expect(sum.deduplicated).toBe(1);

    const paths = (
      await owner.query(
        `SELECT rel_path, is_legacy, sha256 FROM dms_legacy_files WHERE batch_id = $1 ORDER BY rel_path COLLATE "C"`,
        [batch],
      )
    ).rows;
    expect(paths.map((r) => r.rel_path)).toEqual([
      '2016/Vi bang/HS-001/bien-ban.pdf',
      '2017/Tong dat/Công văn số 12.pdf',
      '2017/Tong dat/ban-sao-bien-ban.pdf',
      '2017/Tong dat/ghi-chu.docx',
      '2017/rong.txt',
    ]);
    expect(paths.every((r) => r.is_legacy)).toBe(true);
    const bySha = new Map(paths.map((r) => [r.rel_path, r.sha256]));
    expect(bySha.get('2016/Vi bang/HS-001/bien-ban.pdf')).toBe(sha(PDF_A));
    expect(bySha.get('2017/Tong dat/ban-sao-bien-ban.pdf')).toBe(sha(PDF_A));

    const rep = await apiFor(U.imp).report(batch);
    expect(rep).toMatchObject({ status: 'OPEN', fileCount: 5, uniqueObjects: 4 });
    // Không tạo hồ sơ nghiệp vụ nào.
    expect(await dbCount(`SELECT count(*) AS n FROM dms_case_files`)).toBe(0);
  });

  it('chạy lại với sổ cũ: không làm gì thêm; với sổ mới: nhận ra tất cả là đã có, không tải lại', async () => {
    const before = store.puts;
    const same = await runImport({
      root: src,
      batchId: batch,
      api: apiFor(U.imp),
      ledger: await Ledger.open(join(work, 'ledger1.jsonl')),
    });
    expect(same.alreadyDone).toBe(5);
    expect(same.registered).toBe(0);
    const fresh = await runImport({
      root: src,
      batchId: batch,
      api: apiFor(U.imp),
      ledger: await Ledger.open(join(work, 'ledger-fresh.jsonl')),
    });
    expect(fresh.failed).toEqual([]);
    expect(fresh.deduplicated).toBe(5);
    expect(store.puts).toBe(before);
    expect(
      await dbCount(`SELECT count(*) AS n FROM dms_legacy_files WHERE batch_id = $1`, [batch]),
    ).toBe(5);
  });

  it('đứt mạng giữa chừng: tự thử lại; lỗi bền thì tệp đó báo lỗi, phần còn lại vẫn xong và chạy lại sẽ làm nốt', async () => {
    const src2 = join(work, 'kho-2');
    mkdirSync(src2, { recursive: true });
    const flaky = Buffer.from('%PDF-1.4\nflaky');
    const broken = Buffer.from('%PDF-1.4\nbroken');
    const fine = Buffer.from('%PDF-1.4\nfine');
    writeFileSync(join(src2, 'flaky.pdf'), flaky);
    writeFileSync(join(src2, 'broken.pdf'), broken);
    writeFileSync(join(src2, 'fine.pdf'), fine);
    const b2 = (await apiFor(U.imp).openBatch(OFF, 'Kho 2')).label;
    const keyOf = (b: Buffer) => `t/${T}/legacy/${OFF}/${sha(b).slice(0, 2)}/${sha(b)}`;
    store.failPutFor.set(keyOf(flaky), { status: 503, times: 2 });
    store.failPutFor.set(keyOf(broken), { status: 500, times: 99 });
    const ledger = await Ledger.open(join(work, 'ledger2.jsonl'));
    const first = await runImport({
      root: src2,
      batchId: b2,
      api: apiFor(U.imp, { maxRetries: 3 }),
      ledger,
    });
    expect(first.registered).toBe(2);
    expect(first.failed.map((f) => f.relPath)).toEqual(['broken.pdf']);
    expect(ledger.summary()).toEqual({ registered: 2, failed: 1 });

    store.failPutFor.clear();
    const second = await runImport({
      root: src2,
      batchId: b2,
      api: apiFor(U.imp),
      ledger: await Ledger.open(join(work, 'ledger2.jsonl')),
    });
    expect(second.alreadyDone).toBe(2);
    expect(second.registered).toBe(1);
    expect(second.failed).toEqual([]);
    expect(
      await dbCount(`SELECT count(*) AS n FROM dms_legacy_files WHERE batch_id = $1`, [b2]),
    ).toBe(3);
    await apiFor(U.imp).close(b2);
  });

  it('tệp thay đổi giữa lúc tính hash và lúc tải thì không đăng ký nội dung nửa vời', async () => {
    const src3 = join(work, 'kho-3');
    mkdirSync(src3, { recursive: true });
    writeFileSync(join(src3, 'doi.pdf'), '%PDF-1.4\nv1');
    const b3 = (await apiFor(U.imp).openBatch(OFF, 'Kho 3')).label;
    const api = apiFor(U.imp);
    const real = api.prepare.bind(api);
    api.prepare = async (...a) => {
      writeFileSync(join(src3, 'doi.pdf'), '%PDF-1.4\nv2 dai hon'); // sửa tệp sau khi đã hash
      return real(...a);
    };
    const sum = await runImport({
      root: src3,
      batchId: b3,
      api,
      ledger: await Ledger.open(join(work, 'ledger3.jsonl')),
    });
    // Kho kiểm tra sha256 khi nhận nên nội dung đã đổi bị từ chối: tệp báo lỗi, KHÔNG đăng ký nội dung nửa vời.
    expect(sum.registered).toBe(0);
    expect(sum.failed).toHaveLength(1);
    expect(
      await dbCount(`SELECT count(*) AS n FROM dms_legacy_files WHERE batch_id = $1`, [b3]),
    ).toBe(0);
    // Chạy lại: tệp đã ổn định ở bản mới, được hash lại và nhập bình thường.
    const again = await runImport({
      root: src3,
      batchId: b3,
      api: apiFor(U.imp),
      ledger: await Ledger.open(join(work, 'ledger3.jsonl')),
    });
    expect(again.failed).toEqual([]);
    expect(again.registered).toBe(1);
  });

  it('API từ chối: đường dẫn nguy hiểm, hash sai định dạng, đợt đã đóng', async () => {
    const api = apiFor(U.imp);
    const meta = { relPath: '../thoat.pdf', size: 1, sha256: sha('x'), mime: 'application/pdf' };
    await expect(api.prepare(batch, meta)).rejects.toMatchObject({ status: 400 });
    await expect(
      api.prepare(batch, { ...meta, relPath: 'a.pdf', sha256: 'XYZ' }),
    ).rejects.toMatchObject({ status: 400 });
    await api.close(batch);
    await expect(api.prepare(batch, { ...meta, relPath: 'moi.pdf' })).rejects.toMatchObject({
      status: 409,
      code: 'BATCH_CLOSED',
    });
    await expect(api.close(batch)).rejects.toMatchObject({ status: 409 });
  });

  it('complete từ chối khi tệp chưa tới kho hoặc sai kích thước', async () => {
    const b4 = (await apiFor(U.imp).openBatch(OFF, 'Kho 4')).label;
    const api = apiFor(U.imp);
    const meta = {
      relPath: 'chua-tai.pdf',
      size: 5,
      sha256: sha('chua-tai'),
      mime: 'application/pdf',
    };
    await expect(api.complete(b4, meta)).rejects.toMatchObject({
      status: 409,
      code: 'UPLOAD_NOT_COMPLETE',
    });
    const up = await api.prepare(b4, meta);
    expect(up.status).toBe('UPLOAD');
    // Tải đúng nội dung 5 byte rồi khai sai kích thước.
    const body = Buffer.from('chua-');
    await store.put(`t/${T}/legacy/${OFF}/${meta.sha256.slice(0, 2)}/${meta.sha256}`, body);
    await expect(api.complete(b4, { ...meta, size: 9 })).rejects.toMatchObject({
      status: 422,
      code: 'UPLOAD_SIZE_MISMATCH',
    });
    await expect(api.complete(b4, meta)).resolves.toMatchObject({ code: 'LEGACY_FILE_REGISTERED' });
  });

  it('xem: chỉ người có dms.legacy.read; liệt kê theo thư mục; tải về đúng nội dung; mỗi lần mở có nhật ký', async () => {
    const denied = await get(`/dms/legacy/files?officeId=${OFF}&prefix=2017/`, U.imp);
    expect(denied.json.rows).toEqual([]);
    const list = await get(
      `/dms/legacy/files?officeId=${OFF}&prefix=${encodeURIComponent('2017/Tong dat/')}`,
      U.rd,
    );
    expect(list.status).toBe(200);
    expect(list.json.rows.map((r: { rel_path: string }) => r.rel_path)).toEqual([
      '2017/Tong dat/Công văn số 12.pdf',
      '2017/Tong dat/ban-sao-bien-ban.pdf',
      '2017/Tong dat/ghi-chu.docx',
    ]);
    const id = list.json.rows[1].id as string;
    expect((await get(`/dms/legacy/files/${id}/download`, U.none)).status).toBe(404);
    expect((await get(`/dms/legacy/files/${id}/download`, U.imp)).status).toBe(404);
    const dl = await get(`/dms/legacy/files/${id}/download`, U.rd);
    expect(dl.status).toBe(200);
    const bytes = Buffer.from(await (await fetch(dl.json.url)).arrayBuffer());
    expect(bytes.equals(PDF_A)).toBe(true);
    expect(
      await dbCount(
        `SELECT count(*) AS n FROM dms_audit_records WHERE action = 'dms.legacy.open' AND target_id = $1`,
        [id],
      ),
    ).toBe(1);
  });

  it('không có đường xoá hay ghi đè qua API; ApiError mang mã để công cụ báo rõ', async () => {
    for (const method of ['DELETE', 'PUT', 'PATCH']) {
      const res = await fetch(`${base}/dms/legacy/files/${randomUUID()}`, {
        method,
        headers: hdr(U.imp),
      });
      expect(res.status).toBe(404);
    }
    expect(new ApiError(409, 'BATCH_CLOSED').message).toBe('409 BATCH_CLOSED');
  });
});
