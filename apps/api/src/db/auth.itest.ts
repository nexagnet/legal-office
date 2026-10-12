import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { hashPassword } from '../auth/password';

// Cần PostgreSQL tạm. Email, mật khẩu và người dùng đều giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_auth_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const ORIGIN = 'http://localhost:3000';

describe.skipIf(!ADMIN_URL)('email + password sessions over PostgreSQL (synthetic)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const U = { admin: id(), thv: id(), other: id() };
  const PW = 'mat-khau-gia-lap-1';

  const call = async (
    method: string,
    path: string,
    opts: { body?: unknown; cookie?: string; origin?: string } = {},
  ) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.cookie) headers.cookie = opts.cookie;
    if (opts.origin) headers.origin = opts.origin;
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    return {
      status: res.status,
      headers: res.headers,
      json: text ? (JSON.parse(text) as Record<string, unknown>) : {},
    };
  };
  const login = (email: string, password: string, tenantId = T) =>
    call('POST', '/auth/login', { body: { tenantId, email, password } });
  const cookieOf = (r: { headers: Headers }) => r.headers.get('set-cookie')!.split(';')[0]!;
  const session = async (email = 'admin@example.test') => {
    const r = await login(email, PW);
    expect(r.status).toBe(200);
    return cookieOf(r);
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
        resolver: 'session',
        auth: { sessionTtlMinutes: 60, secureCookie: false, allowedOrigins: [ORIGIN] },
      }),
      { logger: false },
    );
    await server.listen(0);
    base = (await server.getUrl()).replace('[::1]', 'localhost');

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [OFF, T]);
    const hash = await hashPassword(PW);
    for (const [uid, role, email] of [
      [U.admin, 'ADMIN', 'admin@example.test'],
      [U.thv, 'THV', 'thv@example.test'],
    ] as const) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        role,
      ]);
      await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role, legal_signer) VALUES ($1,$2,$3,$4,$5)`,
        [T, uid, OFF, role, role === 'ADMIN'],
      );
      await owner.query(
        `INSERT INTO auth_credentials (tenant_id, user_id, email, password_hash) VALUES ($1,$2,$3,$4)`,
        [T, uid, email, hash],
      );
    }
    await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,'x')`, [
      U.other,
      T2,
    ]);
  });

  afterAll(async () => {
    await server?.close();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('logs in with a safe cookie, never exposes the token, and answers generically on failure', async () => {
    const bad = await login('admin@example.test', 'sai-mat-khau-xx');
    const unknown = await login('khong-co@example.test', PW);
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.json).toEqual(unknown.json);
    expect((await login('admin@example.test', PW, T2)).status).toBe(401);
    expect((await call('POST', '/auth/login', { body: { email: 'a@b.c' } })).status).toBe(400);

    const ok = await login('  ADMIN@Example.test ', PW);
    expect(ok.status).toBe(200);
    const raw = ok.headers.get('set-cookie')!;
    expect(raw).toMatch(/HttpOnly/);
    expect(raw).toMatch(/SameSite=Strict/);
    expect(raw).toMatch(/Path=\//);
    expect(JSON.stringify(ok.json)).not.toContain(cookieOf(ok).split('=')[1]!.split('.')[1]!);
    const token = cookieOf(ok).split('.')[1]!;
    const stored = await owner.query(`SELECT token_hash FROM auth_sessions`);
    expect(stored.rows.every((r) => r.token_hash !== token && r.token_hash.length === 64)).toBe(
      true,
    );
    const hashes = await owner.query(`SELECT password_hash FROM auth_credentials`);
    expect(hashes.rows.every((r) => r.password_hash.startsWith('scrypt$'))).toBe(true);

    const me = await call('GET', '/auth/me', { cookie: cookieOf(ok) });
    expect(me.status).toBe(200);
    expect(me.json).toMatchObject({
      userId: U.admin,
      tenantId: T,
      memberships: [{ officeId: OFF, role: 'ADMIN', legalSigner: true }],
    });
    expect((await call('GET', '/auth/me')).status).toBe(401);
    expect((await call('GET', '/auth/me', { cookie: 'lo_session=nonsense' })).status).toBe(401);
    expect((await call('GET', '/auth/me', { cookie: `lo_session=${T2}.${token}` })).status).toBe(
      401,
    );
  });

  it('locks the account after five failures, even for the right password, and audits it', async () => {
    for (let i = 0; i < 4; i += 1) {
      expect((await login('thv@example.test', 'sai-mat-khau-xx')).status).toBe(401);
    }
    const fifth = await login('thv@example.test', 'sai-mat-khau-xx');
    expect(fifth.status).toBe(429);
    expect(fifth.headers.get('retry-after')).toBe('900');
    expect((await login('thv@example.test', PW)).status).toBe(429);
    const audit = await owner.query(
      `SELECT reason FROM audit_log WHERE action = 'auth.login' AND outcome = 'deny' AND actor_id = $1`,
      [U.thv],
    );
    expect(audit.rows.map((r) => r.reason)).toContain('ACCOUNT_LOCKED');
    await owner.query(
      `UPDATE auth_credentials SET locked_until = now() - interval '1 minute' WHERE user_id = $1`,
      [U.thv],
    );
    expect((await login('thv@example.test', PW)).status).toBe(200);
    const counter = await owner.query(
      `SELECT failed_attempts FROM auth_credentials WHERE user_id = $1`,
      [U.thv],
    );
    expect(counter.rows[0].failed_attempts).toBe(0);
  });

  it('logout and expiry end the session', async () => {
    const c1 = await session();
    expect((await call('POST', '/auth/logout', { cookie: c1 })).status).toBe(200);
    expect((await call('GET', '/auth/me', { cookie: c1 })).status).toBe(401);
    const c2 = await session();
    await owner.query(`UPDATE auth_sessions SET expires_at = now() - interval '1 second'`);
    expect((await call('GET', '/auth/me', { cookie: c2 })).status).toBe(401);
  });

  it('lets only an Admin set passwords, revokes old sessions, and enforces policy and uniqueness', async () => {
    const adminCookie = await session();
    const thvCookie = await session('thv@example.test');
    const url = `/auth/users/${U.thv}/password`;
    const body = { email: 'thv@example.test', password: 'mat-khau-moi-gia-lap-2' };
    expect((await call('PUT', url, { cookie: thvCookie, body })).status).toBe(403);
    expect((await call('PUT', url, { body })).status).toBe(401);
    expect(
      (await call('PUT', url, { cookie: adminCookie, body: { ...body, password: 'ngan' } })).status,
    ).toBe(422);
    expect(
      (await call('PUT', url, { cookie: adminCookie, body: { ...body, email: 'khong-hop-le' } }))
        .status,
    ).toBe(422);
    expect(
      (await call('PUT', `/auth/users/${id()}/password`, { cookie: adminCookie, body })).status,
    ).toBe(404);
    expect(
      (
        await call('PUT', url, {
          cookie: adminCookie,
          body: { ...body, email: 'admin@example.test' },
        })
      ).status,
    ).toBe(409);
    expect((await call('PUT', url, { cookie: adminCookie, body })).status).toBe(200);
    expect((await call('GET', '/auth/me', { cookie: thvCookie })).status).toBe(401);
    expect((await login('thv@example.test', PW)).status).toBe(401);
    expect((await login('thv@example.test', body.password)).status).toBe(200);
    // Admin của tenant khác không đặt được mật khẩu cho người dùng tenant này.
    expect(
      (await call('PUT', `/auth/users/${U.other}/password`, { cookie: adminCookie, body })).status,
    ).toBe(404);
  });

  it('rejects state-changing calls from a foreign Origin', async () => {
    const cookie = await session();
    const url = `/auth/users/${U.thv}/password`;
    const body = { email: 'thv@example.test', password: 'mat-khau-moi-gia-lap-3' };
    expect((await call('PUT', url, { cookie, body, origin: 'https://evil.example' })).status).toBe(
      401,
    );
    expect((await call('PUT', url, { cookie, body, origin: ORIGIN })).status).toBe(200);
    expect((await call('GET', '/auth/me', { cookie, origin: 'https://evil.example' })).status).toBe(
      200,
    );
  });
});
