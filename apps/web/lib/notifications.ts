import { API_URL } from './server';
import type { NotificationItem } from './notifications-view';

export * from './notifications-view';

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
