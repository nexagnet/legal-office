import {
  CASE_STATUS_LABEL,
  ENFORCEMENT_STATUS_LABEL,
  SERVICE_STATUS_LABEL,
  VERIFICATION_STATUS_LABEL,
} from './messages';

export interface MyWorkItem {
  readonly domain: string;
  readonly refId: string;
  readonly label: string;
  readonly status: string;
  readonly deadlineAt: string | null;
  readonly overdue: boolean;
  /** Người tạo hồ sơ/yêu cầu (mã người dùng); họ tên tra qua `loadPeopleNames`. */
  readonly createdBy?: string | null;
}

export const MY_WORK_DOMAIN_LABEL: Record<string, string> = {
  VIBANG: 'Vi bằng',
  TONG_DAT: 'Tống đạt',
  XAC_MINH: 'Xác minh',
  THI_HANH: 'Tổ chức thi hành án',
};

/** Trang đích của một việc. Tống đạt, xác minh và THA chưa có trang chi tiết nên về danh sách. */
export function myWorkHref(item: Pick<MyWorkItem, 'domain' | 'refId'>): string | null {
  if (item.domain === 'VIBANG') return `/vi-bang/${item.refId}`;
  if (item.domain === 'TONG_DAT') return '/tong-dat';
  if (item.domain === 'XAC_MINH') return '/xac-minh';
  if (item.domain === 'THI_HANH') return '/to-chuc-tha';
  return null;
}

export function myWorkStatusLabel(item: Pick<MyWorkItem, 'domain' | 'status'>): string {
  if (item.domain === 'VIBANG') return CASE_STATUS_LABEL[item.status] ?? item.status;
  if (item.domain === 'TONG_DAT') return SERVICE_STATUS_LABEL[item.status] ?? item.status;
  if (item.domain === 'XAC_MINH') return VERIFICATION_STATUS_LABEL[item.status] ?? item.status;
  if (item.domain === 'THI_HANH') return ENFORCEMENT_STATUS_LABEL[item.status] ?? item.status;
  return item.status;
}
