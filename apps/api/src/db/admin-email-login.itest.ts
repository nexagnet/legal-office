import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { hashPassword } from '../auth/password';
import type { MailMessage } from '../reminders/mailer';

// Cần PostgreSQL tạm. Email, mật khẩu và người dùng đều giả lập; thư được bắt bằng mailer giả.
const ADMIN_URL = process.env.DATABASE_URL;
const DIR = resolve(__dirname, '../../drizzle');
const MIGRATION = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(DIR, f), 'utf8'))
  .join('\n');
const DB = `lo_adminmail_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const WEB = 'http://localhost:3000';

describe.skipIf(!ADMIN_URL)(
  'Admin đăng nhập bằng mật khẩu hoặc link email (HTTP + PostgreSQL)',
  () => {
    const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
    let owner: pg.Pool;
    let appPool: pg.Pool;
    let server: INestApplication;
    let base = '';
    const sent: MailMessage[] = [];
    let mailFails = false;
    const id = () => randomUUID();
    const T = id();
    const T2 = id();
    const OFF = id();
    const U = { admin: id(), thv: id(), admin2: id() };
    const PW = 'mat-khau-gia-lap-1';

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
        headers: res.headers,
        cookies: res.headers.getSetCookie().map((c) => c.split(';')[0]!),
        raw: res.headers.getSetCookie(),
        json: text ? (JSON.parse(text) as Record<string, unknown>) : {},
      };
    };
    const login = (email: string, tenantId = T) =>
      call('POST', '/auth/login', { body: { tenantId, email, password: PW } });
    const emailLogin = (email: string, tenantId = T) =>
      call('POST', '/auth/login/email', { body: { tenantId, email } });
    const linkOf = (m: MailMessage) => {
      const url = new URL(/https?:\/\/\S+/.exec(m.text)![0]);
      const [tenantId, token] = url.searchParams.get('t')!.split('.');
      return { path: url.pathname, tenantId: tenantId!, token: token! };
    };
    /** Xin link qua email; trả cookie thử thách + link + mã sau khi bấm link. */
    const startAndRedeem = async (email = 'admin@example.test') => {
      const r = await emailLogin(email);
      expect(r.json).toMatchObject({ code: 'VERIFICATION_REQUIRED' });
      const challenge = r.cookies.find((c) => c.startsWith('lo_challenge='))!;
      const link = linkOf(sent.at(-1)!);
      const redeemed = await call('POST', '/auth/verify-link', {
        body: { tenantId: link.tenantId, token: link.token },
      });
      return { challenge, link, redeemed };
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
              if (mailFails) throw new Error('smtp down');
              sent.push(m);
            },
          }),
        }),
        { logger: false },
      );
      await server.listen(0);
      base = (await server.getUrl()).replace('[::1]', 'localhost');

      await owner.query(`INSERT INTO tenants (id, name) VALUES ($1,'A'),($2,'B')`, [T, T2]);
      await owner.query(`INSERT INTO offices (id, tenant_id, name) VALUES ($1,$2,'VP A')`, [
        OFF,
        T,
      ]);
      const hash = await hashPassword(PW);
      for (const [uid, role, email] of [
        [U.admin, 'ADMIN', 'admin@example.test'],
        [U.admin2, 'ADMIN', 'admin2@example.test'],
        [U.thv, 'THV', 'thv@example.test'],
      ] as const) {
        await owner.query(`INSERT INTO users (id, tenant_id, external_ref) VALUES ($1,$2,$3)`, [
          uid,
          T,
          email,
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
    });

    beforeEach(async () => {
      sent.length = 0;
      mailFails = false;
      await owner.query(`DELETE FROM auth_login_challenges`);
      await owner.query(`DELETE FROM auth_tenant_settings`);
    await owner.query(`DELETE FROM office_mail_settings`);
      await owner.query(`UPDATE auth_credentials SET failed_attempts = 0, locked_until = NULL`);
    });

    afterAll(async () => {
      await server?.close();
      await owner?.end();
      await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
      await admin.end();
    });

    const enableSmtp = () =>
      owner.query(
        `INSERT INTO office_mail_settings (tenant_id, host, port, secure, mail_from, updated_by)
       VALUES ($1,'smtp.example.test',465,true,'no-reply@example.test',$2) ON CONFLICT DO NOTHING`,
        [T, U.admin],
      );

    it('đăng nhập bằng mật khẩu vào thẳng, kể cả khi đã có SMTP — không bắt thêm bước email', async () => {
      await enableSmtp();
      const bad = await call('POST', '/auth/login', {
        body: { tenantId: T, email: 'admin@example.test', password: 'sai-mat-khau-xx' },
      });
      expect(bad.status).toBe(401);
      const r = await login('admin@example.test');
      expect(r.json).toMatchObject({ code: 'ALLOWED' });
      expect(r.cookies.some((c) => c.startsWith('lo_session='))).toBe(true);
      expect(r.cookies.some((c) => c.startsWith('lo_challenge='))).toBe(false);
      expect(sent).toHaveLength(0);
    });

    it('đăng nhập bằng email: gửi link dùng một lần, chưa có phiên, DB chỉ lưu băm', async () => {
      await enableSmtp();
      const r = await emailLogin('admin@example.test');
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ code: 'VERIFICATION_REQUIRED', label: null });
      expect(r.cookies.some((c) => c.startsWith('lo_session='))).toBe(false);
      const ch = r.raw.find((c) => c.startsWith('lo_challenge='))!;
      expect(ch).toMatch(/HttpOnly/);
      expect(ch).toMatch(/SameSite=Strict/);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe('admin@example.test');
      const link = linkOf(sent[0]!);
      expect(link.path).toBe('/xac-thuc');
      expect(sent[0]!.text).not.toMatch(/\b\d{6}\b/);
      const stored = await owner.query(
        `SELECT secret_hash, link_hash, code_hash FROM auth_login_challenges`,
      );
      expect(stored.rows).toHaveLength(1);
      expect(JSON.stringify(stored.rows)).not.toContain(link.token);
      expect(stored.rows[0].code_hash).toBeNull();
    });

    it('phản hồi đồng nhất: email lạ, không phải Admin, chưa SMTP, công tắc tắt, lỗi gửi thư đều không lộ gì và không gửi thư', async () => {
      const shape = (r: Awaited<ReturnType<typeof emailLogin>>) => {
        expect(r.status).toBe(200);
        expect(r.json).toEqual({ code: 'VERIFICATION_REQUIRED', label: null });
        expect(r.cookies.some((c) => c.startsWith('lo_challenge='))).toBe(true);
        expect(r.cookies.some((c) => c.startsWith('lo_session='))).toBe(false);
      };
      // Chưa có SMTP.
      shape(await emailLogin('admin@example.test'));
      expect(sent).toHaveLength(0);
      await enableSmtp();
      shape(await emailLogin('khong-co@example.test'));
      shape(await emailLogin('thv@example.test'));
      expect(sent).toHaveLength(0);
      // Công tắc tắt.
      await owner.query(
        `INSERT INTO auth_tenant_settings (tenant_id, admin_email_verification) VALUES ($1,false)`,
        [T],
      );
      shape(await emailLogin('admin@example.test'));
      expect(sent).toHaveLength(0);
      await owner.query(`UPDATE auth_tenant_settings SET admin_email_verification = true`);
      // Gửi thư lỗi.
      mailFails = true;
      const failed = await emailLogin('admin@example.test');
      shape(failed);
      expect(JSON.stringify(failed.json)).not.toContain('smtp');
      mailFails = false;
      // Cookie giả không dùng được để vào.
      const decoy = failed.cookies.find((c) => c.startsWith('lo_challenge='))!;
      expect(
        (await call('POST', '/auth/login/verify', { body: { code: '123456' }, cookie: decoy }))
          .status,
      ).toBe(401);
      // Cuối cùng vẫn gửi được khi mọi điều kiện đủ.
      shape(await emailLogin('admin@example.test'));
      expect(sent).toHaveLength(1);
    });

    it('bấm link mới sinh mã; link chỉ dùng được một lần; mã + cookie đúng mới mở phiên', async () => {
      await enableSmtp();
      const { challenge, link, redeemed } = await startAndRedeem();
      expect(redeemed.status).toBe(200);
      const code = redeemed.json.verificationCode as string;
      expect(code).toMatch(/^\d{6}$/);
      expect(redeemed.json.validMinutes).toBe(10);
      const again = await call('POST', '/auth/verify-link', {
        body: { tenantId: link.tenantId, token: link.token },
      });
      expect(again.status).toBe(422);
      expect(again.json).toMatchObject({ code: 'LINK_INVALID' });
      expect(JSON.stringify(again.json)).not.toContain(code);

      // Có mã mà thiếu cookie trình duyệt thì vô dụng.
      expect((await call('POST', '/auth/login/verify', { body: { code } })).status).toBe(401);

      const ok = await call('POST', '/auth/login/verify', { body: { code }, cookie: challenge });
      expect(ok.status).toBe(200);
      const session = ok.cookies.find((c) => c.startsWith('lo_session='))!;
      expect(session).toBeTruthy();
      expect(ok.raw.some((c) => c.startsWith('lo_challenge=;') || c.includes('Max-Age=0'))).toBe(
        true,
      );
      const me = await call('GET', '/auth/me', { cookie: session });
      expect(me.json).toMatchObject({ userId: U.admin });

      // Dùng lại cùng mã và cookie sau khi thành công: bị từ chối.
      const replay = await call('POST', '/auth/login/verify', {
        body: { code },
        cookie: challenge,
      });
      expect(replay.status).toBe(401);
      expect(replay.json).toMatchObject({ code: 'CHALLENGE_INVALID' });
    });

    it('chưa bấm link thì nhập mã báo CODE_NOT_ISSUED; sai mã 5 lần thì huỷ thử thách', async () => {
      await enableSmtp();
      const r = await emailLogin('admin@example.test');
      const challenge = r.cookies.find((c) => c.startsWith('lo_challenge='))!;
      const early = await call('POST', '/auth/login/verify', {
        body: { code: '123456' },
        cookie: challenge,
      });
      expect(early.status).toBe(409);
      expect(early.json).toMatchObject({ code: 'CODE_NOT_ISSUED' });

      const link = linkOf(sent[0]!);
      const redeemed = await call('POST', '/auth/verify-link', {
        body: { tenantId: link.tenantId, token: link.token },
      });
      const good = redeemed.json.verificationCode as string;
      const wrong = good === '000000' ? '000001' : '000000';
      for (let i = 0; i < 4; i++) {
        const w = await call('POST', '/auth/login/verify', {
          body: { code: wrong },
          cookie: challenge,
        });
        expect(w.json).toMatchObject({ code: 'INVALID_CODE' });
      }
      const fifth = await call('POST', '/auth/login/verify', {
        body: { code: wrong },
        cookie: challenge,
      });
      expect(fifth.json).toMatchObject({ code: 'CHALLENGE_LOCKED' });
      // Đã huỷ: mã đúng cũng không còn dùng được.
      const late = await call('POST', '/auth/login/verify', {
        body: { code: good },
        cookie: challenge,
      });
      expect(late.status).toBe(401);
      expect(late.json).toMatchObject({ code: 'CHALLENGE_INVALID' });
      expect((await call('GET', '/auth/me', { cookie: challenge })).status).toBe(401);
    });

    it('link và mã hết hạn thì bị từ chối', async () => {
      await enableSmtp();
      const a = await emailLogin('admin@example.test');
      const chA = a.cookies.find((c) => c.startsWith('lo_challenge='))!;
      const linkA = linkOf(sent[0]!);
      await owner.query(
        `UPDATE auth_login_challenges SET link_expires_at = now() - interval '1 minute'`,
      );
      const expiredLink = await call('POST', '/auth/verify-link', {
        body: { tenantId: linkA.tenantId, token: linkA.token },
      });
      expect(expiredLink.status).toBe(422);
      const noCode = await call('POST', '/auth/login/verify', {
        body: { code: '111111' },
        cookie: chA,
      });
      expect(noCode.json).toMatchObject({ code: 'CHALLENGE_EXPIRED' });

      await owner.query(`DELETE FROM auth_login_challenges`);
      sent.length = 0;
      const { challenge, redeemed } = await startAndRedeem('admin2@example.test');
      await owner.query(
        `UPDATE auth_login_challenges SET code_expires_at = now() - interval '1 minute'`,
      );
      const late = await call('POST', '/auth/login/verify', {
        body: { code: redeemed.json.verificationCode as string },
        cookie: challenge,
      });
      expect(late.status).toBe(401);
      expect(late.json).toMatchObject({ code: 'CHALLENGE_EXPIRED' });
    });

    it('xin link lại huỷ thử thách cũ; tối đa 3 thư/15 phút (vẫn trả 200); tenant khác không dùng được', async () => {
      await enableSmtp();
      const first = await startAndRedeem();
      const second = await emailLogin('admin@example.test');
      expect(second.json).toMatchObject({ code: 'VERIFICATION_REQUIRED' });
      const old = await call('POST', '/auth/login/verify', {
        body: { code: first.redeemed.json.verificationCode as string },
        cookie: first.challenge,
      });
      expect(old.status).toBe(401);

      expect((await emailLogin('admin@example.test')).status).toBe(200);
      const limited = await emailLogin('admin@example.test');
      expect(limited.status).toBe(200);
      expect(limited.json).toEqual({ code: 'VERIFICATION_REQUIRED', label: null });
      expect(sent).toHaveLength(3);

      const forged = `lo_challenge=${T2}.${first.challenge.split('.')[1]}`;
      expect(
        (await call('POST', '/auth/login/verify', { body: { code: '123456' }, cookie: forged }))
          .status,
      ).toBe(401);
      const link = linkOf(sent[2]!);
      const cross = await call('POST', '/auth/verify-link', {
        body: { tenantId: T2, token: link.token },
      });
      expect(cross.status).toBe(422);
    });

    it('khoá tài khoản (sai mật khẩu nhiều lần) cũng chặn đường email', async () => {
      await enableSmtp();
      await owner.query(`UPDATE auth_credentials SET locked_until = now() + interval '10 minutes'`);
      expect((await emailLogin('admin@example.test')).status).toBe(200);
      expect(sent).toHaveLength(0);
    });

    it('đầu vào sai bị từ chối ở biên (strict + định dạng)', async () => {
      expect(
        (await call('POST', '/auth/verify-link', { body: { tenantId: T, token: 'x' } })).status,
      ).toBe(400);
      expect(
        (
          await call('POST', '/auth/login/email', {
            body: { tenantId: T, email: 'admin@example.test', x: 1 },
          })
        ).status,
      ).toBe(400);
      expect((await call('POST', '/auth/login/verify', { body: { code: '12ab56' } })).status).toBe(
        400,
      );
      expect(
        (await call('POST', '/auth/login/verify', { body: { code: '123456', x: 1 } })).status,
      ).toBe(400);
    });
  },
);
