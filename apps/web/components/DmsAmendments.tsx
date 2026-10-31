'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { DmsBookColumn } from '../lib/dms';
import { messageFor } from '../lib/messages';

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return { router, error, setError, busy, setBusy, done, setDone };
}

const DONE: Record<string, string> = {
  AMENDMENT_APPLIED: 'Đã áp dụng ngay.',
  AMENDMENT_PENDING: 'Đã gửi, chờ Admin duyệt.',
};

/**
 * Gửi yêu cầu sửa đổi hồ sơ ĐÃ lưu chính thức. Bắt buộc lý do và bản scan văn bản sửa đổi; hồ sơ gốc không bị ghi đè.
 * `columns` là các cột sổ của miền (bỏ STT/tiêu đề); chỉ ô nào khác giá trị hiện tại mới được gửi.
 */
export function DmsAmendmentForm({
  caseId,
  documentId,
  columns,
  current,
  currentTitle,
  allowN11,
}: {
  readonly caseId: string;
  readonly documentId?: string;
  readonly columns: readonly DmsBookColumn[];
  readonly current: Record<string, unknown>;
  readonly currentTitle?: string;
  readonly allowN11: boolean;
}) {
  const { router, error, setError, busy, setBusy, done, setDone } = useAction();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const file = f.get('evidence');
    if (!(file instanceof File) || file.size === 0)
      return setError('Hãy đính kèm bản scan văn bản sửa đổi (PDF, JPEG hoặc PNG).');
    const reason = String(f.get('reason') ?? '').trim();
    if (!reason) return setError(messageFor('REASON_REQUIRED'));
    const attributes: Record<string, string> = {};
    for (const c of columns) {
      const v = String(f.get(c.key) ?? '').trim();
      if (v !== String(current[c.key] ?? '')) attributes[c.key] = v;
    }
    const title = String(f.get('title') ?? '').trim();
    const changes: { title?: string; attributes?: Record<string, string> } = {};
    if (title && title !== currentTitle) changes.title = title;
    if (Object.keys(attributes).length > 0) changes.attributes = attributes;
    if (Object.keys(changes).length === 0) return setError(messageFor('NOTHING_TO_CHANGE'));
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const q = new URLSearchParams({
        reason,
        changes: JSON.stringify(changes),
        n11: f.get('n11') === 'on' ? 'true' : 'false',
      });
      if (documentId) q.set('documentId', documentId);
      const res = await fetch(`/api/dms/cases/${caseId}/amendments?${q}`, {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      setDone(DONE[json.code ?? ''] ?? 'Đã gửi.');
      form.reset();
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Yêu cầu sửa đổi" className="mb-4">
      <fieldset className="grid gap-2">
        <legend>Yêu cầu sửa đổi{documentId ? ' tài liệu' : ' hồ sơ'}</legend>
        {!documentId && currentTitle !== undefined ? (
          <label className="flex flex-col gap-1 text-sm">
            <span>Tiêu đề / trích yếu</span>
            <input name="title" defaultValue={currentTitle} maxLength={500} />
          </label>
        ) : null}
        {columns.map((c) => (
          <label key={c.key} className="flex flex-col gap-1 text-sm">
            <span>
              Cột {c.no}: {c.group ? `${c.group} · ` : ''}
              {c.heading}
            </span>
            <input name={c.key} defaultValue={String(current[c.key] ?? '')} maxLength={2000} />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-sm">
          <span>Lý do sửa đổi (bắt buộc)</span>
          <textarea name="reason" required maxLength={2000} rows={2} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Bản scan văn bản sửa đổi (bắt buộc)</span>
          <input
            type="file"
            name="evidence"
            accept="application/pdf,image/jpeg,image/png"
            required
          />
        </label>
        {allowN11 ? (
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="n11" /> Sửa lỗi kỹ thuật (mẫu N-11, Điều 31 NĐ 151)
          </label>
        ) : null}
      </fieldset>
      <button type="submit" disabled={busy}>
        Gửi yêu cầu sửa đổi
      </button>
      {done ? <span role="status"> {done}</span> : null}
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}

/** Admin duyệt hoặc từ chối một yêu cầu đang chờ. Từ chối cần lý do. */
export function DmsAmendmentReview({ requestId }: { readonly requestId: string }) {
  const { router, error, setError, busy, setBusy } = useAction();
  async function review(approve: boolean) {
    const note = approve ? '' : (window.prompt('Lý do từ chối (bắt buộc):') ?? '').trim();
    if (!approve && !note) return setError(messageFor('REASON_REQUIRED'));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dms/amendments/${requestId}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approve, ...(note ? { note } : {}) }),
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
      <button type="button" disabled={busy} onClick={() => void review(true)}>
        Duyệt
      </button>{' '}
      <button type="button" disabled={busy} onClick={() => void review(false)}>
        Từ chối
      </button>
      {error ? <span role="alert"> {error}</span> : null}
    </span>
  );
}

/** Admin đổi cửa sổ tự duyệt (giờ sau khi ghi sổ); 0 = tắt. */
export function DmsAmendmentWindowForm({
  officeId,
  hours,
}: {
  readonly officeId: string;
  readonly hours: number;
}) {
  const { router, error, setError, busy, setBusy, done, setDone } = useAction();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = Number(new FormData(e.currentTarget).get('hours'));
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch('/api/dms/amendment-window', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ officeId, hours: value }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      setDone('Đã lưu.');
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      aria-label="Cửa sổ tự duyệt"
      className="mb-4 flex flex-wrap items-end gap-2 text-sm"
    >
      <label className="flex flex-col gap-1">
        Tự duyệt trong (giờ) sau khi ghi sổ, 0 = tắt
        <input type="number" name="hours" min={0} max={720} defaultValue={hours} required />
      </label>
      <button type="submit" disabled={busy}>
        Lưu
      </button>
      {done ? <span role="status">{done}</span> : null}
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
