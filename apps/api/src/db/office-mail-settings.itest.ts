import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';
import { decryptSecret } from '../reminders/secret-box';
import { resolveTenantMailer } from '../reminders/resolve-mailer';

// Cần PostgreSQL tạm. HTTP thật + DB thật + vai legal_app có RLS. Dữ liệu giả lập; không có SMTP thật.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_ms_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const KEY = Buffer.alloc(32, 9);

describe.skipIf(!ADMIN_URL)('Cấu hình SMTP cho email nhắc hạn (HTTP + PostgreSQL)', () => {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  let owner: pg.Pool;
  let appPool: pg.Pool;
  let server: INestApplication;
  let base = '';
  const id = () => randomUUID();
  const T = id();
  const T2 = id();
  const OFF = id();
  const U = { admin: id(), head: id(), other: id() };
  const savedKey = process.env.MAIL_SETTINGS_KEY;

  const api = async (method: string, path: string, user: string, body?: unknown, tenant = T) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-synthetic-user': user,
        'x-synthetic-tenant': tenant,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const t = await res.text();
    return {
      status: res.status,
      text: t,
      json: t ? (JSON.parse(t) as Record<string, unknown>) : {},
    };
  };
  const valid = {
    officeId: OFF,
    host: 'smtp.example.test',
    port: 465,
    secure: true,
    username: 'no-reply@example.test',
    password: 'mat-khau-smtp-gia-lap',
    mailFrom: 'Legal Office <no-reply@example.test>',
  };

  beforeAll(async () => {
    delete process.env.MAIL_SETTINGS_KEY;
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

    await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
    await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [OFF, T]);
    for (const [uid, role] of [
      [U.admin, 'ADMIN'],
      [U.head, 'TRUONG_VP'],
    ] as const) {
      await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
        uid,
        T,
        role,
      ]);
      await owner.query(
        `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4)`,
        [T, uid, OFF, role],
      );
    }
    await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,'a2')`, [
      U.other,
      T2,
    ]);
    await owner.query(
      `INSERT INTO auth_credentials (tenant_id, user_id, email, password_hash) VALUES ($1,$2,'admin@example.test','x')`,
      [T, U.admin],
    );
  });

  afterAll(async () => {
    if (savedKey === undefined) delete process.env.MAIL_SETTINGS_KEY;
    else process.env.MAIL_SETTINGS_KEY = savedKey;
    await server?.close();
    await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  it('chưa có khoá mã hoá thì không lưu mật khẩu; chỉ Admin đọc/ghi', async () => {
    const get = await api('GET', `/office/mail-settings?officeId=${OFF}`, U.admin);
    expect(get.json).toMatchObject({
      keyReady: false,
      configured: false,
      testTo: 'admin@example.test',
    });
    expect((await api('PUT', '/office/mail-settings', U.admin, valid)).json).toMatchObject({
      code: 'MAIL_KEY_MISSING',
    });
    expect((await api('GET', `/office/mail-settings?officeId=${OFF}`, U.head)).status).toBe(403);
    expect((await api('PUT', '/office/mail-settings', U.head, valid)).status).toBe(403);
    expect(
      (await api('POST', '/office/mail-settings/test', U.head, { officeId: OFF })).status,
    ).toBe(403);
    expect(
      (await api('GET', `/office/mail-settings?officeId=${OFF}`, U.other, undefined, T2)).status,
    ).toBe(403);
  });

  it('lưu mã hoá, không bao giờ trả mật khẩu, giữ/xoá mật khẩu đúng ý', async () => {
    process.env.MAIL_SETTINGS_KEY = KEY.toString('base64');
    const put = await api('PUT', '/office/mail-settings', U.admin, valid);
    expect(put.status).toBe(200);
    const get = await api('GET', `/office/mail-settings?officeId=${OFF}`, U.admin);
    expect(get.json).toMatchObject({
      keyReady: true,
      configured: true,
      host: 'smtp.example.test',
      port: 465,
      secure: true,
      username: 'no-reply@example.test',
      hasPassword: true,
      mailFrom: valid.mailFrom,
    });
    expect(get.text).not.toContain('mat-khau-smtp-gia-lap');
    expect(put.text).not.toContain('mat-khau-smtp-gia-lap');
    const stored = (
      await owner.query(`SELECT password_enc FROM office_mail_settings WHERE tenant_id = $1`, [T])
    ).rows[0].password_enc as string;
    expect(stored).not.toContain('mat-khau');
    expect(decryptSecret(stored, KEY, T)).toBe('mat-khau-smtp-gia-lap');
    // Không gửi password => giữ nguyên; clearPassword => xoá
    const { password: _omit, ...noPassword } = valid;
    void _omit;
    await api('PUT', '/office/mail-settings', U.admin, { ...noPassword, port: 587, secure: false });
    expect(
      (
        await owner.query(
          `SELECT port, password_enc FROM office_mail_settings WHERE tenant_id = $1`,
          [T],
        )
      ).rows[0],
    ).toEqual({ port: 587, password_enc: stored });
    await api('PUT', '/office/mail-settings', U.admin, { ...noPassword, clearPassword: true });
    expect((await api('GET', `/office/mail-settings?officeId=${OFF}`, U.admin)).json).toMatchObject(
      { hasPassword: false },
    );
  });

  it('từ chối cấu hình sai và đích nội bộ; tenant khác không thấy', async () => {
    for (const bad of [
      { ...valid, host: 'localhost' },
      { ...valid, host: '169.254.169.254' },
      { ...valid, host: 'smtp.example.test/x' },
      { ...valid, port: 70000 },
      { ...valid, mailFrom: '  ' },
      { ...valid, extra: 1 },
    ]) {
      expect(
        (await api('PUT', '/office/mail-settings', U.admin, bad)).status,
      ).toBeGreaterThanOrEqual(400);
    }
    expect(
      (await api('PUT', '/office/mail-settings', U.admin, { ...valid, host: 'localhost' })).status,
    ).toBe(422);
    expect(
      (
        await owner.query(
          `SELECT count(*)::int AS n FROM office_mail_settings WHERE tenant_id = $1`,
          [T2],
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it('gửi thử: máy chủ không tồn tại thì lỗi chung, không lộ chi tiết; resolveTenantMailer đọc lại cấu hình', async () => {
    await api('PUT', '/office/mail-settings', U.admin, { ...valid, host: 'khong-ton-tai.invalid' });
    const test = await api('POST', '/office/mail-settings/test', U.admin, { officeId: OFF });
    expect(test.status).toBe(502);
    expect(test.json).toEqual({ code: 'MAIL_SEND_FAILED', label: null });
    expect(await resolveTenantMailer(appPool, T, process.env)).not.toBeNull();
    expect(await resolveTenantMailer(appPool, T2, {})).toBeNull();
    expect(
      await resolveTenantMailer(appPool, T2, { SMTP_URL: 'smtp://h', MAIL_FROM: 'a@b.test' }),
    ).not.toBeNull();
    delete process.env.MAIL_SETTINGS_KEY;
    // Có mật khẩu lưu mà thiếu khoá thì báo lỗi rõ ràng, không gửi bằng mật khẩu rỗng
    await expect(resolveTenantMailer(appPool, T, {})).rejects.toThrow(/MAIL_SETTINGS_KEY/);
  });
});
