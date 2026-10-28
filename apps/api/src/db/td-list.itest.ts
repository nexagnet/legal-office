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
const DB = `lo_tdlist_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
  const seen = async (who: string, tenant = T) =>
    (
      (await api('GET', `${SOD}/documents`, who, undefined, tenant)).json.items as {
        documentId: string;
      }[]
    ).map((i) => i.documentId);

  it('shows each role only the service documents within its writing scope', async () => {
    const d1 = await newDoc(BR1, U.clerk1, U.thvA);
    const d2 = await newDoc(BR2, U.clerk2, U.thvB);
    for (const who of [U.admin, U.head, U.secretary]) {
      const s = await seen(who);
      expect(s).toContain(d1);
      expect(s).toContain(d2);
    }
    for (const who of [U.clerk1, U.acc1]) {
      const s = await seen(who);
      expect(s).toContain(d1);
      expect(s).not.toContain(d2);
    }
    expect(await seen(U.clerk2)).toEqual(expect.arrayContaining([d2]));
    expect(await seen(U.clerk2)).not.toContain(d1);
    expect(await seen(U.thvA)).toContain(d1);
    expect(await seen(U.thvA)).not.toContain(d2);
    expect(await seen(U.thvB)).toEqual([d2]);
    expect(await seen(U.outsider)).toEqual([]);
    expect(await seen(U.otherTenantAdmin, T2)).toEqual([]);
    expect((await api('GET', `${SOD}/documents`, null)).status).toBe(401);
  });

  it('lists the attempts of a document within the same scope as the list, oldest first', async () => {
    const doc = await newDoc(BR1, U.clerk1, U.thvA);
    for (const outcome of ['ABSENT', 'REFUSED']) {
      expect(
        (await api('POST', `${SOD}/documents/${doc}/attempts`, U.thvA, { outcome })).status,
      ).toBe(200);
    }
    const items = (await api('GET', `${SOD}/documents/${doc}/attempts`, U.admin)).json
      .items as Record<string, unknown>[];
    expect(items.map((i) => [i.seq, i.outcome, i.hasEvidence])).toEqual([
      [1, 'ABSENT', false],
      [2, 'REFUSED', false],
    ]);
    expect(Object.keys(items[0]!).sort()).toEqual(
      ['actorUserId', 'at', 'hasEvidence', 'late', 'outcome', 'seq'].sort(),
    );
    expect(
      ((await api('GET', `${SOD}/documents/${doc}/attempts`, U.clerk1)).json.items as unknown[])
        .length,
    ).toBe(2);
    for (const who of [U.thvB, U.clerk2, U.outsider]) {
      expect((await api('GET', `${SOD}/documents/${doc}/attempts`, who)).json.items).toEqual([]);
    }
    expect((await api('GET', `${SOD}/documents/${doc}/attempts`, null)).status).toBe(401);
  });

  it('shows person names only within the same office, lets an Admin rename, and never lists a directory', async () => {
    const names = async (who: string | null, ids: string[], tenant = T) =>
      api('GET', `/people/names?ids=${ids.join(',')}`, who, undefined, tenant);
    // chưa có họ tên: lấy phần trước @ của mã nội bộ
    const before = (await names(U.thvB, [U.thvA])).json.items as Record<string, unknown>[];
    expect(before).toEqual([{ userId: U.thvA, displayName: 'THV' }]);
    // Admin đặt họ tên; mọi vai cùng văn phòng đều thấy
    const renamed = await api('PATCH', `/admin/members/${U.thvA}/name`, U.admin, {
      officeId: OFF,
      fullName: 'Lê Thu Hà',
    });
    expect(renamed.status).toBe(200);
    for (const who of [U.admin, U.thvB, U.clerk2, U.secretary]) {
      expect((await names(who, [U.thvA])).json.items).toEqual([
        { userId: U.thvA, displayName: 'Lê Thu Hà' },
      ]);
    }
    // người không thuộc văn phòng, người của tenant khác, không đăng nhập: không thấy gì
    expect((await names(U.outsider, [U.thvA])).json.items).toEqual([]);
    expect((await names(U.otherTenantAdmin, [U.thvA], T2)).json.items).toEqual([]);
    expect((await names(null, [U.thvA])).status).toBe(401);
    // đầu vào sai
    expect((await api('GET', '/people/names', U.admin)).status).toBe(400);
    expect((await api('GET', '/people/names?ids=khong-phai-uuid', U.admin)).status).toBe(400);
    // chỉ Admin được sửa
    const denied = await api('PATCH', `/admin/members/${U.thvA}/name`, U.thvB, {
      officeId: OFF,
      fullName: 'Kẻ lạ',
    });
    expect(denied.status).toBe(403);
    expect((await names(U.admin, [U.thvA])).json.items).toEqual([
      { userId: U.thvA, displayName: 'Lê Thu Hà' },
    ]);
    // người ngoài văn phòng không bị sửa; tên rỗng bị từ chối
    expect(
      (
        await api('PATCH', `/admin/members/${U.outsider}/name`, U.admin, {
          officeId: OFF,
          fullName: 'X',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api('PATCH', `/admin/members/${U.thvA}/name`, U.admin, {
          officeId: OFF,
          fullName: '   ',
        })
      ).status,
    ).toBe(400);
  });

  it('returns the fields the list screen needs', async () => {
    const doc = await newDoc(BR1, U.clerk1, U.thvA);
    const item = (
      (await api('GET', `${SOD}/documents`, U.admin)).json.items as Record<string, unknown>[]
    ).find((i) => i.documentId === doc);
    expect(item).toMatchObject({
      status: 'ASSIGNED',
      handlerUserId: U.thvA,
      attempts: 0,
      requestStatus: 'OPEN',
      recipientName: 'Người nhận giả lập',
      lastAttemptAt: null,
    });
  });
});
