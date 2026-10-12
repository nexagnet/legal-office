/** Hồ sơ Vi bằng (lát #6). Mô hình thuần, bất biến; lưu trữ nằm ở lớp dữ liệu. */

export const CASE_STATUSES = [
  'INTAKE',
  'ASSIGNED',
  'SIGNED',
  'STAMPED',
  'RETURNED',
  'CANCELLED',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/**
 * Bằng chứng pháp lý do các lát khác ghi nhận (#7 số/MISA, #8 ký/dấu/scan). Lát này chỉ KIỂM TRA sự có mặt
 * của chúng khi chuyển trạng thái, không tự tạo ra chúng.
 */
export const PROOFS = [
  'MISA_CONFIRMED_FULL',
  'NUMBER_ALLOCATED',
  'FINAL_SCAN_WITH_SIGNATURE_AND_STAMP',
] as const;
export type Proof = (typeof PROOFS)[number];

/** Trường nội bộ được sửa trực tiếp trong 48 giờ đầu. Mọi trường khác (nội dung pháp lý cuối) đi đường N-11. */
export const INTERNAL_FIELDS = ['title', 'description', 'contactNote'] as const;
export type InternalField = (typeof INTERNAL_FIELDS)[number];
export type InternalFields = Readonly<Record<InternalField, string>>;

export type CustomerKind = 'PERSON' | 'ORGANIZATION';

export interface ViBangCase {
  readonly id: string;
  readonly tenantId: string;
  readonly officeId: string;
  readonly branchId: string;
  readonly customerKind: CustomerKind;
  readonly customerId: string;
  /** Hợp đồng tuỳ chọn khi tiếp nhận; một hợp đồng có thể gắn nhiều hồ sơ. */
  readonly contractId: string | null;
  readonly status: CaseStatus;
  /** Đúng một THV chịu trách nhiệm; chỉ Admin gán. */
  readonly responsibleThvId: string | null;
  readonly fields: InternalFields;
  readonly proofs: readonly Proof[];
  readonly cancelReason: string | null;
  readonly createdAt: string;
  /** Khoá lạc quan: tăng 1 sau mỗi thay đổi. */
  readonly version: number;
}

export type ChangeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ChangeRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly caseId: string;
  readonly requestedBy: string;
  readonly reason: string;
  readonly before: Partial<InternalFields>;
  readonly after: Partial<InternalFields>;
  readonly status: ChangeRequestStatus;
  readonly createdAt: string;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
}
