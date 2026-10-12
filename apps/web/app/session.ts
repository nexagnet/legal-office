import type { Role } from './nav';

export type Session =
  | { readonly status: 'unauthenticated' }
  | {
      readonly status: 'authenticated';
      readonly roles: readonly Role[];
      readonly tenantName: string;
    };

const ROLES: readonly Role[] = ['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV', 'VAN_THU'];

/**
 * Cơ chế xác thực chưa được chủ dự án chốt, nên mặc định KHÔNG xác thực (đóng kín).
 * Chỉ ngoài production mới cho phép vai tổng hợp qua biến môi trường phía máy chủ để xem trước giao diện.
 * Menu chỉ là gợi ý hiển thị: mọi quyền thật được API và cơ sở dữ liệu kiểm tra.
 */
export function getSession(env: Record<string, string | undefined> = process.env): Session {
  if (env.NODE_ENV === 'production') return { status: 'unauthenticated' };
  const roles = (env.PREVIEW_SYNTHETIC_ROLES ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter((r): r is Role => (ROLES as readonly string[]).includes(r));
  if (roles.length === 0) return { status: 'unauthenticated' };
  return { status: 'authenticated', roles, tenantName: env.PREVIEW_TENANT_NAME ?? 'Văn phòng mẫu' };
}
