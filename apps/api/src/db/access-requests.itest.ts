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
const DB = `lo_access_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('Two-person access changes (HTTP + PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const BR1 = id();
  const BR2 = id();
  const U = {
    admin: id(),
    admin2: id(),
    head: id(),
    secretary: id(),
    clerk: id(),
    plain: id(),
    outsider: id(),
    otherTenant: id(),
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
      AppModule.register({ pool: appPool, resolver: new SyntheticHeaderResolver() }),
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
    const people: [string, string | null][] = [
      [U.admin, 'ADMIN'],
      [U.admin2, 'ADMIN'],
      [U.head, 'TRUONG_VP'],
      [U.secretary, 'THU_KY'],
      [U.clerk, 'VAN_THU'],
      [U.plain, null],
      [U.outsider, null],
    ];
    for (const [uid, role] of people) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        role ?? 'x' + uid.slice(0, 4),
      ]);
      if (role) {
        await owner.query(
          `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4)`,
          [T, uid, OFF, role],
        );
      }
    }
    await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,'o2')`, [
      U.otherTenant,
      T2,
    ]);
  });

  afterAll(async () => {
    await server?.close();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const AR = '/admin/access-requests';
  const propose = (user: string, body: Record<string, unknown>) =>
    api('POST', AR, user, { officeId: OFF, reason: 'lý do giả lập', ...body });
  const decide = (user: string, rid: string, approve: boolean, note?: string) =>
    api('POST', `${AR}/${rid}/decision`, user, { approve, ...(note ? { note } : {}) });
  const roles = async (uid: string) =>
    (
      await owner.query(`SELECT role FROM memberships WHERE user_id = $1 ORDER BY role`, [uid])
    ).rows.map((r) => r.role as string);

  it('applies a change only after a different Head approves, and not before', async () => {
    const p = await propose(U.admin, { targetUserId: U.plain, kind: 'GRANT_ROLE', role: 'THU_KY' });
    expect(p.status).toBe(200);
    const rid = p.json.label as string;
    expect(await roles(U.plain)).toEqual([]);
    expect((await decide(U.admin, rid, true)).status).toBe(403);
    expect((await decide(U.admin2, rid, true)).status).toBe(403);
    expect(await roles(U.plain)).toEqual([]);
    expect((await decide(U.head, rid, true)).status).toBe(200);
    expect(await roles(U.plain)).toEqual(['THU_KY']);
    expect((await decide(U.head, rid, false, 'x')).status).toBe(409);
  });

  it('only an Admin proposes; non-members and other tenants are refused', async () => {
    const body = { targetUserId: U.plain, kind: 'GRANT_ROLE', role: 'KE_TOAN' };
    for (const u of [U.head, U.secretary, U.clerk, U.outsider]) {
      expect((await propose(u, body)).status).toBe(403);
    }
    expect((await api('POST', AR, null, { officeId: OFF, reason: 'x', ...body })).status).toBe(401);
    expect(
      (await api('POST', AR, U.otherTenant, { officeId: OFF, reason: 'x', ...body }, T2)).status,
    ).toBe(403);
    expect((await propose(U.admin, { ...body, reason: '' })).status).toBe(400);
    expect(
      (await propose(U.admin, { targetUserId: id(), kind: 'GRANT_ROLE', role: 'THU_KY' })).status,
    ).toBe(404);
  });

  it('protects the last Admin, validates signer and branch targets, and rejects duplicates', async () => {
    const dup = await propose(U.admin, {
      targetUserId: U.outsider,
      kind: 'GRANT_ROLE',
      role: 'THV',
    });
    expect(dup.status).toBe(200);
    expect(
      (await propose(U.admin, { targetUserId: U.outsider, kind: 'GRANT_ROLE', role: 'THV' }))
        .status,
    ).toBe(409);
    expect(
      (await propose(U.admin, { targetUserId: U.secretary, kind: 'SET_LEGAL_SIGNER', flag: true }))
        .status,
    ).toBe(422);
    expect(
      (await propose(U.admin, { targetUserId: U.secretary, kind: 'GRANT_BRANCH', branchId: BR1 }))
        .status,
    ).toBe(422);
    expect(
      (await propose(U.admin, { targetUserId: U.clerk, kind: 'GRANT_BRANCH', branchId: id() }))
        .status,
    ).toBe(404);
    expect(
      (await propose(U.admin, { targetUserId: U.secretary, kind: 'REVOKE_ROLE', role: 'ADMIN' }))
        .status,
    ).toBe(409);
    // gỡ Admin khi còn Admin khác: được; sau đó Admin cuối cùng không gỡ được.
    const r1 = await propose(U.admin, {
      targetUserId: U.admin2,
      kind: 'REVOKE_ROLE',
      role: 'ADMIN',
    });
    expect(r1.status).toBe(200);
    expect((await decide(U.head, r1.json.label as string, true)).status).toBe(200);
    expect(await roles(U.admin2)).toEqual([]);
    expect(
      (await propose(U.admin, { targetUserId: U.admin, kind: 'REVOKE_ROLE', role: 'ADMIN' }))
        .status,
    ).toBe(409);
  });

  it('grants and revokes branches and the signing flag through approval', async () => {
    const grant = await propose(U.admin, {
      targetUserId: U.clerk,
      kind: 'GRANT_BRANCH',
      branchId: BR2,
    });
    expect((await decide(U.head, grant.json.label as string, true)).status).toBe(200);
    const grants = async () =>
      (
        await owner.query(
          `SELECT g.branch_id FROM branch_grants g JOIN memberships m ON m.id = g.membership_id WHERE m.user_id = $1`,
          [U.clerk],
        )
      ).rows.map((r) => r.branch_id as string);
    expect(await grants()).toEqual([BR2]);
    const revoke = await propose(U.admin, {
      targetUserId: U.clerk,
      kind: 'REVOKE_BRANCH',
      branchId: BR2,
    });
    expect((await decide(U.head, revoke.json.label as string, true)).status).toBe(200);
    expect(await grants()).toEqual([]);
    const sign = await propose(U.admin, {
      targetUserId: U.head,
      kind: 'SET_LEGAL_SIGNER',
      flag: true,
    });
    expect((await decide(U.secretary, sign.json.label as string, true)).status).toBe(403);
    expect((await api('POST', `${AR}/${sign.json.label}/withdrawal`, U.head)).status).toBe(403);
    expect((await api('POST', `${AR}/${sign.json.label}/withdrawal`, U.admin)).status).toBe(200);
    expect((await decide(U.head, sign.json.label as string, true)).status).toBe(409);
    const again = await propose(U.admin, {
      targetUserId: U.head,
      kind: 'SET_LEGAL_SIGNER',
      flag: true,
    });
    expect((await decide(U.head, again.json.label as string, true)).status).toBe(200);
    const flag = await owner.query(`SELECT legal_signer FROM memberships WHERE user_id = $1`, [
      U.head,
    ]);
    expect(flag.rows[0].legal_signer).toBe(true);
  });

  it('records rejections, lists only to Admin/Head, and keeps requests immutable', async () => {
    const p = await propose(U.admin, {
      targetUserId: U.plain,
      kind: 'GRANT_ROLE',
      role: 'KE_TOAN',
    });
    const rid = p.json.label as string;
    expect((await decide(U.head, rid, false)).status).toBe(422);
    expect((await decide(U.head, rid, false, 'chưa cần')).status).toBe(200);
    expect(await roles(U.plain)).toEqual(['THU_KY']);
    const list = async (u: string) =>
      (await api('GET', `${AR}?officeId=${OFF}`, u)).json as unknown as {
        id: string;
        status: string;
      }[];
    expect((await list(U.head)).find((r) => r.id === rid)?.status).toBe('REJECTED');
    expect((await list(U.admin)).length).toBeGreaterThan(0);
    for (const u of [U.secretary, U.clerk, U.outsider]) expect(await list(u)).toEqual([]);
    await expect(owner.query(`DELETE FROM ad_access_requests`)).rejects.toThrow();
    await expect(owner.query(`UPDATE ad_access_requests SET reason = 'x'`)).rejects.toThrow();
    const denied = await owner.query(
      `SELECT count(*)::int n FROM audit_log WHERE action LIKE 'ad.access.%' AND outcome = 'deny'`,
    );
    expect(denied.rows[0].n).toBeGreaterThan(0);
  });
});
