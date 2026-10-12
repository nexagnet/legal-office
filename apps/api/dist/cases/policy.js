"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VIEW_ROLES = exports.READ_ANY_BRANCH_ROLES = exports.SUPPORT_EDIT_ROLES = exports.CREATE_ROLES = void 0;
exports.decideCreate = decideCreate;
exports.decideCaseAction = decideCaseAction;
/**
 * GIẢ ĐỊNH CHƯA CHỐT (xem #1): các tập vai dưới đây chỉ thể hiện đúng những gì hợp đồng nghiệp vụ nêu rõ
 * (ai tạo, ai gán, THV xem chéo chi nhánh nhưng chỉ thao tác khi được gán). Phần còn lại là cấu hình giả lập.
 */
exports.CREATE_ROLES = ['ADMIN', 'THV', 'THU_KY', 'VAN_THU'];
exports.SUPPORT_EDIT_ROLES = ['ADMIN', 'THV', 'THU_KY', 'VAN_THU'];
/** Vai thấy hồ sơ Vi bằng ở mọi chi nhánh của văn phòng; vai khác cần branch grant. */
exports.READ_ANY_BRANCH_ROLES = ['ADMIN', 'TRUONG_VP', 'THV', 'THU_KY'];
exports.VIEW_ROLES = [
    'ADMIN',
    'TRUONG_VP',
    'THV',
    'THU_KY',
    'VAN_THU',
    'KE_TOAN',
];
const deny = (reason) => ({ allow: false, reason });
const ALLOW = { allow: true, reason: 'ALLOWED' };
function checkScope(actor, scope, anyBranchRoles) {
    if (actor.tenantId !== scope.tenantId)
        return deny('TENANT_MISMATCH');
    if (actor.officeId !== scope.officeId)
        return deny('OFFICE_MISMATCH');
    if (!anyBranchRoles.includes(actor.role) && !actor.branchIds.includes(scope.branchId)) {
        return deny('BRANCH_NOT_GRANTED');
    }
    return null;
}
function decideCreate(actor, scope) {
    const scoped = checkScope(actor, scope, exports.READ_ANY_BRANCH_ROLES);
    if (scoped)
        return scoped;
    return exports.CREATE_ROLES.includes(actor.role) ? ALLOW : deny('ROLE_LACKS_PERMISSION');
}
/** Quyết định thuần, fail-closed, cho thao tác trên hồ sơ đã tồn tại. */
function decideCaseAction(actor, action, c) {
    if (action === 'create')
        return deny('UNKNOWN_ACTION');
    const scoped = checkScope(actor, c, exports.READ_ANY_BRANCH_ROLES);
    if (scoped)
        return scoped;
    switch (action) {
        case 'view':
            return exports.VIEW_ROLES.includes(actor.role) ? ALLOW : deny('ROLE_LACKS_PERMISSION');
        case 'assign':
        case 'decide_change':
            return actor.role === 'ADMIN' ? ALLOW : deny('ADMIN_ONLY');
        case 'edit_internal':
        case 'request_change':
        case 'transition': {
            if (!exports.SUPPORT_EDIT_ROLES.includes(actor.role))
                return deny('ROLE_LACKS_PERMISSION');
            // THV xem chéo chi nhánh nhưng chỉ thao tác trên hồ sơ mình được gán.
            if (actor.role === 'THV' && c.responsibleThvId !== actor.userId)
                return deny('NOT_RESPONSIBLE_THV');
            return ALLOW;
        }
        default:
            return deny('UNKNOWN_ACTION');
    }
}
