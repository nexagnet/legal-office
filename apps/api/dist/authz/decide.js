"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decide = decide;
const policy_1 = require("./policy");
const deny = (reason) => ({ allow: false, reason });
/**
 * Quyết định thuần, fail-closed: mọi nhánh không chứng minh được quyền đều từ chối. Thứ tự kiểm tra
 * đi từ ranh giới tenant vào trong, để lý do từ chối luôn là ranh giới ngoài cùng bị vi phạm.
 */
function decide(actor, action, resource) {
    if (!(0, policy_1.isKnownAction)(action))
        return deny('UNKNOWN_ACTION');
    if (actor.tenantId !== resource.tenantId)
        return deny('TENANT_MISMATCH');
    if (actor.officeId !== resource.officeId)
        return deny('OFFICE_MISMATCH');
    if (action === 'legal.sign') {
        if (!actor.legalSigner)
            return deny('SIGNING_AUTHORITY_NOT_GRANTED');
    }
    else if (!policy_1.ROLE_PERMISSIONS[actor.role]?.includes(action)) {
        return deny('ROLE_LACKS_PERMISSION');
    }
    if (resource.branchId !== null && !policy_1.OFFICE_WIDE_ROLES.includes(actor.role)) {
        if (!actor.branchIds.includes(resource.branchId))
            return deny('BRANCH_NOT_GRANTED');
    }
    return { allow: true, reason: 'ALLOWED' };
}
