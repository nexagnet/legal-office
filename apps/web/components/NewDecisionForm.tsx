'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import { pickedFile, postFile } from '../lib/upload';
import type { Branch } from '../app/session';

interface Signer {
  readonly userId: string;
  readonly label: string;
}

/** Vào sổ một quyết định kèm bản đã ký (PDF/JPEG/PNG, tối đa 25 MB). Quyền do máy chủ kiểm. */
export function NewDecisionForm({
  branches,
  signers,
}: {
  readonly branches: readonly Branch[];
  readonly signers: readonly Signer[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const branch = branches.find((b) => b.id === f.get('branchId'));
    const signerUserId = String(f.get('signerUserId') ?? '');
    const file = pickedFile(form, 'file');
    if (!branch) return setError('Chọn chi nhánh.');
    if (!signerUserId) return setError('Chọn người ký.');
    if (!file) return setError(messageFor('INVALID_DOCUMENT'));
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const r = await postFile('office/decision-files', file, {
        officeId: branch.officeId,
        branchId: branch.id,
        decisionNo: String(f.get('decisionNo') ?? '').trim(),
        docType: String(f.get('docType') ?? '').trim(),
        title: String(f.get('title') ?? '').trim(),
        signerUserId,
        signedOn: String(f.get('signedOn') ?? ''),
      });
      if (!r.ok) return setError(messageFor(r.code));
      form.reset();
      setDone(true);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (branches.length === 0) return <p className="muted">Bạn chưa có chi nhánh nào để vào sổ.</p>;
  if (signers.length === 0)
    return <p className="muted">Chưa có người được cấp quyền ký pháp lý để vào sổ quyết định.</p>;
  return (
    <form className="card form" onSubmit={submit} aria-labelledby="new-dec-t">
      <h2 id="new-dec-t">Vào sổ quyết định</h2>
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
        Số quyết định
        <input name="decisionNo" required maxLength={200} />
      </label>
      <label>
        Loại văn bản
        <input name="docType" required maxLength={200} />
      </label>
      <label>
        Trích yếu
        <input name="title" required maxLength={1000} />
      </label>
      <label>
        Người ký
        <select name="signerUserId" required defaultValue="">
          <option value="" disabled>
            Chọn người ký
          </option>
          {signers.map((s) => (
            <option key={s.userId} value={s.userId}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Ngày ký
        <input name="signedOn" type="date" required />
      </label>
      <label>
        Bản đã ký (PDF, JPEG hoặc PNG, tối đa 25 MB)
        <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required />
      </label>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <p role="status" className="success" hidden={!done}>
        Đã vào sổ.
      </p>
      <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
        {busy ? 'Đang lưu…' : 'Vào sổ'}
      </button>
    </form>
  );
}
