"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isKnownAction = exports.OFFICE_WIDE_ROLES = exports.ROLE_PERMISSIONS = void 0;
const types_1 = require("./types");
/**
 * BẢNG VAI → QUYỀN GIẢ LẬP. Chưa được owner chốt nghiệp vụ (xem #1); chỉ dùng để chứng minh cơ chế
 * fail-closed. Không suy diễn thẩm quyền pháp lý từ bảng này. `legal.sign` cố ý không có ở bất kỳ vai
 * nào: nó chỉ được cấp qua `Actor.legalSigner`.
 */
exports.ROLE_PERMISSIONS = {
    ADMIN: ['member.manage', 'audit.read'],
    TRUONG_VP: [
        'case.list',
        'case.read',
        'case.write',
        'file.download',
        'member.manage',
        'audit.read',
    ],
    THV: ['case.list', 'case.read', 'case.write', 'file.download'],
    THU_KY: ['case.list', 'case.read', 'case.write'],
    VAN_THU: ['case.list', 'case.read', 'file.download'],
    KE_TOAN: ['case.list', 'case.read'],
};
/** Vai thấy mọi chi nhánh trong văn phòng của mình. Giả định chưa chốt. */
exports.OFFICE_WIDE_ROLES = ['TRUONG_VP'];
const isKnownAction = (value) => types_1.ACTIONS.includes(value);
exports.isKnownAction = isKnownAction;
