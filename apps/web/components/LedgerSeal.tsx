'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '../lib/messages';
import { postJson } from '../lib/post-json';
import { Button } from './ui/button';

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
  const [error, setError] = useState<string | null>(null);

  async function seal() {
    if (
      !window.confirm(
        `Đóng quyển tháng ${ym.slice(5)}/${ym.slice(0, 4)}? Đã đóng thì không mở lại.`,
      )
    )
      return;
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
    }
  }

  return (
    <>
      <Button variant="secondary" loading={busy} onClick={() => void seal()}>
        Đóng quyển
      </Button>
      {error ? (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}
    </>
  );
}
