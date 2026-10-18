import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PgService } from '../db/pg.service';
import type { Mailer } from '../reminders/mailer';
import type { Op } from '../vibang/vibang.repo';
import { dummyHash, verifyPassword } from './password';

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');
export interface AuthConfig {
  readonly sessionTtlMinutes: number;
  readonly secureCookie: boolean;
  /** Các Origin được phép gọi thao tác ghi bằng cookie (CSRF). */
  readonly allowedOrigins: readonly string[];
  /** Địa chỉ web để dựng link trong email xác thực Admin; trống thì lấy Origin đầu tiên. */
  readonly publicWebUrl?: string;
}

/** Mailer của một tenant (null = chưa cấu hình). Tách ra để test thay bằng mailer giả. */
export type TenantMailerResolver = (tenantId: string) => Promise<Mailer | null>;
export const TENANT_MAILER = Symbol('TENANT_MAILER');

export const CHALLENGE_COOKIE = 'lo_challenge';
const LINK_TTL_MINUTES = 15;

export const SESSION_COOKIE = 'lo_session';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export type LoginResult =
  | { readonly status: 'ok'; readonly cookieValue: string; readonly userId: string }
  | { readonly status: 'invalid' }
  | { readonly status: 'locked' }
  | { readonly status: 'verification_required'; readonly challengeCookie: string }
  | { readonly status: 'rate_limited' }
  | { readonly status: 'mail_failed' }
  | { readonly status: 'unavailable' };

export type LinkResult =
  | { readonly status: 'ok'; readonly code: string; readonly validMinutes: number }
  | { readonly status: 'invalid' };

export type CodeResult =
  | { readonly status: 'ok'; readonly cookieValue: string }
  | {
      readonly status:
        | 'INVALID_CODE'
        | 'CODE_NOT_ISSUED'
        | 'CHALLENGE_INVALID'
        | 'CHALLENGE_EXPIRED'
        | 'CHALLENGE_LOCKED';
    };

export interface Membership {
  readonly officeId: string;
  readonly role: string;
  readonly legalSigner: boolean;
}

export interface BranchInfo {
  readonly id: string;
  readonly officeId: string;
  readonly name: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PgService) private readonly pg: PgService,
    @Inject(AUTH_CONFIG) readonly config: AuthConfig,
    @Inject(TENANT_MAILER) private readonly mailerFor: TenantMailerResolver,
  ) {}

  async login(tenantId: string, email: string, password: string): Promise<LoginResult> {
    const state = await this.pg.withTenant(tenantId, async (c) => {
      const { rows } = await c.query<{ user_id: string; password_hash: string; locked: boolean }>(
        'SELECT * FROM au_login_state($1,$2)',
        [tenantId, email],
      );
      return rows[0];
    });
    // Luôn tốn một lần băm, kể cả khi email lạ hoặc đang khoá.
    const matches = await verifyPassword(password, state?.password_hash ?? (await dummyHash()));
    if (state?.locked) return { status: 'locked' };
    if (!state || !matches) {
      const op = await this.pg.withTenant(tenantId, async (c) => {
        const { rows } = await c.query<Op>('SELECT * FROM au_login_failed($1,$2)', [
          tenantId,
          email,
        ]);
        return rows[0]!;
      });
      return op.code === 'ACCOUNT_LOCKED' ? { status: 'locked' } : { status: 'invalid' };
    }
    const required = await this.pg.withTenant(tenantId, async (c) => {
      const { rows } = await c.query<{ required: boolean }>(
        'SELECT au_admin_verification_required($1,$2) AS required',
        [tenantId, state.user_id],
      );
      return rows[0]?.required === true;
    });
    if (required) return this.startChallenge(tenantId, state.user_id);
    return this.openSession(tenantId, state.user_id);
  }

  private async openSession(tenantId: string, userId: string): Promise<LoginResult> {
    const token = randomBytes(32).toString('base64url');
    const op = await this.pg.withTenant(tenantId, async (c) => {
      const { rows } = await c.query<Op>('SELECT * FROM au_login_ok($1,$2,$3,$4)', [
        tenantId,
        userId,
        hashToken(token),
        this.config.sessionTtlMinutes,
      ]);
      return rows[0]!;
    });
    if (!op.ok) return { status: 'invalid' };
    return { status: 'ok', cookieValue: `${tenantId}.${token}`, userId };
  }

  /** Bước 2 cho Admin: tạo thử thách, gửi link qua email; chưa có phiên cho tới khi nhập đúng mã. */
  private async startChallenge(tenantId: string, userId: string): Promise<LoginResult> {
    const base = (this.config.publicWebUrl ?? this.config.allowedOrigins[0] ?? '').replace(
      /\/+$/,
      '',
    );
    if (!base) return { status: 'unavailable' };
    const secret = randomBytes(32).toString('base64url');
    const linkToken = randomBytes(32).toString('base64url');
    const created = await this.pg.withTenant(tenantId, async (c) => {
      const { rows } = await c.query<Op>('SELECT * FROM au_challenge_create($1,$2,$3,$4,$5)', [
        tenantId,
        userId,
        hashToken(secret),
        hashToken(linkToken),
        LINK_TTL_MINUTES,
      ]);
      const email = (
        await c.query<{ email: string | null }>('SELECT au_login_email($1,$2) AS email', [
          tenantId,
          userId,
        ])
      ).rows[0]?.email;
      return { op: rows[0]!, email };
    });
    if (!created.op.ok) {
      return {
        status: created.op.code === 'CHALLENGE_RATE_LIMITED' ? 'rate_limited' : 'unavailable',
      };
    }
    try {
      const mailer = await this.mailerFor(tenantId);
      if (!mailer || !created.email) return { status: 'mail_failed' };
      await mailer.send({
        to: created.email,
        subject: 'Xác thực đăng nhập Quản lý văn phòng',
        text: [
          'Có yêu cầu đăng nhập quản trị vào hệ thống.',
          '',
          `Bấm vào link sau để nhận mã xác thực (link dùng một lần, hết hạn sau ${LINK_TTL_MINUTES} phút):`,
          `${base}/xac-thuc?t=${tenantId}.${linkToken}`,
          '',
          'Nếu không phải bạn đăng nhập, đừng bấm link và hãy đổi mật khẩu.',
        ].join('\n'),
      });
    } catch {
      return { status: 'mail_failed' };
    }
    return { status: 'verification_required', challengeCookie: `${tenantId}.${secret}` };
  }

  /** Bấm link trong email: sinh mã 6 số một lần. Không cần phiên; mã vô dụng nếu thiếu cookie của trình duyệt đang đăng nhập. */
  async redeemLink(tenantId: string, token: string): Promise<LinkResult> {
    const row = await this.pg.withTenant(tenantId, async (c) => {
      const { rows } = await c.query<{
        status: string;
        code: string | null;
        valid_minutes: number;
      }>('SELECT * FROM au_challenge_link($1,$2)', [tenantId, hashToken(token)]);
      return rows[0];
    });
    if (row?.status !== 'OK' || !row.code) return { status: 'invalid' };
    return { status: 'ok', code: row.code, validMinutes: row.valid_minutes };
  }

  /** Nhập mã ở trình duyệt đã qua bước mật khẩu; đúng thì mở phiên. */
  async verifyCode(tenantId: string, secret: string, code: string): Promise<CodeResult> {
    const row = await this.pg.withTenant(tenantId, async (c) => {
      const { rows } = await c.query<{ status: string; user_id: string | null }>(
        'SELECT * FROM au_challenge_verify($1,$2,$3)',
        [tenantId, hashToken(secret), code],
      );
      return rows[0];
    });
    if (!row) return { status: 'CHALLENGE_INVALID' };
    if (row.status !== 'OK' || !row.user_id) return { status: row.status } as CodeResult;
    const session = await this.openSession(tenantId, row.user_id);
    return session.status === 'ok'
      ? { status: 'ok', cookieValue: session.cookieValue }
      : { status: 'CHALLENGE_INVALID' };
  }

  /** Tách `tenantId.token` từ cookie; sai định dạng thì null. */
  static parseCookieValue(value: string | undefined): { tenantId: string; token: string } | null {
    if (!value) return null;
    const dot = value.indexOf('.');
    if (dot < 0) return null;
    const tenantId = value.slice(0, dot);
    const token = value.slice(dot + 1);
    if (!UUID.test(tenantId) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return { tenantId, token };
  }

  async sessionUser(tenantId: string, token: string): Promise<string | null> {
    return this.pg.withTenant(tenantId, async (c) => {
      const { rows } = await c.query<{ user_id: string }>('SELECT * FROM au_session($1,$2)', [
        tenantId,
        hashToken(token),
      ]);
      return rows[0]?.user_id ?? null;
    });
  }

  async logout(tenantId: string, token: string): Promise<void> {
    await this.pg.withTenant(tenantId, (c) =>
      c.query('SELECT * FROM au_logout($1,$2)', [tenantId, hashToken(token)]),
    );
  }

  async memberships(tenantId: string, userId: string): Promise<Membership[]> {
    return this.pg.withTenant(tenantId, async (c) => {
      const { rows } = await c.query<{ office_id: string; role: string; legal_signer: boolean }>(
        'SELECT office_id, role, legal_signer FROM memberships WHERE tenant_id = $1 AND user_id = $2 ORDER BY role, office_id',
        [tenantId, userId],
      );
      return rows.map((r) => ({
        officeId: r.office_id,
        role: r.role,
        legalSigner: r.legal_signer,
      }));
    });
  }

  /** Chi nhánh của các văn phòng người dùng có vai (để chọn khi tạo hồ sơ); quyền thật vẫn do DB kiểm khi ghi. */
  async branches(tenantId: string, userId: string): Promise<BranchInfo[]> {
    return this.pg.withTenant(tenantId, async (c) => {
      const { rows } = await c.query<{ id: string; office_id: string; name: string }>(
        `SELECT b.id, b.office_id, b.name FROM branches b
          WHERE b.tenant_id = $1 AND EXISTS (
            SELECT 1 FROM memberships m WHERE m.tenant_id = $1 AND m.user_id = $2 AND m.office_id = b.office_id)
          ORDER BY b.name`,
        [tenantId, userId],
      );
      return rows.map((r) => ({ id: r.id, officeId: r.office_id, name: r.name }));
    });
  }

  async setPassword(
    tenantId: string,
    actorId: string,
    userId: string,
    email: string,
    hash: string,
  ): Promise<Op> {
    return this.pg.withTenant(tenantId, async (c) => {
      const { rows } = await c.query<Op>('SELECT * FROM au_set_password($1,$2,$3,$4,$5)', [
        tenantId,
        actorId,
        userId,
        email,
        hash,
      ]);
      return rows[0]!;
    });
  }
}
