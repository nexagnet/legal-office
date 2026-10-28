import { deadlineHref } from './deadlines';
import { API_URL } from './server';

export interface NotificationItem {
  readonly id: string;
  readonly kind: 'DEADLINE_DUE_SOON' | 'DEADLINE_OVERDUE';
  readonly domain: string;
  readonly refId: string;
  readonly caseId: string | null;
  readonly label: string;
  readonly deadlineAt: string;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly overdue: boolean;
}

export type NotificationTab = 'tat-ca' | 'chua-doc' | 'qua-han';

export const NOTIFICATION_TABS: readonly { key: NotificationTab; label: string }[] = [
  { key: 'tat-ca', label: 'Tất cả' },
  { key: 'chua-doc', label: 'Chưa đọc' },
  { key: 'qua-han', label: 'Quá hạn' },
];

export function parseTab(v: string | undefined): NotificationTab {
  return v === 'chua-doc' || v === 'qua-han' ? v : 'tat-ca';
}

export function filterNotifications(
  items: readonly NotificationItem[],
  tab: NotificationTab,
): NotificationItem[] {
  if (tab === 'chua-doc') return items.filter((i) => i.readAt === null);
  if (tab === 'qua-han') return items.filter((i) => i.overdue);
  return [...items];
}

export function notificationHref(n: Pick<NotificationItem, 'domain' | 'caseId'>): string | null {
  return deadlineHref({ domain: n.domain, caseId: n.caseId ?? '' });
}

/** Thông báo là nhắc hạn sinh từ hạn người dùng được xem; lỗi thì trả 'error', không giả lập. */
export async function loadNotifications(
  cookie: string | null,
  officeId: string,
): Promise<NotificationItem[] | 'error'> {
  try {
    const res = await fetch(
      `${API_URL}/office/notifications?officeId=${encodeURIComponent(officeId)}&limit=200`,
      { headers: cookie ? { cookie } : {}, cache: 'no-store' },
    );
    if (!res.ok) return 'error';
    return ((await res.json()) as { items: NotificationItem[] }).items;
  } catch {
    return 'error';
  }
}
