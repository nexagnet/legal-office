import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PgService } from '../db/pg.service';
import type { Op } from '../vibang/vibang.repo';
import { dummyHash, verifyPassword } from './password';

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');
export interface AuthConfig {
  readonly sessionTtlMinutes: number;
  readonly secureCookie: boolean;
  /** Các Origin được phép gọi thao tác ghi bằng cookie (CSRF). */
  readonly allowedOrigins: readonly string[];
}

export const SESSION_COOKIE = 'lo_session';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export type LoginResult =
  | { readonly status: 'ok'; readonly cookieValue: string; readonly userId: string }
  | { readonly status: 'invalid' }
  | { readonly status: 'locked' };

export interface Membership {
  readonly officeId: string;
  readonly role: string;
  readonly legalSigner: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PgService) private readonly pg: PgService,
    @Inject(AUTH_CONFIG) readonly config: AuthConfig,
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
    const token = randomBytes(32).toString('base64url');
    const op = await this.pg.withTenant(tenantId, async (c) => {
      const { rows } = await c.query<Op>('SELECT * FROM au_login_ok($1,$2,$3,$4)', [
        tenantId,
        state.user_id,
        hashToken(token),
        this.config.sessionTtlMinutes,
      ]);
      return rows[0]!;
    });
    if (!op.ok) return { status: 'invalid' };
    return { status: 'ok', cookieValue: `${tenantId}.${token}`, userId: state.user_id };
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
