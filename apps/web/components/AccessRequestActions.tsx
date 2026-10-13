'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

/** Trưởng văn phòng duyệt hoặc từ chối (từ chối cần lý do); Admin rút đề xuất. Quyền thật do DB kiểm. */
export function AccessRequestActions({
  id,
  roles,
}: {
  readonly id: string;
  readonly roles: readonly string[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isHead = roles.includes('TRUONG_VP');
  const isAdmin = roles.includes('ADMIN');
  if (!isHead && !isAdmin) return null;

  async function send(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/access-requests/${id}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
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

  function decide(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const approve =
      ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'approve';
    const note = String(new FormData(e.currentTarget).get('note') ?? '').trim();
    if (!approve && !note) return setError(messageFor('REASON_REQUIRED'));
    void send('decision', { approve, ...(note ? { note } : {}) });
  }

  return (
    <div className="stack">
      {isHead ? (
        <form className="form" onSubmit={decide}>
          <label>
            Ghi chú (bắt buộc khi từ chối)
            <input name="note" maxLength={1000} />
          </label>
          <button type="submit" value="approve" className="primary" disabled={busy}>
            Duyệt
          </button>
          <button type="submit" value="reject" disabled={busy}>
            Từ chối
          </button>
        </form>
      ) : null}
      {isAdmin ? (
        <button type="button" disabled={busy} onClick={() => void send('withdrawal')}>
          Rút đề xuất
        </button>
      ) : null}
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </div>
  );
}
