'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '../lib/messages';
import type { PostResult } from '../lib/post-json';

/** Chạy một thao tác ghi: khoá nút khi đang gửi, hiện lý do tiếng Việt khi lỗi, làm mới dữ liệu khi xong. */
export function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<PostResult>, ok: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await action();
      if (!r.ok) {
        setError(messageFor(r.code));
        return false;
      }
      setNotice(ok);
      router.refresh();
      return true;
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, notice, run };
}
