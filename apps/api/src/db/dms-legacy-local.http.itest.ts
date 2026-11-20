import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';
import { LocalFileStore } from '../storage/file-store';

// Tài liệu cũ với kho ĐĨA (không R2): tải lên/xuống qua API, đầu-cuối với PostgreSQL thật. Toàn bộ dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsll_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

describe.skipIf(!ADMIN_URL)('Tài liệu cũ trên kho đĩa (tải qua API)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const dir = mkdtempSync(join(tmpdir(), 'lo-local-'));
  const store = new LocalFileStore(dir);
  const T = randomUUID();
  const OFF = randomUUID();
  const U = { imp: randomUUID(), rd: randomUUID() };
  const hdr = (u: string) => ({ 'x-synthetic-user': u, 'x-synthetic-tenant': T });
  const post = (path: string, u: string, body: unknown) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { ...hdr(u), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const DOC = Buffer.from('%PDF-1.4 tai lieu cu gia lap');
  const meta = (b: Buffer) => ({
    relPath: '2016/bien-ban.pdf',
    size: b.length,
    sha256: sha(b),
    mime: 'application/pdf',
  });
  let batch = '';
  const put = (u: string, qs: string, body: Buffer) =>
    fetch(`${base}/dms/legacy/batches/${batch}/files/content?${qs}`, {
      method: 'PUT',
      headers: { ...hdr(u), 'content-type': 'application/octet-stream' },
      body: new Uint8Array(body),
    });

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
    appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 4 });
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
    const open = await post('/dms/legacy/batches', U.imp, { officeId: OFF, label: 'Kho đĩa' });
    const ob = (await open.json()) as { label: string };
    batch = ob.label;
  });

  afterAll(async () => {
    await server?.close();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
    rmSync(dir, { recursive: true, force: true });
  });

  it('prepare trả đường PUT tới chính API (không có liên kết ký sẵn)', async () => {
    const res = await post(`/dms/legacy/batches/${batch}/files/prepare`, U.imp, meta(DOC));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string; url: string };
    expect(body.status).toBe('UPLOAD');
    expect(body.url).toContain(`/api/dms/legacy/batches/${batch}/files/content?sha256=${sha(DOC)}`);
  });

  it('chặn người không có quyền nhập, sai kích thước và sai sha256; không để lại tệp', async () => {
    const qs = `sha256=${sha(DOC)}&size=${DOC.length}`;
    expect((await put(U.rd, qs, DOC)).status).toBe(403);
    expect((await put(U.imp, `sha256=${sha(DOC)}&size=${DOC.length + 1}`, DOC)).status).toBe(422);
    expect((await put(U.imp, `sha256=${'0'.repeat(64)}&size=${DOC.length}`, DOC)).status).toBe(422);
    const c = await post(`/dms/legacy/batches/${batch}/files/complete`, U.imp, meta(DOC));
    expect(c.status).toBe(409);
  });

  it('tải đúng, complete đăng ký, tải xuống nhận lại đúng nội dung, không ghi đè', async () => {
    const qs = `sha256=${sha(DOC)}&size=${DOC.length}`;
    expect((await put(U.imp, qs, DOC)).status).toBe(200);
    const c = await post(`/dms/legacy/batches/${batch}/files/complete`, U.imp, meta(DOC));
    expect(c.status).toBe(201);
    const { fileId } = (await c.json()) as { fileId: string };
    const dl = await fetch(`${base}/dms/legacy/files/${fileId}/download`, { headers: hdr(U.rd) });
    expect(dl.status).toBe(200);
    expect(Buffer.from(await dl.arrayBuffer())).toEqual(DOC);
    expect((await put(U.imp, qs, DOC)).status).toBe(409);
    // Cùng nội dung lần sau: đăng ký ngay, không tải lại.
    const again = await post(`/dms/legacy/batches/${batch}/files/prepare`, U.imp, meta(DOC));
    expect(((await again.json()) as { status: string }).status).toBe('REGISTERED');
  });
});
