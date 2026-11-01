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

  const G = { clerk: id(), reader: id(), otherOffice: id() };
  const OFF2 = id();
  const add = (user: string | null, body: Record<string, unknown>) =>
    api('POST', '/admin/members', user, {
      officeId: OFF,
      email: 'Moi@Example.TEST',
      fullName: 'Người Mới',
      groupIds: [G.clerk],
      reason: 'nhân sự mới giả lập',
      ...body,
    });
  const membership = async (email: string) =>
    (
      await owner.query(
        `SELECT m.role, m.legal_signer,
                coalesce((SELECT array_agg(g.name ORDER BY g.name) FROM dms_group_members gm
                          JOIN dms_permission_groups g ON g.id = gm.group_id WHERE gm.user_id = m.user_id), ARRAY[]::text[]) AS groups
           FROM memberships m JOIN auth_credentials c ON c.user_id = m.user_id WHERE c.email = $1`,
        [email],
      )
    ).rows;

  it('creates the account with no role and puts it in the chosen groups at once (Admin applies directly)', async () => {
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP B')`, [OFF2, T]);
    await owner.query(
      `INSERT INTO dms_permission_groups (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'Văn thư'),($4,$2,$3,'Đọc'),($5,$2,$6,'Khác VP')`,
      [G.clerk, T, OFF, G.reader, G.otherOffice, OFF2],
    );
    await owner.query(
      `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,'vtden.read.own')`,
      [T, G.clerk],
    );
    const r = await add(U.admin, {
      temporaryPassword: 'mat-khau-tam-12345',
      groupIds: [G.clerk, G.reader, G.clerk],
    });
    expect(r.status).toBe(200);
    const uid = r.json.label as string;
    expect(await membership('moi@example.test')).toEqual([
      { role: 'THANH_VIEN', legal_signer: false, groups: ['Văn thư', 'Đọc'] },
    ]);
    const cred = await owner.query(
      `SELECT c.password_hash, u.full_name, u.external_ref FROM auth_credentials c JOIN users u ON u.id = c.user_id WHERE c.email = 'moi@example.test'`,
    );
    expect(cred.rows[0].full_name).toBe('Người Mới');
    expect(await verifyPassword('mat-khau-tam-12345', cred.rows[0].password_hash)).toBe(true);
    // Hiệu lực ngay, nhưng chỉ theo nhóm: không quyền nào từ vai.
    const eff = await api('GET', `/dms/me/permissions?officeId=${OFF}`, uid);
    expect(JSON.stringify(eff.json)).toContain('vtden.read.own');
    expect(JSON.stringify(eff.json)).not.toContain('dms.permission');
    // Nhật ký phân quyền có hai yêu cầu ADD_MEMBER do Admin áp dụng trực tiếp.
    const reqs = await owner.query(
      `SELECT kind, status, auto_applied FROM dms_permission_requests WHERE user_id = $1`,
      [uid],
    );
    expect(reqs.rows).toEqual([
      { kind: 'ADD_MEMBER', status: 'APPROVED', auto_applied: true },
      { kind: 'ADD_MEMBER', status: 'APPROVED', auto_applied: true },
    ]);
    const list = await api('GET', `/office/members?officeId=${OFF}`, U.admin);
    expect(JSON.stringify(list.json)).toContain('Người Mới (moi@example.test)');
  });

  it('allows no group at all and rejects bad input without leaving a half-made person', async () => {
    expect((await add(U.admin, { email: 'trong@example.test', groupIds: [] })).status).toBe(200);
    expect(await membership('trong@example.test')).toEqual([
      { role: 'THANH_VIEN', legal_signer: false, groups: [] },
    ]);
    expect((await add(U.admin, { email: 'a1@example.test', groupIds: [id()] })).status).toBe(404);
    expect(
      (await add(U.admin, { email: 'a2@example.test', groupIds: [G.otherOffice] })).status,
    ).toBe(404);
    expect(
      (await add(U.admin, { email: 'a3@example.test', temporaryPassword: 'ngan' })).status,
    ).toBe(400);
    expect((await add(U.admin, { email: 'khong-hop-le' })).status).toBe(422);
    expect((await add(U.admin, { email: 'a5@example.test', reason: ' ' })).status).toBe(400);
    expect((await add(U.admin, { email: 'a6@example.test', role: 'ADMIN' })).status).toBe(400);
    const none = await owner.query(`SELECT 1 FROM auth_credentials WHERE email ~ '^a[1-6]@'`);
    expect(none.rowCount).toBe(0);
  });

  it('without a temporary password the stored hash matches no guessable password', async () => {
    const r = await add(U.admin, { email: 'link@example.test' });
    expect(r.status).toBe(200);
    const h = await owner.query(
      `SELECT password_hash FROM auth_credentials WHERE email = 'link@example.test'`,
    );
    expect(await verifyPassword('', h.rows[0].password_hash)).toBe(false);
  });

  it('refuses duplicate emails and callers without approve permission or from another tenant', async () => {
    expect((await add(U.admin, {})).status).toBe(409);
    for (const u of [U.head, U.clerk])
      expect((await add(u, { email: 'x@example.test' })).status).toBe(403);
    expect((await add(null, { email: 'x@example.test' })).status).toBe(401);
    expect((await add(U.otherAdmin, { email: 'x@example.test' })).status).toBe(403);
    const none = await owner.query(`SELECT 1 FROM auth_credentials WHERE email = 'x@example.test'`);
    expect(none.rowCount).toBe(0);
    const audit = await owner.query(
      `SELECT outcome FROM audit_log WHERE action = 'ad.member.create' AND reason = 'ADMIN_ONLY'`,
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
