'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { messageFor } from '../lib/messages';
import type { PostResult } from '../lib/post-json';

/** Toast lỗi không tự tắt và có nút "Thử lại"; thao tác ghi chỉ thử lại khi người dùng bấm (không tự gửi lại, tránh gửi trùng). */
function notifyError(message: string, retry: () => void) {
  toast.error(message, { duration: Infinity, action: { label: 'Thử lại', onClick: retry } });
}

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
        const message = messageFor(r.code);
        setError(message);
        notifyError(message, () => void run(action, ok));
        return false;
      }
      setNotice(ok);
      toast.success(ok);
      router.refresh();
      return true;
    } catch {
      const message = 'Không kết nối được máy chủ. Vui lòng thử lại.';
      setError(message);
      notifyError(message, () => void run(action, ok));
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return { busy, error, notice, run };
}
