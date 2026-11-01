'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '../lib/messages';
import { postJson } from '../lib/post-json';
import { Button } from './ui/button';
import { ConfirmModal } from './ui/confirm-modal';

/** Đóng quyển một tháng của sổ. Đóng rồi không mở lại; quyền (Admin, Trưởng VP) và tháng đã qua do DB kiểm. */
export function LedgerSeal({
  officeId,
  code,
  ym,
}: {
  readonly officeId: string;
  readonly code: string;
  readonly ym: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function seal() {
    setBusy(true);
    setError(null);
    try {
      const r = await postJson(`/office/ledgers/${code}/periods/${ym}/seal`, { officeId });
      if (!r.ok) return setError(messageFor(r.code));
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <Button variant="secondary" loading={busy} onClick={() => setConfirming(true)}>
        Đóng quyển
      </Button>
      <ConfirmModal
        open={confirming}
        onOpenChange={setConfirming}
        title={`Đóng quyển tháng ${ym.slice(5)}/${ym.slice(0, 4)}`}
        description="Đã đóng thì không mở lại."
        confirmLabel="Đóng quyển"
        danger
        busy={busy}
        onConfirm={() => void seal()}
      />
      {error ? (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}
    </>
  );
}
