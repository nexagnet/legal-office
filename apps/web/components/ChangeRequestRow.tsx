'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '../lib/messages';

interface Props {
  readonly requestId: string;
  readonly canDecide: boolean;
}

/** Admin duyệt hoặc từ chối một đề nghị đang chờ. */
export function ChangeDecision({ requestId, canDecide }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!canDecide) return <span className="muted">Chờ Admin duyệt</span>;

  async function decide(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vibang/change-requests/${requestId}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accept }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <button type="button" className="primary" disabled={busy} onClick={() => void decide(true)}>
        Duyệt
      </button>{' '}
      <button type="button" disabled={busy} onClick={() => void decide(false)}>
        Từ chối
      </button>
      <span role="alert" className="error" hidden={!error}>
        {error}
      </span>
    </span>
  );
}
