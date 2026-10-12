import type { IncomingHttpHeaders } from 'node:http';
import type { ActorResolver, AuthenticatedActor } from '../http/actor';
import { AuthService, SESSION_COOKIE } from './auth.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function readCookie(headers: IncomingHttpHeaders, name: string): string | undefined {
  const raw = headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** Xác định người gọi từ cookie phiên. Thao tác ghi từ Origin lạ bị từ chối (chống CSRF, bổ sung cho SameSite). */
export class SessionResolver implements ActorResolver {
  constructor(private readonly auth: AuthService) {}

  async resolve(headers: IncomingHttpHeaders, method = 'GET'): Promise<AuthenticatedActor | null> {
    const parsed = AuthService.parseCookieValue(readCookie(headers, SESSION_COOKIE));
    if (!parsed) return null;
    if (!SAFE_METHODS.has(method.toUpperCase())) {
      const origin = headers.origin;
      if (typeof origin === 'string' && !this.auth.config.allowedOrigins.includes(origin))
        return null;
    }
    const userId = await this.auth.sessionUser(parsed.tenantId, parsed.token);
    return userId ? { userId, tenantId: parsed.tenantId } : null;
  }
}
