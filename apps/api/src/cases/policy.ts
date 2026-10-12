import type { Actor, Decision, DenyReason, Role } from '../authz/types';
import type { ViBangCase } from './types';

export type CaseAction =
  | 'view'
  | 'create'
  | 'assign'
  | 'edit_internal'
  | 'request_change'
  | 'decide_change'
  | 'transition';

/**
 * GIẢ ĐỊNH CHƯA CHỐT (xem #1): các tập vai dưới đây chỉ thể hiện đúng những gì hợp đồng nghiệp vụ nêu rõ
 * (ai tạo, ai gán, THV xem chéo chi nhánh nhưng chỉ thao tác khi được gán). Phần còn lại là cấu hình giả lập.
 */
export const CREATE_ROLES: readonly Role[] = ['ADMIN', 'THV', 'THU_KY', 'VAN_THU'];
export const SUPPORT_EDIT_ROLES: readonly Role[] = ['ADMIN', 'THV', 'THU_KY', 'VAN_THU'];
/** Vai thấy hồ sơ Vi bằng ở mọi chi nhánh của văn phòng; vai khác cần branch grant. */
export const READ_ANY_BRANCH_ROLES: readonly Role[] = ['ADMIN', 'TRUONG_VP', 'THV', 'THU_KY'];
export const VIEW_ROLES: readonly Role[] = [
  'ADMIN',
  'TRUONG_VP',
  'THV',
  'THU_KY',
  'VAN_THU',
  'KE_TOAN',
];

const deny = (reason: DenyReason): Decision => ({ allow: false, reason });
const ALLOW: Decision = { allow: true, reason: 'ALLOWED' };

/** Tài nguyên tối thiểu để tạo hồ sơ mới (chưa có Case). */
export interface CaseScope {
  readonly tenantId: string;
  readonly officeId: string;
  readonly branchId: string;
}

function checkScope(
  actor: Actor,
  scope: CaseScope,
  anyBranchRoles: readonly Role[],
): Decision | null {
  if (actor.tenantId !== scope.tenantId) return deny('TENANT_MISMATCH');
  if (actor.officeId !== scope.officeId) return deny('OFFICE_MISMATCH');
  if (!anyBranchRoles.includes(actor.role) && !actor.branchIds.includes(scope.branchId)) {
    return deny('BRANCH_NOT_GRANTED');
  }
  return null;
}

export function decideCreate(actor: Actor, scope: CaseScope): Decision {
  const scoped = checkScope(actor, scope, READ_ANY_BRANCH_ROLES);
  if (scoped) return scoped;
  return CREATE_ROLES.includes(actor.role) ? ALLOW : deny('ROLE_LACKS_PERMISSION');
}

/** Quyết định thuần, fail-closed, cho thao tác trên hồ sơ đã tồn tại. */
export function decideCaseAction(actor: Actor, action: CaseAction, c: ViBangCase): Decision {
  if (action === 'create') return deny('UNKNOWN_ACTION');
  const scoped = checkScope(actor, c, READ_ANY_BRANCH_ROLES);
  if (scoped) return scoped;

  switch (action) {
    case 'view':
      return VIEW_ROLES.includes(actor.role) ? ALLOW : deny('ROLE_LACKS_PERMISSION');
    case 'assign':
    case 'decide_change':
      return actor.role === 'ADMIN' ? ALLOW : deny('ADMIN_ONLY');
    case 'edit_internal':
    case 'request_change':
    case 'transition': {
      if (!SUPPORT_EDIT_ROLES.includes(actor.role)) return deny('ROLE_LACKS_PERMISSION');
      // THV xem chéo chi nhánh nhưng chỉ thao tác trên hồ sơ mình được gán.
      if (actor.role === 'THV' && c.responsibleThvId !== actor.userId)
        return deny('NOT_RESPONSIBLE_THV');
      return ALLOW;
    }
    default:
      return deny('UNKNOWN_ACTION');
  }
}
