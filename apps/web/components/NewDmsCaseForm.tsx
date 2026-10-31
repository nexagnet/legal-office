'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

/** Tạo hồ sơ NHÁP (chưa ghi sổ). Quyền do máy chủ kiểm; lỗi hiển thị bằng tiếng Việt. */
export function NewDmsCaseForm({
  officeId,
  domainCode,
}: {
  readonly officeId: string;
  readonly domainCode: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/dms/cases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          officeId,
          domain: domainCode,
          title: String(f.get('title') ?? '').trim(),
          attributes: { note: String(f.get('note') ?? '').trim() },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      form.reset();
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
      className="mb-4 flex flex-wrap items-end gap-3"
      aria-label="Tạo nháp hồ sơ"
    >
      <label className="flex flex-col gap-1 text-sm">
        Tên hồ sơ
        <input name="title" required maxLength={500} className="min-w-72" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Ghi chú
        <input name="note" maxLength={1000} className="min-w-72" />
      </label>
      <button type="submit" disabled={busy}>
        + Tạo nháp
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm">
          {error}
        </p>
      ) : null}
    </form>
  );
}
