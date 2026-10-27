import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';
import { verifyPassword } from '../auth/password';

// Cần PostgreSQL tạm. HTTP thật + DB thật + vai legal_app có RLS. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_member_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('Add member + branches (HTTP + PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const BR = id();
  const U = { admin: id(), head: id(), clerk: id(), otherAdmin: id() };

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
      AppModule.register({ pool: appPool, resolver: new SyntheticHeaderResolver() }),
      { logger: false },
    );
    await server.listen(0);
    base = (await server.getUrl()).replace('[::1]', 'localhost');

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [OFF, T]);
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN1')`,
      [BR, T, OFF],
    );
    const people: [string, string, string][] = [
      [U.admin, 'ADMIN', 'admin@x.test'],
      [U.head, 'TRUONG_VP', 'head@x.test'],
      [U.clerk, 'VAN_THU', 'clerk@x.test'],
    ];
    for (const [uid, role, ref] of people) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        ref,
      ]);
      await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4)`,
        [T, uid, OFF, role],
      );
    }
    await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,'o2')`, [
      U.otherAdmin,
      T2,
    ]);
  });

  afterAll(async () => {
    await server?.close();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const add = (user: string | null, body: Record<string, unknown>) =>
    api('POST', '/admin/members', user, {
      officeId: OFF,
      email: 'Moi@Example.TEST',
      fullName: 'Người Mới',
      role: 'VAN_THU',
      reason: 'nhân sự mới giả lập',
      ...body,
    });
  const memberships = async (email: string) =>
    (
      await owner.query(
        `SELECT m.role, m.legal_signer, (SELECT count(*) FROM branch_grants g WHERE g.membership_id = m.id)::int AS grants
           FROM memberships m JOIN auth_credentials c ON c.user_id = m.user_id WHERE c.email = $1`,
        [email],
      )
    ).rows;

  it('creates the account but grants no role until a different Head approves', async () => {
    const r = await add(U.admin, { branchId: BR, temporaryPassword: 'mat-khau-tam-12345' });
    expect(r.status).toBe(200);
    const rid = r.json.label as string;
    expect(await memberships('moi@example.test')).toEqual([]);
    const cred = await owner.query(
      `SELECT c.password_hash, u.full_name, u.external_ref FROM auth_credentials c JOIN users u ON u.id = c.user_id WHERE c.email = 'moi@example.test'`,
    );
    expect(cred.rows[0].full_name).toBe('Người Mới');
    expect(await verifyPassword('mat-khau-tam-12345', cred.rows[0].password_hash)).toBe(true);

    expect(
      (await api('POST', `/admin/access-requests/${rid}/decision`, U.admin, { approve: true }))
        .status,
    ).toBe(403);
    expect(
      (await api('POST', `/admin/access-requests/${rid}/decision`, U.head, { approve: true }))
        .status,
    ).toBe(200);
    expect(await memberships('moi@example.test')).toEqual([
      { role: 'VAN_THU', legal_signer: false, grants: 1 },
    ]);

    const list = await api('GET', `/admin/access-requests?officeId=${OFF}`, U.head);
    expect(JSON.stringify(list.json)).toContain('Người Mới (moi@example.test)');
  });

  it('applies the legal-signer flag on approval and rejects bad combinations', async () => {
    const r = await add(U.admin, {
      email: 'tp@example.test',
      role: 'TRUONG_VP',
      legalSigner: true,
    });
    expect(r.status).toBe(200);
    await api('POST', `/admin/access-requests/${r.json.label}/decision`, U.head, { approve: true });
    expect(await memberships('tp@example.test')).toEqual([
      { role: 'TRUONG_VP', legal_signer: true, grants: 0 },
    ]);

    expect(
      (await add(U.admin, { email: 'a1@example.test', role: 'THV', legalSigner: true })).status,
    ).toBe(422);
    expect(
      (await add(U.admin, { email: 'a2@example.test', role: 'THV', branchId: BR })).status,
    ).toBe(422);
    expect((await add(U.admin, { email: 'a3@example.test', branchId: id() })).status).toBe(404);
    expect(
      (await add(U.admin, { email: 'a4@example.test', temporaryPassword: 'ngan' })).status,
    ).toBe(400);
    expect((await add(U.admin, { email: 'khong-hop-le' })).status).toBe(422);
    expect((await add(U.admin, { email: 'a5@example.test', reason: ' ' })).status).toBe(400);
    const none = await owner.query(`SELECT 1 FROM auth_credentials WHERE email ~ '^a[1-5]@'`);
    expect(none.rowCount).toBe(0);
  });

  it('without a temporary password the stored hash matches no guessable password', async () => {
    const r = await add(U.admin, { email: 'link@example.test', role: 'THU_KY' });
    expect(r.status).toBe(200);
    const h = await owner.query(
      `SELECT password_hash FROM auth_credentials WHERE email = 'link@example.test'`,
    );
    expect(await verifyPassword('', h.rows[0].password_hash)).toBe(false);
  });

  it('refuses duplicate emails and non-Admin or cross-tenant callers; rejection leaves no role', async () => {
    expect((await add(U.admin, {})).status).toBe(409);
    for (const u of [U.head, U.clerk])
      expect((await add(u, { email: 'x@example.test' })).status).toBe(403);
    expect((await add(null, { email: 'x@example.test' })).status).toBe(401);
    expect((await add(U.otherAdmin, { email: 'x@example.test' })).status).toBe(403);
    const r = await add(U.admin, { email: 'tuchoi@example.test' });
    expect(
      (
        await api('POST', `/admin/access-requests/${r.json.label}/decision`, U.head, {
          approve: false,
          note: 'không cần',
        })
      ).status,
    ).toBe(200);
    expect(await memberships('tuchoi@example.test')).toEqual([]);
    const audit = await owner.query(
      `SELECT outcome FROM audit_log WHERE action = 'ad.member.add' AND reason = 'ADMIN_ONLY'`,
    );
    expect(audit.rowCount).toBeGreaterThanOrEqual(2);
  });

  it('adds and renames branches with unique names, Admin only, audited', async () => {
    const c = await api('POST', '/admin/branches', U.admin, { officeId: OFF, name: '  Đông Anh ' });
    expect(c.status).toBe(200);
    const bid = c.json.label as string;
    expect(
      (await api('POST', '/admin/branches', U.admin, { officeId: OFF, name: 'đông anh' })).status,
    ).toBe(409);
    expect(
      (await api('POST', '/admin/branches', U.head, { officeId: OFF, name: 'Bắc Ninh' })).status,
    ).toBe(403);
    expect(
      (await api('POST', '/admin/branches', U.admin, { officeId: OFF, name: '   ' })).status,
    ).toBe(400);
    expect(
      (await api('PATCH', `/admin/branches/${bid}`, U.admin, { officeId: OFF, name: 'CN1' }))
        .status,
    ).toBe(409);
    expect(
      (await api('PATCH', `/admin/branches/${bid}`, U.admin, { officeId: OFF, name: 'Đông Anh 2' }))
        .status,
    ).toBe(200);
    expect(
      (await api('PATCH', `/admin/branches/${id()}`, U.admin, { officeId: OFF, name: 'Z' })).status,
    ).toBe(404);
    expect(
      (await api('PATCH', `/admin/branches/${bid}`, U.otherAdmin, { officeId: OFF, name: 'Z' }, T2))
        .status,
    ).toBe(403);
    const names = await owner.query(
      `SELECT name FROM branches WHERE tenant_id = $1 ORDER BY name`,
      [T],
    );
    expect(names.rows.map((r) => r.name)).toEqual(['CN1', 'Đông Anh 2']);
    const audit = await owner.query(
      `SELECT action FROM audit_log WHERE action LIKE 'ad.branch.%' AND outcome = 'allow'`,
    );
    expect(audit.rowCount).toBe(2);
  });

  it('forbids the Head from approving a request about themselves', async () => {
    const p = await api('POST', '/admin/access-requests', U.admin, {
      officeId: OFF,
      targetUserId: U.head,
      kind: 'GRANT_ROLE',
      role: 'THU_KY',
      reason: 'kiêm nhiệm',
    });
    expect(p.status).toBe(200);
    const d = await api('POST', `/admin/access-requests/${p.json.label}/decision`, U.head, {
      approve: true,
    });
    expect(d.status).toBe(403);
    expect(d.json.code).toBe('SELF_TARGET_NOT_ALLOWED');
  });
});
