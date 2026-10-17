export interface DeadlineItem {
  readonly domain: string;
  readonly refId: string;
  readonly caseId: string;
  readonly label: string;
  readonly deadlineAt: string;
  readonly status: string;
  readonly overdue: boolean;
}

export interface OfficeCalendar {
  readonly workingWeekdays: readonly number[];
  readonly holidays: readonly { readonly day: string; readonly label: string }[];
}

export const DEADLINE_DOMAIN_LABEL: Record<string, string> = {
  TONG_DAT: 'Tống đạt',
  VIBANG_CSDL: 'Vi bằng · cập nhật CSDL',
  CONG_VAN: 'Công văn',
};

/** Trang đích của một hạn. Tống đạt và công văn chưa có trang chi tiết nên về danh sách. */
export function deadlineHref(d: Pick<DeadlineItem, 'domain' | 'caseId'>): string | null {
  if (d.domain === 'VIBANG_CSDL') return `/vi-bang/${d.caseId}`;
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
