'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

interface Props {
  readonly kind: 'TRANSFER' | 'DELEGATION';
  readonly subjectId: string;
  readonly state: string;
  /** Vai của người dùng, chỉ để ẩn nút không liên quan; quyền thật do DB quyết định. */
  readonly roles: readonly string[];
}

/** Từ chối, trả lại hoặc nộp lại một đề xuất; bắt buộc có lý do. */
export function ApprovalActions({ kind, subjectId, state, roles }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const decider = roles.some((r) => r === 'ADMIN' || r === 'TRUONG_VP');
  const canResubmit = state === 'RETURNED';
  const canDecide = decider && state === 'OPEN';
  if (!canDecide && !canResubmit) return null;
  const path = kind === 'TRANSFER' ? 'transfers' : 'delegations';

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const decision = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim();
    if (!decision) return;
    if (!reason) return setError(messageFor('REASON_REQUIRED'));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/approvals/${path}/${subjectId}/decisions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, reason }),
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
    <form className="form" onSubmit={submit}>
      <label>
        Lý do
        <input name="reason" required maxLength={2000} />
      </label>
      {canDecide ? (
        <>
          <button type="submit" value="RETURN" disabled={busy}>
            Trả lại bổ sung
          </button>
          <button type="submit" value="REJECT" disabled={busy}>
            Từ chối
          </button>
        </>
      ) : null}
      {canResubmit ? (
        <button type="submit" value="RESUBMIT" className="primary" disabled={busy}>
          Nộp lại
        </button>
      ) : null}
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </form>
  );
}
