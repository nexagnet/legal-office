'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import type { Branch } from '../app/session';

/** Mở hồ sơ xác minh. Quyền do máy chủ kiểm. */
export function NewVerificationForm({ branches }: { readonly branches: readonly Branch[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const branch = branches.find((b) => b.id === f.get('branchId'));
    if (!branch) return setError('Chọn chi nhánh.');
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch('/api/verification/cases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          officeId: branch.officeId,
          branchId: branch.id,
          caseRef: String(f.get('caseRef') ?? ''),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      form.reset();
      setDone(true);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (branches.length === 0) return <p className="muted">Bạn chưa có chi nhánh nào để mở hồ sơ.</p>;
  return (
    <form className="card form" onSubmit={submit} aria-labelledby="new-vx-t">
      <h2 id="new-vx-t">Mở hồ sơ xác minh</h2>
      <label>
        Chi nhánh
        <select name="branchId" required defaultValue={branches[0]?.id}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Mã hồ sơ
        <input name="caseRef" required maxLength={200} />
      </label>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <p role="status" className="success" hidden={!done}>
        Đã mở hồ sơ xác minh.
      </p>
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Đang lưu…' : 'Mở hồ sơ'}
      </button>
    </form>
  );
}
