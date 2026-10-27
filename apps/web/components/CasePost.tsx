'use client';

import { useRouter } from 'next/navigation';
import { useDialogClose } from './StageDialog';
import { useState } from 'react';
import { toast } from 'sonner';
import { messageFor } from '../lib/messages';

/** Gọi một API ghi của hồ sơ rồi làm mới trang; lỗi hiển thị bằng thông điệp tiếng Việt theo mã. */
export function useCasePost() {
  const router = useRouter();
  const closeDialog = useDialogClose();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(
    path: string,
    body: unknown,
    method: 'POST' | 'PUT' = 'POST',
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vibang/${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) {
        const message = messageFor(json.code);
        setError(message);
        toast.error(message, { duration: Infinity });
        return false;
      }
      toast.success('Đã lưu');
      router.refresh();
      closeDialog?.();
      return true;
    } catch {
      const message = 'Không kết nối được máy chủ. Vui lòng thử lại.';
      setError(message);
      toast.error(message, { duration: Infinity });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { post, error, busy };
}
