'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

/** Ngày ký hợp đồng dịch vụ xác minh: từ đó tính hạn 3 ngày làm việc ra quyết định xác minh (Điều 35.1). */
export function ContractDateForm({ caseId }: { readonly caseId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/verification/cases/${caseId}/contract-date`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signedOn: String(f.get('signedOn') ?? '') }),
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
        Ngày ký hợp đồng dịch vụ xác minh
        <input name="signedOn" type="date" required />
      </label>
      <button type="submit" disabled={busy} aria-busy={busy}>
        Ghi ngày ký (tính hạn ra quyết định)
      </button>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </form>
  );
}
