'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

export interface ThvCard {
  readonly userId: string;
  readonly fullName: string;
  readonly cardNo: string;
}

export interface ThvPerson {
  readonly userId: string;
  readonly label: string;
}

function ThvCardRow({
  officeId,
  person,
  card,
  canEdit,
}: {
  readonly officeId: string;
  readonly person: ThvPerson;
  readonly card: ThvCard | undefined;
  readonly canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/office/thv-cards', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          officeId,
          userId: person.userId,
          fullName: String(f.get('fullName') ?? '').trim(),
          cardNo: String(f.get('cardNo') ?? '').trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      setNotice('Đã lưu.');
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <th scope="row">{person.label}</th>
      {canEdit ? (
        <td colSpan={2}>
          <form className="thv-card-form" onSubmit={submit}>
            <input
              name="fullName"
              aria-label={`Họ tên ${person.label}`}
              defaultValue={card?.fullName ?? ''}
              maxLength={120}
            />
            <input
              name="cardNo"
              aria-label={`Số Thẻ ${person.label}`}
              defaultValue={card?.cardNo ?? ''}
              maxLength={40}
            />
            <button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? 'Đang lưu…' : 'Lưu'}
            </button>
            {error ? <span role="alert">{error}</span> : null}
            {notice ? <span role="status">{notice}</span> : null}
          </form>
        </td>
      ) : (
        <>
          <td>{card?.fullName ?? <span className="muted">Chưa nhập</span>}</td>
          <td>{card?.cardNo ?? <span className="muted">Chưa nhập</span>}</td>
        </>
      )}
    </tr>
  );
}

/** Họ tên và số Thẻ Thừa hành viên, in trên các sổ. Chỉ Admin sửa; để trống cả hai ô là xoá. */
export function ThvCardsForm({
  officeId,
  people,
  cards,
  canEdit,
}: {
  readonly officeId: string;
  readonly people: readonly ThvPerson[];
  readonly cards: readonly ThvCard[];
  readonly canEdit: boolean;
}) {
  const byUser = new Map(cards.map((c) => [c.userId, c]));
  return (
    <section className="thv-cards" aria-labelledby="thv-t">
      <h2 id="thv-t">Thẻ Thừa hành viên</h2>
      <p className="muted">
        Họ tên và số Thẻ được in ở cột &quot;Thừa hành viên&quot; trên các sổ. Cần điền cả hai ô; để
        trống cả hai là xoá.
      </p>
      {people.length === 0 ? (
        <p className="muted">Văn phòng chưa có thành viên vai Thừa hành viên.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Thẻ Thừa hành viên</caption>
            <thead>
              <tr>
                <th scope="col">Tài khoản</th>
                <th scope="col">Họ tên</th>
                <th scope="col">Số Thẻ</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <ThvCardRow
                  key={p.userId}
                  officeId={officeId}
                  person={p}
                  card={byUser.get(p.userId)}
                  canEdit={canEdit}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
