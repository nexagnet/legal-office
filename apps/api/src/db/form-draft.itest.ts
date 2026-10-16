import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';

// Cần PostgreSQL tạm. HTTP thật + DB thật + vai legal_app có RLS. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_form_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('bản nháp biểu mẫu N qua HTTP (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  const U = { admin: id(), thv: id(), clerk: id(), acc: id(), outsider: id() };

  const post = async (path: string, user: string | null, body?: unknown) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (user) {
      headers['x-synthetic-user'] = user;
      headers['x-synthetic-tenant'] = T;
    }
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { res, bytes: Buffer.from(await res.arrayBuffer()) };
  };
  const json = (b: Buffer) => JSON.parse(b.toString('utf8')) as Record<string, unknown>;

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
      AppModule.register({ pool: appPool, resolver: new SyntheticHeaderResolver() }),
      { logger: false },
    );
    await server.listen(0);
    base = (await server.getUrl()).replace('[::1]', 'localhost');

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A')`, [T]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [OFF, T]);
    const people: [string, string | null][] = [
      [U.admin, 'ADMIN'],
      [U.thv, 'THV'],
      [U.clerk, 'VAN_THU'],
      [U.acc, 'KE_TOAN'],
      [U.outsider, null],
    ];
    for (const [uid, role] of people) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        role ?? 'out',
      ]);
      if (role) {
        await owner.query(
          `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4)`,
          [T, uid, OFF, role],
        );
      }
    }
  });

  afterAll(async () => {
    await server?.close();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('returns a DOCX draft for allowed roles and audits every request', async () => {
    for (const who of [U.admin, U.thv, U.clerk]) {
      const r = await post('/office/forms/N-02/draft', who, { officeId: OFF, input: {} });
      expect(r.res.status).toBe(200);
      expect(r.res.headers.get('content-type')).toContain('wordprocessingml.document');
      expect(r.res.headers.get('content-disposition')).toContain('ban-nhap-n-02.docx');
      expect(r.bytes.subarray(0, 2).toString()).toBe('PK');
    }
    const audit = await owner.query(
      `SELECT outcome, count(*)::int AS n FROM audit_log WHERE action = 'form.draft' GROUP BY outcome`,
    );
    expect(audit.rows).toEqual([{ outcome: 'allow', n: 3 }]);
  });

  it('denies accountants and outsiders, rejects unknown forms, bad input and anonymous callers', async () => {
    for (const who of [U.acc, U.outsider]) {
      const r = await post('/office/forms/N-02/draft', who, { officeId: OFF, input: {} });
      expect(r.res.status).toBe(403);
      expect(json(r.bytes).code).toBe('ROLE_LACKS_PERMISSION');
    }
    const denied = await owner.query(
      `SELECT count(*)::int AS n FROM audit_log WHERE action = 'form.draft' AND outcome = 'deny'`,
    );
    expect(denied.rows[0].n).toBe(2);
    expect((await post('/office/forms/N-99/draft', U.admin, { officeId: OFF })).res.status).toBe(
      404,
    );
    expect((await post('/office/forms/N-02/draft', U.admin, { officeId: 'x' })).res.status).toBe(
      400,
    );
    expect(
      (await post('/office/forms/N-02/draft', U.admin, { officeId: OFF, extra: 1 })).res.status,
    ).toBe(400);
    expect((await post('/office/forms/N-02/draft', null, { officeId: OFF })).res.status).toBe(401);
  });
});
