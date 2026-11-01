import { loadMembers, type Member } from './admin-api';
import { loadMyDmsPermissions } from './dms';
import { API_URL, currentSession, requestCookie } from './server';
import type { DmsGroup, PermissionRequest } from './permission-model';

export type { DmsGroup, PermissionRequest } from './permission-model';

async function getJson<T>(path: string, cookie: string | null): Promise<T | 'error'> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    return res.ok ? ((await res.json()) as T) : 'error';
  } catch {
    return 'error';
  }
}

const q = (officeId: string) => `officeId=${encodeURIComponent(officeId)}`;

export async function loadDmsGroups(
  cookie: string | null,
  officeId: string,
): Promise<DmsGroup[] | 'error'> {
  const body = await getJson<{ rows: DmsGroup[] }>(`/dms/groups?${q(officeId)}`, cookie);
  return body === 'error' ? 'error' : body.rows;
}

export async function loadPermissionRequests(
  cookie: string | null,
  officeId: string,
): Promise<PermissionRequest[] | 'error'> {
  const body = await getJson<{ rows: PermissionRequest[] }>(
    `/dms/permission-requests?${q(officeId)}`,
    cookie,
  );
  return body === 'error' ? 'error' : body.rows;
}

export interface PermissionContext {
  readonly officeId: string;
  readonly userId: string | null;
  readonly isAdmin: boolean;
  readonly roles: readonly string[];
  readonly canApprove: boolean;
  readonly canPropose: boolean;
  readonly members: readonly Member[] | 'error';
  readonly groups: DmsGroup[] | 'error';
  readonly requests: PermissionRequest[] | 'error';
}

/**
 * Dữ liệu chung của mục Phân quyền. Quyền xem lấy từ quyền hiệu lực DMS (Admin mặc nhiên đủ), không từ vai.
 * Trả null khi chưa đăng nhập hoặc không có văn phòng; người không đủ quyền nhận danh sách rỗng và UI hiện trạng thái 403.
 */
export async function loadPermissionContext(): Promise<PermissionContext | null> {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  if (!officeId) return null;
  const cookie = await requestCookie();
  const perms = await loadMyDmsPermissions(cookie, officeId);
  const canApprove = perms.includes('dms.permission.approve');
  const canPropose = perms.includes('dms.permission.propose') || canApprove;
  const [members, groups, requests] = canPropose
    ? await Promise.all([
        loadMembers(cookie, officeId),
        loadDmsGroups(cookie, officeId),
        loadPermissionRequests(cookie, officeId),
      ])
    : (['error', 'error', 'error'] as const);
  return {
    officeId,
    userId: session.userId ?? null,
    isAdmin: session.roles.includes('ADMIN'),
    roles: session.roles,
    canApprove,
    canPropose,
    members,
    groups,
    requests,
  };
}
