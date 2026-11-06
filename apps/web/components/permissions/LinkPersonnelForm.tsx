'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../../lib/messages';

/** Ghép hồ sơ lao động cũ (chưa gắn tài khoản) với tài khoản này, hoặc gỡ liên kết. Chỉ Admin và Trưởng văn phòng. */
export function LinkPersonnelForm({
  officeId,
  userId,
  linkedPersonId,
  options,
}: {
  readonly officeId: string;
  readonly userId: string;
  /** Hồ sơ đang gắn với tài khoản (nếu có). */
  readonly linkedPersonId: string | null;
  readonly options: readonly { readonly person_id: string; readonly full_name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(personId: string, target: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/office/personnel/${personId}/link`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ officeId, userId: target }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(body.code));
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const personId = String(new FormData(e.currentTarget).get('person') ?? '');
    if (personId) void send(personId, userId);
  }

  return (
    <div className="grid gap-2">
      {linkedPersonId ? (
        <button
          type="button"
          className="btn-link"
          disabled={busy}
          onClick={() => void send(linkedPersonId, null)}
        >
          Gỡ liên kết hồ sơ lao động
        </button>
      ) : options.length > 0 ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
          <label className="grid gap-1 text-sm font-semibold">
            Ghép với hồ sơ lao động có sẵn
            <select name="person" defaultValue="">
              <option value="" disabled>
                Chọn hồ sơ
              </option>
              {options.map((o) => (
                <option key={o.person_id} value={o.person_id}>
                  {o.full_name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy} aria-busy={busy}>
            Ghép
          </button>
        </form>
      ) : null}
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </div>
  );
}
