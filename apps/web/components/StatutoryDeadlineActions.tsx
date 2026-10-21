'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

type Mode = 'closed' | 'done' | 'agree';

async function post(path: string, body: unknown) {
  const res = await fetch(`/api/office/deadlines/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: res.ok, code: json.code };
}

/**
 * Hạn pháp định: ghi đã làm xong (kèm ghi chú) hoặc ghi hạn thỏa thuận khác (kèm lý do).
 * Quyền do máy chủ kiểm; người không đủ quyền nhận thông báo lỗi tiếng Việt.
 */
export function StatutoryDeadlineActions({ id }: { readonly id: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('closed');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const r =
        mode === 'done'
          ? await post(`${id}/done`, { note: String(f.get('note') ?? '') })
          : await post(`${id}/agree`, {
              dueAt: `${String(f.get('due') ?? '')}T23:59:59+07:00`,
              reason: String(f.get('reason') ?? ''),
            });
      if (!r.ok) return setError(messageFor(r.code));
      setMode('closed');
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'closed') {
    return (
      <span className="deadline-actions">
        <button type="button" onClick={() => setMode('done')}>
          Đã làm xong
        </button>
        <button type="button" onClick={() => setMode('agree')}>
          Ghi hạn thỏa thuận
        </button>
      </span>
    );
  }
  return (
    <form className="form deadline-actions" onSubmit={submit}>
      {mode === 'done' ? (
        <label>
          Đã làm gì (ví dụ: gửi kết quả cho Tòa án ngày …)
          <input name="note" required maxLength={2000} />
        </label>
      ) : (
        <>
          <label>
            Hạn thỏa thuận mới
            <input name="due" type="date" required />
          </label>
          <label>
            Lý do (các bên thỏa thuận thế nào)
            <input name="reason" required maxLength={2000} />
          </label>
        </>
      )}
      <button type="submit" className="primary" disabled={busy}>
        Lưu
      </button>
      <button type="button" onClick={() => setMode('closed')}>
        Huỷ
      </button>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </form>
  );
}
