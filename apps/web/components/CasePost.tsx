'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '../lib/messages';

/** Gọi một API ghi của hồ sơ rồi làm mới trang; lỗi hiển thị bằng thông điệp tiếng Việt theo mã. */
export function useCasePost() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(path: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vibang/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) {
        setError(messageFor(json.code));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { post, error, busy };
}
