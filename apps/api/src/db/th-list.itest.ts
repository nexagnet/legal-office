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
const DB = `lo_thlist_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)('Tổ chức THA scoped list (HTTP + PostgreSQL)', () => {
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
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const TH = '/enforcement-cases';
  const newCase = async (branch: string, creator: string, handler: string | null) => {
    const created = await api('POST', TH, creator, {
      officeId: OFF,
      branchId: branch,
      caseRef: 'THA/' + id().slice(0, 8),
      agreementRef: 'HĐ-giả-lập',
      decisionRef: 'QĐ-giả-lập',
    });
    expect(created.status).toBe(200);
    const c = created.json.label as string;
    if (handler) {
      expect(
        (await api('PUT', `${TH}/${c}/handler`, U.admin, { handlerUserId: handler })).status,
      ).toBe(200);
    }
    return c;
  };
  const seen = async (who: string, tenant = T) =>
    (
      (await api('GET', TH, who, undefined, tenant)).json.items as {
        caseId: string;
      }[]
    ).map((i) => i.caseId);

  it('shows each role only the enforcement cases within its writing scope', async () => {
    const c1 = await newCase(BR1, U.clerk1, U.thvA);
    const c2 = await newCase(BR2, U.clerk2, U.thvB);
    for (const who of [U.admin, U.head, U.secretary]) {
      const s = await seen(who);
      expect(s).toContain(c1);
      expect(s).toContain(c2);
    }
    for (const who of [U.clerk1, U.acc1]) {
      expect(await seen(who)).toContain(c1);
      expect(await seen(who)).not.toContain(c2);
    }
    expect(await seen(U.clerk2)).not.toContain(c1);
    expect(await seen(U.thvA)).toContain(c1);
    expect(await seen(U.thvA)).not.toContain(c2);
    expect(await seen(U.thvB)).toEqual([c2]);
    expect(await seen(U.outsider)).toEqual([]);
    expect(await seen(U.otherTenantAdmin, T2)).toEqual([]);
    expect((await api('GET', TH, null)).status).toBe(401);
  });

  it('returns parties and obligations for the list screen', async () => {
    const c = await newCase(BR1, U.clerk1, U.thvA);
    expect(
      (
        await api('POST', `${TH}/${c}/parties`, U.thvA, {
          displayName: 'Đương sự giả lập',
          kind: 'PERSON',
          role: 'DEBTOR',
        })
      ).status,
    ).toBe(200);
    expect(
      (await api('POST', `${TH}/${c}/obligations`, U.thvA, { description: 'Nghĩa vụ giả lập' }))
        .status,
    ).toBe(200);
    const item = ((await api('GET', TH, U.admin)).json.items as Record<string, unknown>[]).find(
      (i) => i.caseId === c,
    );
    expect(item).toMatchObject({
      status: 'OPEN',
      handlerUserId: U.thvA,
      agreementRef: 'HĐ-giả-lập',
      parties: [{ displayName: 'Đương sự giả lập', role: 'DEBTOR' }],
      obligations: [{ seq: 1, description: 'Nghĩa vụ giả lập', status: 'OPEN' }],
    });
  });
});
