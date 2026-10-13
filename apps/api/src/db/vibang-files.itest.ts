import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';
import { LocalFileStore, type FileStore } from '../storage/file-store';

// Cần PostgreSQL tạm. HTTP thật + DB thật + vai legal_app có RLS. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_files_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('Vi bằng final scan upload (HTTP + file store + PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const storeDir = mkdtempSync(join(tmpdir(), 'lo-files-'));
  const store: FileStore = new LocalFileStore(storeDir);
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const BR1 = id();
  const BR2 = id();
  const U = {
    admin: id(),
    head: id(),
    secretary: id(),
    clerk1: id(),
    clerk2: id(),
    acc1: id(),
    thvA: id(),
    thvB: id(),
    outsider: id(),
    otherTenantAdmin: id(),
  };

  const api = async (
    method: string,
    path: string,
    user: string | null,
    body?: unknown,
    tenant = T,
  ) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (user) {
      headers['x-synthetic-user'] = user;
      headers['x-synthetic-tenant'] = tenant;
    }
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const t = await res.text();
    return { status: res.status, json: t ? (JSON.parse(t) as Record<string, unknown>) : {} };
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
    appPool = new pg.Pool({ connectionString: appUrl.toString(), max: 6 });
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

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [OFF, T]);
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN1'),($4,$2,$3,'CN2')`,
      [BR1, T, OFF, BR2],
    );
    const people: [string, string, string | null][] = [
      [U.admin, 'ADMIN', null],
      [U.head, 'TRUONG_VP', null],
      [U.secretary, 'THU_KY', null],
      [U.clerk1, 'VAN_THU', BR1],
      [U.clerk2, 'VAN_THU', BR2],
      [U.acc1, 'KE_TOAN', BR1],
      [U.thvA, 'THV', null],
      [U.thvB, 'THV', null],
    ];
    for (const [uid, role, branch] of people) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        role,
      ]);
      const m = await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4) RETURNING id`,
        [T, uid, OFF, role],
      );
      if (branch) {
        await owner.query(
          `INSERT INTO branch_grants (tenant_id, membership_id, branch_id) VALUES ($1,$2,$3)`,
          [T, m.rows[0].id, branch],
        );
      }
    }
    await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,'out')`, [
      U.outsider,
      T,
    ]);
    await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,'a2')`, [
      U.otherTenantAdmin,
      T2,
    ]);
  });

  afterAll(async () => {
    await server?.close();
    await owner?.end();
    rmSync(storeDir, { recursive: true, force: true });
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const customer = async () =>
    (
      await api('POST', '/vibang/customers', U.clerk1, {
        kind: 'PERSON',
        externalRef: 'KH-giả-lập',
      })
    ).json.label as string;
  const newCase = async (assign = true) => {
    const r = await api('POST', '/vibang/cases', U.clerk1, {
      officeId: OFF,
      branchId: BR1,
      customerId: await customer(),
      title: 'Hồ sơ giả lập',
    });
    const c = r.json.label as string;
    if (assign) {
      await api('PUT', `/vibang/cases/${c}/responsible-thv`, U.admin, { thvUserId: U.thvA });
    }
    return c;
  };

  const pdf = (extra = 'x') => Buffer.from(`%PDF-1.4\n% bản scan giả lập ${extra}\n%%EOF`);
  const upload = async (c: string, user: string, body: Buffer, type = 'application/pdf') => {
    const res = await fetch(`${base}/vibang/cases/${c}/final-scan`, {
      method: 'POST',
      headers: { 'content-type': type, 'x-synthetic-user': user, 'x-synthetic-tenant': T },
      body,
    });
    const t = await res.text();
    return { status: res.status, json: t ? (JSON.parse(t) as Record<string, unknown>) : {} };
  };
  /** Hồ sơ đã có số, đã ký, đã đóng dấu: đủ điều kiện nhận bản scan cuối. */
  const stampedCase = async () => {
    const c = await newCase();
    expect(
      (
        await api('PUT', `/vibang/cases/${c}/misa`, U.acc1, {
          status: 'CONFIRMED_FULL',
          reference: 'MISA-1',
        })
      ).status,
    ).toBe(200);
    expect((await api('POST', `/vibang/cases/${c}/number`, U.clerk1)).status).toBe(200);
    expect((await api('POST', `/vibang/cases/${c}/signature-confirmations`, U.thvA)).status).toBe(
      200,
    );
    expect((await api('POST', `/vibang/cases/${c}/stamp-confirmations`, U.clerk1)).status).toBe(
      200,
    );
    return c;
  };

  it('stores the scan, computes its sha256 and records the metadata', async () => {
    const c = await stampedCase();
    const file = pdf('hợp lệ');
    const r = await upload(c, U.clerk1, file);
    expect(r.status).toBe(200);
    const d = await owner.query(
      `SELECT object_key, sha256, size_bytes, mime, source, kind FROM vibang_documents WHERE case_id = $1`,
      [c],
    );
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0]).toMatchObject({
      sha256: createHash('sha256').update(file).digest('hex'),
      size_bytes: String(file.length),
      mime: 'application/pdf',
      source: 'UPLOADED',
      kind: 'FINAL_SCAN',
    });
    expect(String(d.rows[0].object_key).startsWith(`t/${T}/vibang/${c}/final-scan/`)).toBe(true);
    expect(await store.get(d.rows[0].object_key)).toEqual(file);
  });

  it('rejects a role without permission and leaves no orphan file', async () => {
    const c = await stampedCase();
    const r = await upload(c, U.acc1, pdf('kế toán'));
    expect(r.status).toBe(403);
    expect(
      (await owner.query(`SELECT 1 FROM vibang_documents WHERE case_id = $1`, [c])).rowCount,
    ).toBe(0);
    expect(existsSync(join(storeDir, 't', T, 'vibang', c, 'final-scan'))).toBe(true);
    const { readdirSync } = await import('node:fs');
    expect(readdirSync(join(storeDir, 't', T, 'vibang', c, 'final-scan'))).toHaveLength(0);
  });

  it('requires stamp confirmation first (409) and validates the file', async () => {
    const c = await newCase();
    expect((await upload(c, U.clerk1, pdf())).status).toBe(409);
    const ok = await stampedCase();
    expect((await upload(ok, U.clerk1, Buffer.from('không phải pdf'))).status).toBe(422);
    expect((await upload(ok, U.clerk1, Buffer.alloc(0))).status).toBe(422);
    expect((await upload(ok, U.clerk1, pdf(), 'text/plain')).status).toBe(422);
    expect((await upload(ok, U.outsider, pdf())).status).toBe(403);
  });

  it('rejects an oversized upload with 413', async () => {
    const c = await stampedCase();
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(26 * 1024 * 1024)]);
    expect((await upload(c, U.clerk1, big)).status).toBe(413);
  });

  it('returns 503 when no file store is configured', async () => {
    // Pool giả: kiểm tra 503 xảy ra trước mọi truy cập DB, và AppModule đóng pool khi tắt.
    const stub = { end: async () => undefined } as unknown as pg.Pool;
    const bare = await NestFactory.create(
      AppModule.register({ pool: stub, resolver: new SyntheticHeaderResolver() }),
      { logger: false },
    );
    await bare.listen(0);
    const url = (await bare.getUrl()).replace('[::1]', 'localhost');
    const res = await fetch(`${url}/vibang/cases/${id()}/final-scan`, {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'x-synthetic-user': U.clerk1,
        'x-synthetic-tenant': T,
      },
      body: pdf(),
    });
    expect(res.status).toBe(503);
    await bare.close();
  });
});
