import type { IncomingHttpHeaders } from 'node:http';

/** Người gọi đã xác thực. Chỉ mang định danh; vai và chi nhánh luôn được DB kiểm lại từng lần gọi. */
export interface AuthenticatedActor {
  readonly userId: string;
  readonly tenantId: string;
}

export interface ActorResolver {
  resolve(
    headers: IncomingHttpHeaders,
    method?: string,
  ): AuthenticatedActor | null | Promise<AuthenticatedActor | null>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mặc định: không ai được xác thực. Cơ chế đăng nhập thật chưa được chốt (xem #1), nên fail-closed. */
export class FailClosedResolver implements ActorResolver {
  resolve(): null {
    return null;
  }
}

/**
 * CHỈ để chứng minh trên dữ liệu giả lập (test/CI): đọc `x-synthetic-user` và `x-synthetic-tenant`.
 * Không có xác thực nào ở đây; tuyệt đối không bật ngoài môi trường test.
 */
export class SyntheticHeaderResolver implements ActorResolver {
  resolve(headers: IncomingHttpHeaders): AuthenticatedActor | null {
    const userId = headers['x-synthetic-user'];
    const tenantId = headers['x-synthetic-tenant'];
    if (typeof userId !== 'string' || typeof tenantId !== 'string') return null;
    if (!UUID.test(userId) || !UUID.test(tenantId)) return null;
    return { userId, tenantId };
  }
}

export function resolverFromEnv(env: NodeJS.ProcessEnv = process.env): ActorResolver {
  if (env.AUTH_MODE === 'synthetic-test') {
    if (env.NODE_ENV === 'production') {
      throw new Error('AUTH_MODE=synthetic-test is forbidden when NODE_ENV=production');
    }
    return new SyntheticHeaderResolver();
  }
  return new FailClosedResolver();
}
