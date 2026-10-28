'use client';

import type { FormEvent } from 'react';
import { useCasePost } from './CasePost';
import { PartyName } from './ui/avatar';

interface Props {
  readonly caseId: string;
  readonly recipient: string | null;
  readonly handedOverOn: string | null;
  readonly canRecord: boolean;
}

/** Ghi người nhận và ngày bàn giao Vi bằng (một lần). Quyền và trạng thái hồ sơ do máy chủ quyết định. */
export function HandoverForm({ caseId, recipient, handedOverOn, canRecord }: Props) {
  const { post, error, busy } = useCasePost();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void post(`cases/${caseId}/handover`, {
      recipientName: String(f.get('recipientName') ?? '').trim(),
      handedOverOn: String(f.get('handedOverOn') ?? ''),
    });
  }

  if (recipient) {
    return (
      <p>
        Người nhận kết quả:{' '}
        <strong>
          <PartyName name={recipient} />
        </strong>
        {handedOverOn ? <span className="muted"> · ngày bàn giao {handedOverOn}</span> : null}
      </p>
    );
  }
  if (!canRecord) return <p className="muted">Chưa ghi nhận người nhận kết quả.</p>;
  return (
    <form onSubmit={submit}>
      <label>
        Người nhận kết quả
        <input name="recipientName" type="text" maxLength={200} required />
      </label>
      <label>
        Ngày bàn giao
        <input name="handedOverOn" type="date" required />
      </label>
      <button type="submit" disabled={busy} aria-busy={busy}>
        Lưu người nhận
      </button>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </form>
  );
}
