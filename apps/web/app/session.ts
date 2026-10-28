import type { Role } from './nav';

export interface Membership {
  readonly officeId: string;
  readonly role: Role;
  readonly legalSigner: boolean;
}
export interface Branch {
  readonly id: string;
  readonly officeId: string;
  readonly name: string;
}

export type Session =
  | { readonly status: 'unauthenticated' }
  | {
      readonly status: 'authenticated';
      readonly roles: readonly Role[];
      readonly tenantName: string;
      readonly userId?: string;
      readonly displayName?: string | null;
      readonly memberships: readonly Membership[];
      readonly branches: readonly Branch[];
    };

const ROLES: readonly Role[] = ['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV', 'VAN_THU', 'KE_TOAN'];
const isRole = (r: unknown): r is Role => (ROLES as readonly unknown[]).includes(r);

export type Fetcher = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

interface MeBody {
  readonly userId?: string;
  readonly displayName?: string | null;
  readonly memberships?: readonly { officeId: string; role: string; legalSigner: boolean }[];
  readonly branches?: readonly Branch[];
}

/**
 * Phiên lấy từ API (`GET /auth/me`) bằng cookie của trình duyệt, không tự suy ra quyền ở web.
 * Lỗi mạng hoặc phản hồi lạ đều coi là chưa đăng nhập (đóng kín). Menu chỉ là gợi ý hiển thị; quyền thật do API/DB kiểm.
 * Ngoài production, `PREVIEW_SYNTHETIC_ROLES` cho phép xem trước giao diện với vai tổng hợp (không gọi API).
 */
export async function loadSession(
  cookie: string | null,
  env: Record<string, string | undefined> = process.env,
  fetcher: Fetcher = (url, init) => fetch(url, { ...init, cache: 'no-store' }),
): Promise<Session> {
  const tenantName = env.TENANT_NAME ?? 'Văn phòng';
  if (env.NODE_ENV !== 'production') {
    const roles = (env.PREVIEW_SYNTHETIC_ROLES ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter(isRole);
    if (roles.length > 0) {
      return {
        status: 'authenticated',
        roles,
        tenantName,
        memberships: roles.map((role) => ({ officeId: 'preview', role, legalSigner: false })),
        branches: [],
      };
    }
  }
  if (!cookie) return { status: 'unauthenticated' };
  try {
    const res = await fetcher(`${env.API_URL ?? 'http://localhost:3001'}/auth/me`, {
      headers: { cookie },
    });
    if (!res.ok) return { status: 'unauthenticated' };
    const body = (await res.json()) as MeBody;
    const memberships = (body.memberships ?? []).filter((m) => isRole(m.role)) as Membership[];
    if (memberships.length === 0) return { status: 'unauthenticated' };
    return {
      status: 'authenticated',
      roles: [...new Set(memberships.map((m) => m.role))],
      tenantName,
      userId: body.userId,
      displayName: body.displayName ?? null,
      memberships,
      branches: body.branches ?? [],
    };
  } catch {
    return { status: 'unauthenticated' };
  }
}
