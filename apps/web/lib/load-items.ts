import { API_URL } from './server';

/** Đọc một danh sách `{ items }` của API; lỗi mạng hoặc HTTP thì trả 'error' để trang tự hiện thông báo. */
export async function loadItems<T>(path: string, cookie: string | null): Promise<T[] | 'error'> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return ((await res.json()) as { items: T[] }).items;
  } catch {
    return 'error';
  }
}
