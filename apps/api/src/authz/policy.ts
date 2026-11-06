import { ACTIONS, type Action, type Role } from './types';

/**
 * BẢNG VAI → QUYỀN GIẢ LẬP. Chưa được owner chốt nghiệp vụ (xem #1); chỉ dùng để chứng minh cơ chế
 * fail-closed. Không suy diễn thẩm quyền pháp lý từ bảng này. `legal.sign` cố ý không có ở bất kỳ vai
 * nào: nó chỉ được cấp qua `Actor.legalSigner`.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Action[]>> = {
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
  /** Chỉ là tư cách thành viên: mọi quyền DMS đến từ nhóm quyền, không từ vai. */
  THANH_VIEN: [],
};

/** Vai thấy mọi chi nhánh trong văn phòng của mình. Giả định chưa chốt. */
export const OFFICE_WIDE_ROLES: readonly Role[] = ['TRUONG_VP'];

export const isKnownAction = (value: string): value is Action =>
  (ACTIONS as readonly string[]).includes(value);
