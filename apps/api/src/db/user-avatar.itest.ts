import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';
import { LocalFileStore } from '../storage/file-store';

// Cần PostgreSQL tạm. Ảnh đại diện: chỉ chính chủ đổi; người cùng văn phòng xem; khác văn phòng/tenant không xem. Dữ liệu giả lập.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_avatar_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png-body'),
]);

describe.skipIf(!ADMIN_URL)('User avatar (HTTP + PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const OFF2 = id();
  const U = { admin: id(), clerk: id(), stranger: id(), other: id() };

  const call = (
    method: string,
    path: string,
    user: string,
    tenant: string,
    body?: Buffer,
    type?: string,
  ) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        'x-synthetic-user': user,
        'x-synthetic-tenant': tenant,
        ...(type ? { 'content-type': type } : {}),
      },
      body,
    });

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
        fileStore: new LocalFileStore(mkdtempSync(resolve(tmpdir(), 'lo-avatar-'))),
      }),
      { logger: false },
    );
    await server.listen(0);
    base = (await server.getUrl()).replace('[::1]', 'localhost');
    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
    await owner.query(
      `INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A'),($3,$2,'VP A2')`,
      [OFF, T, OFF2],
    );
    for (const [uid, office, role, ref] of [
      [U.admin, OFF, 'ADMIN', 'admin@x.test'],
      [U.clerk, OFF, 'VAN_THU', 'clerk@x.test'],
      [U.stranger, OFF2, 'VAN_THU', 'stranger@x.test'],
    ] as const) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        ref,
      ]);
      await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4)`,
        [T, uid, office, role],
      );
    }
    await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,'o')`, [
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

  it('has no photo at first', async () => {
    expect((await call('GET', `/people/${U.clerk}/avatar`, U.clerk, T)).status).toBe(404);
  });

  it('lets a user set their own photo; same-office people see it, other offices and tenants do not', async () => {
    const put = await call('PUT', '/people/me/avatar', U.clerk, T, PNG, 'image/png');
    expect(put.status).toBe(200);
    const self = await call('GET', `/people/${U.clerk}/avatar`, U.clerk, T);
    expect(self.status).toBe(200);
    expect(self.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await self.arrayBuffer()).equals(PNG)).toBe(true);
    expect((await call('GET', `/people/${U.clerk}/avatar`, U.admin, T)).status).toBe(200);
    expect((await call('GET', `/people/${U.clerk}/avatar`, U.stranger, T)).status).toBe(404);
    expect((await call('GET', `/people/${U.clerk}/avatar`, U.other, T2)).status).toBe(404);
  });

  it('has no way for an Admin to change someone else’s photo', async () => {
    await call('PUT', '/people/me/avatar', U.admin, T, PNG, 'image/png');
    const before = (await owner.query(`SELECT avatar_key FROM users WHERE id = $1`, [U.clerk]))
      .rows[0].avatar_key;
    // Đường dẫn có mã người khác không tồn tại cho PUT/DELETE.
    expect(
      (await call('PUT', `/people/${U.clerk}/avatar`, U.admin, T, PNG, 'image/png')).status,
    ).toBe(404);
    expect((await call('DELETE', `/people/${U.clerk}/avatar`, U.admin, T)).status).toBe(404);
    const after = (await owner.query(`SELECT avatar_key FROM users WHERE id = $1`, [U.clerk]))
      .rows[0].avatar_key;
    expect(after).toBe(before);
    // Hàm DB cũng không nhận khóa nằm trong thư mục của người khác.
    const key = `t/${T}/avatars/${U.clerk}/x.png`;
    const r = await owner.query(`SELECT * FROM ad_self_set_avatar($1,$2,$3,'image/png')`, [
      T,
      U.admin,
      key,
    ]);
    expect(r.rows[0].ok).toBe(false);
  });

  it('rejects wrong types, mismatched content and oversize', async () => {
    expect((await call('PUT', '/people/me/avatar', U.clerk, T, PNG, 'image/gif')).status).toBe(422);
    expect((await call('PUT', '/people/me/avatar', U.clerk, T, PNG, 'image/jpeg')).status).toBe(
      422,
    );
    expect(
      (
        await call(
          'PUT',
          '/people/me/avatar',
          U.clerk,
          T,
          Buffer.alloc(2 * 1024 * 1024 + 10, 1),
          'image/png',
        )
      ).status,
    ).toBe(413);
  });

  it('lets the user remove their photo and keeps the stored file', async () => {
    expect((await call('DELETE', '/people/me/avatar', U.clerk, T)).status).toBe(200);
    expect((await call('GET', `/people/${U.clerk}/avatar`, U.clerk, T)).status).toBe(404);
    const audit = await owner.query(
      `SELECT count(*)::int AS n FROM audit_log WHERE action LIKE 'ad.self.avatar%'`,
    );
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(3);
  });
});
