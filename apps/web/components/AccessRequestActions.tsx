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
  const [rejecting, setRejecting] = useState(false);
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

  function approve() {
    void send('decision', { approve: true });
  }

  function reject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const note = String(new FormData(e.currentTarget).get('note') ?? '').trim();
    if (!note) return setError(messageFor('REASON_REQUIRED'));
    void send('decision', { approve: false, note });
  }

  return (
    <div className="req-actions">
      <div className="req-buttons">
        {isAdmin ? (
          <button type="button" disabled={busy} onClick={() => void send('withdrawal')}>
            Rút đề xuất
          </button>
        ) : null}
        {isHead ? (
          <>
            <button
              type="button"
              className="danger-outline"
              disabled={busy}
              onClick={() => setRejecting(true)}
            >
              Từ chối
            </button>
            <button type="button" className="primary" disabled={busy} onClick={approve}>
              Duyệt
            </button>
          </>
        ) : null}
      </div>
      {isHead && rejecting ? (
        <form className="reject-panel" onSubmit={reject}>
          <label>
            Lý do từ chối (bắt buộc)
            <input name="note" maxLength={1000} autoFocus />
          </label>
          <div className="req-buttons">
            <button type="button" onClick={() => setRejecting(false)}>
              Hủy
            </button>
            <button type="submit" className="danger-outline" disabled={busy}>
              Xác nhận từ chối
            </button>
          </div>
        </form>
      ) : null}
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </div>
  );
}
