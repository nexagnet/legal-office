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

export interface BranchAccessRow {
  readonly userId: string;
  readonly branchId: string;
  readonly branchName: string;
  /** DMS: cấp theo mô hình mới, thu hồi được. LEGACY: cấp phát cũ theo vai, chỉ hiển thị. */
  readonly source: 'DMS' | 'LEGACY';
}

/** Ai đang được xem chi nhánh nào. Lỗi (không đủ quyền...) = danh sách rỗng, trang vẫn dựng được. */
export async function loadBranchAccess(
  cookie: string | null,
  officeId: string,
): Promise<BranchAccessRow[]> {
  const body = await getJson<{ rows: BranchAccessRow[] }>(
    `/dms/branch-access?${q(officeId)}`,
    cookie,
  );
  return body === 'error' ? [] : body.rows;
}

export interface OfficeBranch {
  readonly id: string;
  readonly name: string;
}

export async function loadOfficeBranches(
  cookie: string | null,
  officeId: string,
): Promise<OfficeBranch[]> {
  const body = await getJson<{ branches: OfficeBranch[] }>(
    `/office/settings?${q(officeId)}`,
    cookie,
  );
  return body === 'error' ? [] : body.branches;
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
  /** Quyền riêng xuất bản sao nhật ký phân quyền (Admin mặc nhiên có). */
  readonly canExportAudit: boolean;
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
    canExportAudit: perms.includes('dms.audit.export'),
    members,
    groups,
    requests,
  };
}

export interface UnassignedCase {
  readonly id: string;
  readonly domain: string;
  readonly title: string;
  readonly status: string;
  readonly createdAt: string;
}

/** Hồ sơ chưa có chi nhánh (chỉ Admin thấy). Lỗi/không đủ quyền = rỗng, trang vẫn dựng được. */
export async function loadUnassignedCases(
  cookie: string | null,
  officeId: string,
): Promise<{ total: number; rows: UnassignedCase[] }> {
  const body = await getJson<{ total: number; rows: UnassignedCase[] }>(
    `/dms/cases-without-branch?${q(officeId)}`,
    cookie,
  );
  return body === 'error' ? { total: 0, rows: [] } : body;
}
