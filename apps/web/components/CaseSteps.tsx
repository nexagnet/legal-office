'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

export interface Progress {
  readonly misaStatus: string;
  readonly misaRevokeStatus: string;
  readonly numberLabel: string | null;
  readonly signedAt: string | null;
  readonly stampedAt: string | null;
  readonly hasFinalScan: boolean;
}
interface Props {
  readonly caseId: string;
  readonly status: string;
  readonly progress: Progress;
  /** Vai của người dùng, chỉ để ẩn nút không liên quan; quyền thật do DB quyết định. */
  readonly roles: readonly string[];
}

const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

/** Các bước pháp lý theo thứ tự: MISA → cấp số → ký → đóng dấu → bản scan → trả khách. MISA là sổ duy nhất về tiền. */
export function CaseSteps({ caseId, status, progress, roles }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const has = (...r: string[]) => r.some((x) => roles.includes(x));
  const misaOk = progress.misaStatus === 'CONFIRMED_FULL';

  async function call(method: string, path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vibang/cases/${caseId}/${path}`, {
        method,
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

  function recordMisa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reference = String(new FormData(e.currentTarget).get('reference') ?? '').trim();
    void call('PUT', 'misa', { status: 'CONFIRMED_FULL', reference });
  }

  async function uploadScan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('scan') as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file || file.size === 0) return setError(messageFor('INVALID_DOCUMENT'));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vibang/cases/${caseId}/final-scan`, {
        method: 'POST',
        headers: { 'content-type': 'application/pdf' },
        body: file,
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

  const finished = status === 'RETURNED' || status === 'CANCELLED';
  const steps: { label: string; done: boolean; detail?: string }[] = [
    { label: 'Kế toán xác nhận MISA', done: misaOk },
    {
      label: 'Cấp số Vi bằng',
      done: !!progress.numberLabel,
      detail: progress.numberLabel ?? undefined,
    },
    {
      label: 'THV xác nhận đã ký',
      done: !!progress.signedAt,
      detail: progress.signedAt ? fmt.format(new Date(progress.signedAt)) : undefined,
    },
    {
      label: 'Xác nhận đã đóng dấu',
      done: !!progress.stampedAt,
      detail: progress.stampedAt ? fmt.format(new Date(progress.stampedAt)) : undefined,
    },
    { label: 'Bản scan cuối', done: progress.hasFinalScan },
    { label: 'Trả khách', done: status === 'RETURNED' },
  ];

  return (
    <section className="card" aria-labelledby="steps-t">
      <h2 id="steps-t">Tiến trình</h2>
      <ol className="steps">
        {steps.map((s) => (
          <li key={s.label} data-done={s.done}>
            <span aria-hidden="true">{s.done ? '✓' : '○'}</span> {s.label}
            {s.detail ? <span className="muted"> · {s.detail}</span> : null}
            <span className="sr-only">{s.done ? ' (đã xong)' : ' (chưa xong)'}</span>
          </li>
        ))}
      </ol>
      {progress.misaRevokeStatus !== 'NONE' ? (
        <p className="muted">Có đề nghị thu hồi xác nhận MISA đang xử lý.</p>
      ) : null}
      {!progress.hasFinalScan && !finished && progress.stampedAt && has('VAN_THU', 'THV') ? (
        <form className="form" onSubmit={uploadScan}>
          <label>
            Bản scan cuối (PDF, tối đa 25 MB)
            <input name="scan" type="file" accept="application/pdf" required />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            Tải bản scan cuối
          </button>
        </form>
      ) : null}
      {!progress.hasFinalScan && !finished && !progress.stampedAt ? (
        <p className="muted">Bản scan cuối tải lên được sau khi xác nhận đã đóng dấu.</p>
      ) : null}
      {finished ? null : (
        <div className="stack">
          {!misaOk && has('KE_TOAN', 'ADMIN') ? (
            <form className="form" onSubmit={recordMisa}>
              <label>
                Mã tham chiếu MISA
                <input name="reference" required maxLength={200} />
              </label>
              <button type="submit" className="primary" disabled={busy}>
                Xác nhận đã thu đủ trên MISA
              </button>
            </form>
          ) : null}
          {misaOk && !progress.numberLabel && has('VAN_THU', 'THU_KY', 'ADMIN', 'TRUONG_VP') ? (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void call('POST', 'number')}
            >
              Cấp số
            </button>
          ) : null}
          {progress.numberLabel && !progress.signedAt && has('THV') ? (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void call('POST', 'signature-confirmations')}
            >
              Xác nhận đã ký
            </button>
          ) : null}
          {progress.signedAt &&
          !progress.stampedAt &&
          has('VAN_THU', 'THU_KY', 'ADMIN', 'TRUONG_VP') ? (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void call('POST', 'stamp-confirmations')}
            >
              Xác nhận đã đóng dấu
            </button>
          ) : null}
          {progress.stampedAt ? (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void call('POST', 'return')}
            >
              Trả khách
            </button>
          ) : null}
        </div>
      )}
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </section>
  );
}
