import type { CorrespondenceDetail } from './correspondence-view';
import { API_URL } from './server';

export * from './correspondence-view';

/** Không đọc được hoặc không có quyền thì 'notfound' (máy chủ trả 404); lỗi khác trả 'error'. */
export async function loadCorrespondence(
  cookie: string | null,
  id: string,
): Promise<CorrespondenceDetail | 'notfound' | 'error'> {
  try {
    const res = await fetch(`${API_URL}/office/correspondence/${encodeURIComponent(id)}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (res.status === 404) return 'notfound';
    if (!res.ok) return 'error';
    return (await res.json()) as CorrespondenceDetail;
  } catch {
    return 'error';
  }
}
