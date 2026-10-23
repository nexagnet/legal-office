import type { MyWorkItem } from './my-work-view';
import { API_URL } from './server';

export * from './my-work-view';

/** Việc được giao cho chính người đăng nhập, xuyên bốn nghiệp vụ. Lỗi thì trả 'error', không giả lập. */
export async function loadMyWork(
  cookie: string | null,
  officeId: string,
): Promise<MyWorkItem[] | 'error'> {
  try {
    const res = await fetch(`${API_URL}/office/my-work?officeId=${encodeURIComponent(officeId)}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return ((await res.json()) as { items: MyWorkItem[] }).items;
  } catch {
    return 'error';
  }
}
