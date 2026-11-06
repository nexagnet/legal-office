import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';

// Endpoint duyệt/lọc hồ sơ quy mô lớn qua HTTP thật + PostgreSQL thật. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_dmsbr_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!ADMIN_URL)('DMS duyệt/lọc hồ sơ qua HTTP (PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const id = () => randomUUID();
  const T = id();
  const OFF = id();
  const B1 = id();
  const U = { admin: id(), reader: id(), none: id() };
  const api = async (method: string, path: string, user: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'x-synthetic-user': user,
        'x-synthetic-tenant': T,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const t = await res.text();
    return { status: res.status, json: (t ? JSON.parse(t) : {}) as Json };
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

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A')`, [T]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP')`, [OFF, T]);
    await owner.query(
      `INSERT INTO branches (id, tenant_id, office_id, name) VALUES ($1,$2,$3,'CN1')`,
      [B1, T, OFF],
    );
    for (const [k, u] of Object.entries(U)) {
      await owner.query(
        `INSERT INTO users (id, tenant_id, external_ref, full_name) VALUES ($1,$2,$3,$4)`,
        [u, T, `${k}@x.invalid`, `Người ${k}`],
      );
      await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4)`,
        [T, u, OFF, k === 'admin' ? 'ADMIN' : 'THANH_VIEN'],
      );
    }
    const g = await owner.query(
      `INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES ($1,$2,'R') RETURNING id`,
      [T, OFF],
    );
    await owner.query(
      `INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES ($1,$2,'vibang.read.all')`,
      [T, g.rows[0].id],
    );
    await owner.query(
      `INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES ($1,$2,$3)`,
      [T, g.rows[0].id, U.reader],
    );
    await owner.query(
      `INSERT INTO dms_branch_access (tenant_id, office_id, user_id, branch_id, granted_by, grant_reason) VALUES ($1,$2,$3,$4,$5,'t')`,
      [T, OFF, U.reader, B1, U.admin],
    );
    for (let n = 1; n <= 25; n++)
      await owner.query(
        `INSERT INTO dms_case_files (tenant_id, office_id, domain, title, attributes, status, created_by, created_at, recorded_by, recorded_at, branch_id)
         VALUES ($1,$2,'vibang',$3,$4,'RECORDED',$5,$6,$5,$6,$7)`,
        [
          T,
          OFF,
          `Vi bằng Nguyễn Văn Đức ${n}`,
          JSON.stringify({ so_ky_hieu: `${n}/GTT` }),
          U.admin,
          new Date(Date.UTC(2026, 0, n)),
          B1,
        ],
      );
  }, 120_000);

  afterAll(async () => {
    await server?.close();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  const q = (o: Record<string, string | number | boolean>) =>
    new URLSearchParams({
      officeId: OFF,
      ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])),
    }).toString();

  it('tìm không dấu, lọc, tổng và phân trang bằng nextCursor đi hết đúng một lần', async () => {
    const first = await api(
      'GET',
      `/dms/case-search?${q({ domain: 'vibang', status: 'RECORDED', q: 'nguyen van duc', limit: 10 })}`,
      U.reader,
    );
    expect(first.status).toBe(200);
    expect(first.json.total).toBe(25);
    expect(first.json.totalCapped).toBe(false);
    expect(first.json.rows).toHaveLength(10);
    expect(first.json.rows[0]).not.toHaveProperty('total_capped');
    const seen = new Set<string>(first.json.rows.map((r: Json) => r.id));
    let cursor: string | null = first.json.nextCursor;
    while (cursor) {
      const page = await api(
        'GET',
        `/dms/case-search?${q({ domain: 'vibang', status: 'RECORDED', q: 'nguyen van duc', limit: 10, cursor, total: false })}`,
        U.reader,
      );
      expect(page.json.total).toBeNull();
      for (const r of page.json.rows) {
        expect(seen.has(r.id)).toBe(false);
        seen.add(r.id);
      }
      cursor = page.json.nextCursor;
    }
    expect(seen.size).toBe(25);
  });

  it('tham số sai bị từ chối; con trỏ lạ trả rỗng; người không quyền không thấy gì', async () => {
    expect((await api('GET', `/dms/case-search?${q({ scan: 'bogus' })}`, U.reader)).status).toBe(
      400,
    );
    expect((await api('GET', `/dms/case-search?${q({ nope: 1 })}`, U.reader)).status).toBe(400);
    expect(
      (
        await api(
          'GET',
          `/dms/case-search?${q({ cursor: "x'; drop table dms_case_files;--" })}`,
          U.reader,
        )
      ).json.rows,
    ).toEqual([]);
    expect((await api('GET', `/dms/case-search?${q({})}`, U.none)).json.rows).toEqual([]);
  });

  it('facet trả các nhóm có đếm', async () => {
    const r = await api(
      'GET',
      `/dms/case-facet-counts?${q({ domain: 'vibang', status: 'RECORDED' })}`,
      U.reader,
    );
    expect(r.status).toBe(200);
    expect(r.json.creator).toEqual([{ value: U.admin, label: 'Người admin', n: 25 }]);
    expect(r.json.branch[0]).toMatchObject({ value: B1, label: 'CN1', n: 25 });
    expect(r.json.year).toEqual([{ value: '2026', label: '2026', n: 25 }]);
  });

  it('bộ lọc đã lưu: lưu, liệt kê, xoá', async () => {
    const saved = await api('POST', '/dms/saved-filters', U.reader, {
      officeId: OFF,
      domain: 'vibang',
      name: 'Năm 2026',
      params: { year: 2026, scan: 'missing' },
    });
    expect(saved.status).toBe(201);
    const list = await api('GET', `/dms/saved-filters?${q({ domain: 'vibang' })}`, U.reader);
    expect(list.json.rows).toHaveLength(1);
    expect(list.json.rows[0].params).toEqual({ year: 2026, scan: 'missing' });
    expect(
      (
        await api('POST', '/dms/saved-filters', U.reader, {
          officeId: OFF,
          domain: 'vibang',
          name: 'x',
          params: { officeId: OFF },
        })
      ).status,
    ).toBe(400);
    expect(
      (await api('DELETE', `/dms/saved-filters/${list.json.rows[0].id}`, U.admin)).status,
    ).toBe(404); // của người khác
    expect(
      (await api('DELETE', `/dms/saved-filters/${list.json.rows[0].id}`, U.reader)).status,
    ).toBe(200);
  });
});
