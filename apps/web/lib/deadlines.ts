export interface DeadlineItem {
  readonly domain: string;
  readonly refId: string;
  readonly caseId: string;
  readonly label: string;
  readonly deadlineAt: string;
  readonly status: string;
  readonly overdue: boolean;
  /** true = hạn pháp định NĐ 151; refId là id dòng hạn (dùng để ghi xong hoặc ghi hạn thỏa thuận). */
  readonly statutory?: boolean;
}

export interface OfficeCalendar {
  readonly workingWeekdays: readonly number[];
  readonly holidays: readonly { readonly day: string; readonly label: string }[];
}

export const DEADLINE_DOMAIN_LABEL: Record<string, string> = {
  TONG_DAT: 'Tống đạt',
  VIBANG_CSDL: 'Vi bằng · cập nhật CSDL',
  CONG_VAN: 'Công văn',
  TONG_DAT_BAO_KET_QUA: 'Tống đạt · báo kết quả (Điều 25.2)',
  VIBANG_N11: 'Vi bằng · cập nhật CSDL sau sửa lỗi N-11 (Điều 31.3)',
  XAC_MINH_QUYET_DINH: 'Xác minh · ra quyết định xác minh (Điều 35.1)',
  THA_THU_HOI: 'THA · thu hồi quyết định thi hành án (Điều 46.1)',
};

/** Trang đích của một hạn. Tống đạt và công văn chưa có trang chi tiết nên về danh sách. */
export function deadlineHref(d: Pick<DeadlineItem, 'domain' | 'caseId'>): string | null {
  if (d.domain === 'VIBANG_CSDL' || d.domain === 'VIBANG_N11') return `/vi-bang/${d.caseId}`;
  if (d.domain === 'TONG_DAT_BAO_KET_QUA') return '/tong-dat';
  if (d.domain === 'XAC_MINH_QUYET_DINH') return '/xac-minh';
  if (d.domain === 'THA_THU_HOI') return '/to-chuc-tha';
  if (d.domain === 'TONG_DAT') return '/tong-dat';
  if (d.domain === 'CONG_VAN') return '/cong-van';
  return null;
}

const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}
