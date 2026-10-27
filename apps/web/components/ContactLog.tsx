'use client';

import { startTransition, useOptimistic, type FormEvent } from 'react';
import { CONTACT_KIND_LABEL, CONTACT_OUTCOME_LABEL, type ContactEntry } from '../lib/contacts';
import { useCasePost } from './CasePost';

interface Props {
  readonly caseId: string;
  readonly contacts: readonly ContactEntry[];
  readonly canLog: boolean;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

/** Lịch sử liên hệ khách và ghi nhận lần liên hệ mới (Figma 3:676). Thời điểm do máy chủ ghi. */
export function ContactLog({ caseId, contacts, canLog }: Props) {
  const { post, error, busy } = useCasePost();
  /** Lần liên hệ mới hiện ngay, trước khi máy chủ xác nhận; lỗi thì tự biến mất (React hoàn về `contacts`). */
  const [shown, addPending] = useOptimistic(contacts, (cur, next: ContactEntry) => [next, ...cur]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const kind = String(f.get('kind'));
    const outcome = String(f.get('outcome'));
    startTransition(async () => {
      addPending({
        id: `pending-${Date.now()}`,
        kind,
        outcome,
        actorUserId: '',
        at: new Date().toISOString(),
      });
      await post(`cases/${caseId}/contacts`, { kind, outcome });
    });
  }

  return (
    <section className="panel form" aria-labelledby="contact-t">
      <h2 id="contact-t">Lịch sử liên hệ khách hàng</h2>
      {canLog ? (
        <form onSubmit={submit}>
          <label>
            Loại liên hệ
            <select name="kind" defaultValue="REMINDER">
              {Object.entries(CONTACT_KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kết quả liên hệ
            <select name="outcome" defaultValue="REACHED">
              {Object.entries(CONTACT_OUTCOME_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary wide" disabled={busy} aria-busy={busy}>
            Lưu kết quả liên hệ
          </button>
          <p role="alert" className="error" hidden={!error}>
            {error}
          </p>
        </form>
      ) : null}
      {shown.length === 0 ? (
        <p className="muted">Chưa ghi nhận lần liên hệ nào.</p>
      ) : (
        <ul className="rows contact-rows">
          {shown.map((c) => (
            <li key={c.id}>
              <span>
                {CONTACT_KIND_LABEL[c.kind] ?? c.kind}
                <small className="muted"> · {CONTACT_OUTCOME_LABEL[c.outcome] ?? c.outcome}</small>
              </span>
              <time dateTime={c.at}>{fmt(c.at)}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
