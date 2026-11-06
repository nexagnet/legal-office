import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { hashPassword } from '../auth/password';
import type { MailMessage } from '../reminders/mailer';

// Tài khoản (0113): đăng nhập bằng email hoặc CCCD, buộc đổi mật khẩu lần đầu, quên mật khẩu. PostgreSQL thật, dữ liệu giả lập;
// thư được bắt bằng mailer giả.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_authacc_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const WEB = 'http://localhost:3000';
const PW_BY_ADMIN = 'mat-khau-do-admin-dat-3';
const PW_AFTER_FORGOT = 'mat-khau-sau-khi-quen-4';
const PW_SECOND = 'mat-khau-lan-hai-5';
const PW_EXPIRED = 'mat-khau-het-han-6';

describe.skipIf(!ADMIN_URL)(
  'Tài khoản: CCCD, đổi mật khẩu, quên mật khẩu (HTTP + PostgreSQL)',
  () => {
    const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
    let owner: pg.Pool;
    let appPool: pg.Pool;
    let server: INestApplication;
    let base = '';
    const sent: MailMessage[] = [];
    const id = () => randomUUID();
    const T = id();
    const OFF = id();
    const U = { boss: id(), an: id(), binh: id() };
    const PW = 'mat-khau-gia-lap-1';
    const NEW_PW = 'mat-khau-moi-rat-dai-2';

    const call = async (
      method: string,
      path: string,
      opts: { body?: unknown; cookie?: string } = {},
    ) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (opts.cookie) headers.cookie = opts.cookie;
      const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      const text = await res.text();
      return {
        status: res.status,
        cookies: res.headers.getSetCookie().map((c) => c.split(';')[0]!),
        json: text ? (JSON.parse(text) as Record<string, unknown>) : {},
      };
    };
    const login = (identifier: string, password = PW) =>
      call('POST', '/auth/login', { body: { tenantId: T, email: identifier, password } });
    const sessionOf = (r: { cookies: string[] }) =>
      r.cookies.find((c) => c.startsWith('lo_session='))!;
    const tokenOfMail = (m: MailMessage) => {
      const url = new URL(/https?:\/\/\S+/.exec(m.text)![0]);
      return { path: url.pathname, t: url.searchParams.get('t')! };
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
          auth: { sessionTtlMinutes: 60, secureCookie: false, allowedOrigins: [WEB] },
          tenantMailer: async () => ({
            send: async (m) => {
              sent.push(m);
            },
          }),
        }),
        { logger: false },
      );
      await server.listen(0);
      base = (await server.getUrl()).replace('[::1]', 'localhost');

      await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A')`, [T]);
      await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [
        OFF,
        T,
      ]);
      const hash = await hashPassword(PW);
      for (const [uid, role, email, cccd] of [
        [U.boss, 'ADMIN', 'boss@example.test', null],
        [U.an, 'THANH_VIEN', 'an@example.test', '012345678901'],
        [U.binh, 'THANH_VIEN', 'binh@example.test', null],
      ] as const) {
        await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
          uid,
          T,
          email,
        ]);
        await owner.query(
          `INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES ($1,$2,$3,$4)`,
          [T, uid, OFF, role],
        );
        await owner.query(
          `INSERT INTO auth_credentials (tenant_id, user_id, email, password_hash, cccd) VALUES ($1,$2,$3,$4,$5)`,
          [T, uid, email, hash, cccd],
        );
      }
    });

    afterAll(async () => {
      await server?.close();
      await owner?.end();
      await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
      await admin.end();
    });

    it('đăng nhập được bằng email (không phân biệt hoa thường) hoặc bằng CCCD 12 chữ số', async () => {
      expect((await login('An@Example.TEST')).status).toBe(200);
      const byCccd = await login('012345678901');
      expect(byCccd.status).toBe(200);
      expect(sessionOf(byCccd)).toBeTruthy();
      expect((await login('012345678902')).status).toBe(401); // CCCD lạ
      expect((await login('12345')).status).toBe(401); // không phải CCCD, không phải email
      expect((await login('012345678901', 'sai-mat-khau-xx')).status).toBe(401);
    });

    it('sai mật khẩu 5 lần thì khóa tài khoản đó', async () => {
      for (let i = 0; i < 5; i++) await login('binh@example.test', 'sai-mat-khau-xx');
      expect((await login('binh@example.test')).status).toBe(429);
      await owner.query(
        `UPDATE auth_credentials SET failed_attempts = 0, locked_until = NULL WHERE user_id = $1`,
        [U.binh],
      );
    });

    it('CCCD không trùng trong tenant và phải đủ 12 chữ số (ràng buộc ở CSDL)', async () => {
      await expect(
        owner.query(`UPDATE auth_credentials SET cccd = '012345678901' WHERE user_id = $1`, [
          U.binh,
        ]),
      ).rejects.toThrow(/auth_credentials_cccd_uq/);
      await expect(
        owner.query(`UPDATE auth_credentials SET cccd = 'abc' WHERE user_id = $1`, [U.binh]),
      ).rejects.toThrow(/check/);
    });

    it('Admin đặt lại mật khẩu thì người đó phải đổi ngay; đổi xong cờ tắt và phiên khác bị thu hồi', async () => {
      const boss = await login('boss@example.test');
      const set = await call('PUT', `/auth/users/${U.an}/password`, {
        cookie: sessionOf(boss),
        body: { email: 'an@example.test', password: PW_BY_ADMIN },
      });
      expect(set.status).toBe(200);
      const first = await login('an@example.test', PW_BY_ADMIN);
      expect(first.status).toBe(200);
      expect(first.json.mustChangePassword).toBe(true);
      const me = await call('GET', '/auth/me', { cookie: sessionOf(first) });
      expect(me.json.mustChangePassword).toBe(true);
      const wrong = await call('POST', '/auth/change-password', {
        cookie: sessionOf(first),
        body: { currentPassword: 'khong-dung-dau-nhe', newPassword: NEW_PW },
      });
      expect(wrong.status).toBe(422);
      expect(wrong.json.code).toBe('WRONG_PASSWORD');
      const weak = await call('POST', '/auth/change-password', {
        cookie: sessionOf(first),
        body: { currentPassword: PW_BY_ADMIN, newPassword: 'ngan' },
      });
      expect(weak.json.code).toBe('WEAK_PASSWORD');
      const same = await call('POST', '/auth/change-password', {
        cookie: sessionOf(first),
        body: {
          currentPassword: PW_BY_ADMIN,
          newPassword: PW_BY_ADMIN,
        },
      });
      expect(same.json.code).toBe('PASSWORD_UNCHANGED');
      const other = await login('an@example.test', PW_BY_ADMIN);
      const ok = await call('POST', '/auth/change-password', {
        cookie: sessionOf(first),
        body: { currentPassword: PW_BY_ADMIN, newPassword: NEW_PW },
      });
      expect(ok.status).toBe(200);
      expect(
        (await call('GET', '/auth/me', { cookie: sessionOf(first) })).json.mustChangePassword,
      ).toBe(false);
      expect((await call('GET', '/auth/me', { cookie: sessionOf(other) })).status).toBe(401);
      expect((await login('an@example.test', NEW_PW)).json.mustChangePassword).toBe(false);
    });

    it('quên mật khẩu: luôn trả cùng phản hồi; có tài khoản thì nhận thư, đặt mật khẩu mới dùng một lần', async () => {
      const before = sent.length;
      const unknown = await call('POST', '/auth/forgot-password', {
        body: { tenantId: T, identifier: 'khong-co@example.test' },
      });
      const known = await call('POST', '/auth/forgot-password', {
        body: { tenantId: T, identifier: '012345678901' },
      });
      expect(unknown.status).toBe(200);
      expect(known.status).toBe(200);
      expect(known.json).toEqual(unknown.json);
      expect(sent.length).toBe(before + 1);
      const mail = sent.at(-1)!;
      expect(mail.to).toBe('an@example.test');
      expect(mail.text).not.toContain('012345678901');
      const link = tokenOfMail(mail);
      expect(link.path).toBe('/dat-lai-mat-khau');
      const [tenantId, token] = link.t.split('.');
      const weak = await call('POST', '/auth/reset-password', {
        body: { tenantId, token, password: 'ngan' },
      });
      expect(weak.json.code).toBe('WEAK_PASSWORD');
      const session = await login('an@example.test', NEW_PW);
      const reset = await call('POST', '/auth/reset-password', {
        body: { tenantId, token, password: PW_AFTER_FORGOT },
      });
      expect(reset.status).toBe(200);
      const again = await call('POST', '/auth/reset-password', {
        body: { tenantId, token, password: PW_SECOND },
      });
      expect(again.status).toBe(422);
      expect(again.json.code).toBe('RESET_INVALID');
      expect((await call('GET', '/auth/me', { cookie: sessionOf(session) })).status).toBe(401);
      const fresh = await login('an@example.test', PW_AFTER_FORGOT);
      expect(fresh.status).toBe(200);
      expect(fresh.json.mustChangePassword).toBe(false);
    });

    it('quên mật khẩu: giới hạn 3 lần mỗi 30 phút; mã hết hạn không dùng được', async () => {
      const before = sent.length;
      for (let i = 0; i < 5; i++)
        await call('POST', '/auth/forgot-password', {
          body: { tenantId: T, identifier: 'binh@example.test' },
        });
      expect(sent.length - before).toBe(3);
      const [tenantId, token] = tokenOfMail(sent.at(-1)!).t.split('.');
      await owner.query(
        `UPDATE auth_password_resets SET expires_at = now() - interval '1 minute' WHERE user_id = $1`,
        [U.binh],
      );
      const expired = await call('POST', '/auth/reset-password', {
        body: { tenantId, token, password: PW_EXPIRED },
      });
      expect(expired.json.code).toBe('RESET_INVALID');
    });

    it('đăng nhập bằng link email đã tắt: endpoint cũ trả mồi, không gửi thư, không tạo thử thách', async () => {
      const before = sent.length;
      const r = await call('POST', '/auth/login/email', {
        body: { tenantId: T, email: 'an@example.test' },
      });
      expect(r.status).toBe(200);
      expect(r.json.code).toBe('VERIFICATION_REQUIRED');
      expect(sent.length).toBe(before);
      const n = await owner.query(`SELECT count(*)::int AS n FROM auth_login_challenges`);
      expect(n.rows[0].n).toBe(0);
    });

    it('nhật ký không chứa số CCCD', async () => {
      const logs = await owner.query(
        `SELECT action, reason FROM audit_log WHERE action LIKE 'auth.%'`,
      );
      expect(JSON.stringify(logs.rows)).not.toContain('012345678901');
    });
  },
);
