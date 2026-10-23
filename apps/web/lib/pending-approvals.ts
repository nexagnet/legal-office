import { API_URL } from './server';

/**
 * Số đề xuất đang chờ duyệt, cho huy hiệu trên menu. Lỗi hoặc phản hồi lạ trả `null`
 * (không hiện huy hiệu): huy hiệu chỉ là gợi ý, không được làm hỏng khung trang.
 */
export async function loadPendingApprovalCount(
  cookie: string | null,
  officeId: string,
  fetcher: typeof fetch = fetch,
): Promise<number | null> {
  try {
    const res = await fetcher(
      `${API_URL}/approvals/pending?officeId=${encodeURIComponent(officeId)}`,
      { headers: cookie ? { cookie } : {}, cache: 'no-store' },
    );
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return Array.isArray(body) ? body.length : null;
  } catch {
    return null;
  }
}
