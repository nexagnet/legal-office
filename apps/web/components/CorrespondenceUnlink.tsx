'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '../lib/messages';
import { postJson } from '../lib/post-json';
import { Button } from './ui/button';

/** Bỏ liên kết hồ sơ của công văn (gửi cả hai trường rỗng). Chỉ khi chưa hoàn tất; quyền do DB quyết định. */
export function CorrespondenceUnlink({ id }: { readonly id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      const r = await postJson(`/office/correspondence/${id}/link`, {
        caseKind: null,
        caseId: null,
      });
      if (!r.ok) return setError(messageFor(r.code));
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="ghost" loading={busy} onClick={() => void unlink()}>
        Bỏ liên kết
      </Button>
      {error ? (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}
    </>
  );
}
