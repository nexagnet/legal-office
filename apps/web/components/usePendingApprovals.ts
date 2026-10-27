'use client';

import { useEffect, useState } from 'react';

/** Số đề xuất chờ duyệt từ phản hồi API; phản hồi lạ trả `null` (huy hiệu chỉ là gợi ý, không được làm hỏng khung). */
export function parsePendingCount(body: unknown): number | null {
  return Array.isArray(body) ? body.length : null;
}

/** Nạp số chờ duyệt ở trình duyệt, làm mới mỗi lần đổi trang; lỗi thì giữ giá trị cũ. */
export function usePendingApprovals(officeId: string | undefined, pathname: string): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!officeId) return;
    const ctrl = new AbortController();
    fetch(`/api/approvals/pending?officeId=${encodeURIComponent(officeId)}`, {
      cache: 'no-store',
      signal: ctrl.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        const n = parsePendingCount(body);
        if (n !== null) setCount(n);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [officeId, pathname]);
  return count;
}
