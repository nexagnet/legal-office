import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
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
import { LocalFileStore } from '../storage/file-store';

// Cần PostgreSQL tạm. HTTP thật + DB thật + vai legal_app có RLS. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_tdev_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('Tống đạt scoped list (HTTP + PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const id = () => randomUUID();
  const storeDir = mkdtempSync(join(tmpdir(), 'lo-td-'));
  const store = new LocalFileStore(storeDir);
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

  const SOD = '/service-of-documents';
  const newDoc = async (branch: string, creator: string, handler: string | null) => {
    const req = (
      await api('POST', `${SOD}/requests`, creator, {
        officeId: OFF,
        branchId: branch,
        requestRef: 'N-01/' + id().slice(0, 8),
      })
    ).json.label as string;
    const doc = (
      await api('POST', `${SOD}/requests/${req}/documents`, creator, {
        recipientName: 'Người nhận giả lập',
        address: 'Địa chỉ giả lập',
        deadlineAt: '2026-12-01T00:00:00Z',
      })
    ).json.label as string;
    if (handler) {
      expect(
        (await api('PUT', `${SOD}/documents/${doc}/handler`, U.admin, { handlerUserId: handler }))
          .status,
      ).toBe(200);
    }
    return doc;
  };

  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    Buffer.from('biên bản giả lập'),
  ]);
  const serve = async (doc: string, user: string, body: Buffer, type = 'image/png') => {
    const res = await fetch(`${base}${SOD}/documents/${doc}/served`, {
      method: 'POST',
      headers: { 'content-type': type, 'x-synthetic-user': user, 'x-synthetic-tenant': T },
      body,
    });
    const t = await res.text();
    return { status: res.status, json: t ? (JSON.parse(t) as Record<string, unknown>) : {} };
  };
  const state = async (doc: string) =>
    (await owner.query(`SELECT status FROM td_documents WHERE id = $1`, [doc])).rows[0]
      .status as string;

  it('stores the N-02 evidence, hashes it and marks the document delivered', async () => {
    const doc = await newDoc(BR1, U.clerk1, U.thvA);
    const r = await serve(doc, U.thvA, PNG);
    expect(r.status).toBe(200);
    const a = await owner.query(
      `SELECT outcome, evidence_key, evidence_sha256 FROM td_attempts WHERE document_id = $1`,
      [doc],
    );
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0].outcome).toBe('SERVED');
    expect(a.rows[0].evidence_sha256).toBe(createHash('sha256').update(PNG).digest('hex'));
    expect(String(a.rows[0].evidence_key).startsWith(`t/${T}/td/${doc}/evidence/`)).toBe(true);
    expect(await store.get(a.rows[0].evidence_key)).toEqual(PNG);
    expect(await state(doc)).toBe('DELIVERED');
  });

  it('refuses a THV who is not the handler and leaves no orphan file or attempt', async () => {
    const doc = await newDoc(BR1, U.clerk1, U.thvA);
    expect((await serve(doc, U.thvB, PNG)).status).toBe(403);
    expect((await serve(doc, U.clerk1, PNG)).status).toBe(403);
    expect(
      (await owner.query(`SELECT 1 FROM td_attempts WHERE document_id = $1`, [doc])).rowCount,
    ).toBe(0);
    expect(await state(doc)).toBe('ASSIGNED');
  });

  it('validates the file and the document state', async () => {
    const doc = await newDoc(BR1, U.clerk1, U.thvA);
    expect((await serve(doc, U.thvA, Buffer.from('không phải ảnh'))).status).toBe(422);
    expect((await serve(doc, U.thvA, PNG, 'text/plain')).status).toBe(422);
    expect((await serve(doc, U.thvA, Buffer.alloc(0))).status).toBe(422);
    const unassigned = await newDoc(BR1, U.clerk1, null);
    expect((await serve(unassigned, U.admin, PNG)).status).toBe(409);
    expect((await serve(id(), U.admin, PNG)).status).toBe(404);
    expect((await serve(doc, U.thvA, PNG)).status).toBe(200);
    expect((await serve(doc, U.thvA, PNG)).status).toBe(409);
  });
});
