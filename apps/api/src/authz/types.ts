export const ROLES = ['ADMIN', 'TRUONG_VP', 'THV', 'THU_KY', 'VAN_THU', 'KE_TOAN'] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  'case.list',
  'case.read',
  'case.write',
  'file.download',
  'member.manage',
  'audit.read',
  'legal.sign',
] as const;
export type Action = (typeof ACTIONS)[number];

export interface Actor {
  readonly userId: string;
  readonly tenantId: string;
  readonly officeId: string;
  readonly role: Role;
  /** Chi nhánh được cấp cho thành viên này (branch_grants). */
  readonly branchIds: readonly string[];
  /**
   * Quyền ký pháp lý là một cấp phép riêng, KHÔNG suy ra từ vai trò. Giá trị này chỉ nên được
   * bật bởi quy trình nghiệp vụ đã chốt; ở lát 1 chỉ dùng trong fixture giả lập.
   */
  readonly legalSigner: boolean;
}

export interface Resource {
  readonly tenantId: string;
  readonly officeId: string;
  readonly branchId: string | null;
}

export const DENY_REASONS = [
  'UNKNOWN_ACTION',
  'TENANT_MISMATCH',
  'OFFICE_MISMATCH',
  'ROLE_LACKS_PERMISSION',
  'BRANCH_NOT_GRANTED',
  'SIGNING_AUTHORITY_NOT_GRANTED',
  'ADMIN_ONLY',
  'NOT_RESPONSIBLE_THV',
  'RESPONSIBLE_THV_REQUIRED',
] as const;
export type DenyReason = (typeof DENY_REASONS)[number];

export type Decision =
  | { readonly allow: true; readonly reason: 'ALLOWED' }
  | { readonly allow: false; readonly reason: DenyReason };
