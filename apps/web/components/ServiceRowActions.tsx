'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ATTEMPT_OUTCOME_LABEL, UNDELIVERABLE_LABEL, messageFor } from '../lib/messages';

interface Props {
  readonly documentId: string;
  readonly status: string;
}

async function post(path: string, body?: unknown) {
  const res = await fetch(`/api/service-of-documents/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: res.ok, code: json.code };
}

/**
 * Thao tác trên một văn bản: nhắc, ghi nhận lần chưa thành công, đánh dấu không tống đạt được.
 * "Đã tống đạt" cần tệp bằng chứng N-02 (PDF/JPEG/PNG): gửi chính tệp, máy chủ tự tính hash và khoá lưu.
 */
export function ServiceRowActions({ documentId, status }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (status === 'DELIVERED' || status === 'UNDELIVERABLE')
    return <span className="muted">Đã kết thúc</span>;

  async function run(action: () => Promise<{ ok: boolean; code?: string }>) {
    setBusy(true);
    setError(null);
    try {
      const r = await action();
      if (!r.ok) return setError(messageFor(r.code));
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  function attempt(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const outcome = String(new FormData(e.currentTarget).get('outcome'));
    void run(() => post(`documents/${documentId}/attempts`, { outcome }));
  }
  function served(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('evidence') as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file || file.size === 0) return setError(messageFor('INVALID_DOCUMENT'));
    void run(async () => {
      const res = await fetch(`/api/service-of-documents/documents/${documentId}/served`, {
        method: 'POST',
        headers: { 'content-type': file.type },
        body: file,
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      return { ok: res.ok, code: json.code };
    });
  }
  function undeliverable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get('reason'));
    void run(() => post(`documents/${documentId}/undeliverable`, { reason }));
  }

  return (
    <div className="stack">
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void run(() => post(`documents/${documentId}/reminders`))}
      >
        Nhắc người xử lý
      </button>
      <form className="form" onSubmit={attempt}>
        <label>
          Kết quả lần tống đạt
          <select name="outcome" defaultValue="ABSENT">
            {Object.entries(ATTEMPT_OUTCOME_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy} aria-busy={busy}>
          Ghi nhận lần tống đạt
        </button>
      </form>
      <form className="form" onSubmit={served}>
        <label>
          Bằng chứng đã tống đạt (PDF, JPEG, PNG; tối đa 25 MB)
          <input
            name="evidence"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            required
          />
        </label>
        <button type="submit" disabled={busy} aria-busy={busy}>
          Ghi nhận đã tống đạt
        </button>
      </form>
      <form className="form" onSubmit={undeliverable}>
        <label>
          Lý do không tống đạt được
          <select name="reason" defaultValue="NO_RECIPIENT">
            {Object.entries(UNDELIVERABLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy} aria-busy={busy}>
          Đánh dấu không tống đạt được
        </button>
      </form>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </div>
  );
}
