"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DENY_REASONS = exports.ACTIONS = exports.ROLES = void 0;
exports.ROLES = ['ADMIN', 'TRUONG_VP', 'THV', 'THU_KY', 'VAN_THU', 'KE_TOAN'];
exports.ACTIONS = [
    'case.list',
    'case.read',
    'case.write',
    'file.download',
    'member.manage',
    'audit.read',
    'legal.sign',
];
exports.DENY_REASONS = [
    'UNKNOWN_ACTION',
    'TENANT_MISMATCH',
    'OFFICE_MISMATCH',
    'ROLE_LACKS_PERMISSION',
    'BRANCH_NOT_GRANTED',
    'SIGNING_AUTHORITY_NOT_GRANTED',
    'ADMIN_ONLY',
    'NOT_RESPONSIBLE_THV',
    'RESPONSIBLE_THV_REQUIRED',
];
