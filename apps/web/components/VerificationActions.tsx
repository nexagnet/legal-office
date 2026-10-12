'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

interface Props {
  readonly caseId: string;
  readonly status: string;
}

async function post(path: string, body: unknown) {
  const res = await fetch(`/api/verification/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: res.ok, code: json.code };
}

/**
 * Thao tác trên một hồ sơ xác minh: bắt đầu vòng, đề xuất kết luận (THV), quyết định kết luận (Admin/Trưởng VP có quyền ký,
 * khác người đề xuất). Hoàn thành vòng cần nguồn kèm tệp bằng chứng nên chưa có trên giao diện (chờ kho tệp).
 */
export function VerificationActions({ caseId, status }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (status === 'CONCLUDED') return <span className="muted">Đã kết luận</span>;

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
  const value = (e: FormEvent<HTMLFormElement>, name: string) => {
    e.preventDefault();
    return String(new FormData(e.currentTarget).get(name) ?? '');
  };

  return (
    <div className="stack">
      {status === 'OPEN' ? (
        <>
          <form
            className="form"
            onSubmit={(e) => {
              const partyName = value(e, 'partyName');
              void run(() => post(`cases/${caseId}/rounds`, { partyName }));
            }}
          >
            <label>
              Bên liên quan
              <input name="partyName" required maxLength={300} />
            </label>
            <button type="submit" disabled={busy}>
              Bắt đầu vòng xác minh
            </button>
          </form>
          <form
            className="form"
            onSubmit={(e) => {
              const text = value(e, 'text');
              void run(() => post(`cases/${caseId}/conclusion-proposal`, { text }));
            }}
          >
            <label>
              Đề xuất kết luận
              <textarea name="text" required rows={2} maxLength={8000} />
            </label>
            <button type="submit" disabled={busy}>
              Gửi đề xuất kết luận
            </button>
          </form>
        </>
      ) : (
        <div>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(() => post(`cases/${caseId}/conclusion-decision`, { approve: true }))
            }
          >
            Chấp nhận kết luận
          </button>{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(() => post(`cases/${caseId}/conclusion-decision`, { approve: false }))
            }
          >
            Trả về để xác minh tiếp
          </button>
        </div>
      )}
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </div>
  );
}
