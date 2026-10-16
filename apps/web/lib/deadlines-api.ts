import { API_URL } from './server';
import type { DeadlineItem, OfficeCalendar } from './deadlines';

async function getWithCookie<T>(path: string, cookie: string | null): Promise<T | 'error'> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return (await res.json()) as T;
  } catch {
    return 'error';
  }
}

/** Hạn sắp tới và quá hạn trong 7 ngày. Chỉ để nhắc trong ứng dụng. */
export function loadDeadlines(
  cookie: string | null,
  officeId: string,
): Promise<DeadlineItem[] | 'error'> {
  return getWithCookie(
    `/office/deadlines?officeId=${encodeURIComponent(officeId)}&withinDays=7`,
    cookie,
  );
}

export function loadCalendar(
  cookie: string | null,
  officeId: string,
): Promise<OfficeCalendar | 'error'> {
  return getWithCookie(`/office/calendar?officeId=${encodeURIComponent(officeId)}`, cookie);
}
