'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { messageFor } from '../lib/messages';
import type { PostResult } from '../lib/post-json';

/** Chạy một thao tác ghi: khoá nút khi đang gửi, hiện lý do tiếng Việt khi lỗi, làm mới dữ liệu khi xong. */
export function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** `busy` chỉ cập nhật sau lượt vẽ kế tiếp; cờ này chặn bấm đúp ngay lập tức. */
  const running = useRef(false);

  async function run(action: () => Promise<PostResult>, ok: string): Promise<boolean> {
    if (running.current) return false;
    running.current = true;
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
      running.current = false;
      setBusy(false);
    }
  }

  return { busy, error, notice, run };
}
