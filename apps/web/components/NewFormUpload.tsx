'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import { pickedFile, postFile } from '../lib/upload';

export const TT06_CODES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'] as const;

/** Đăng ký bản mới của một phụ lục TT06 kèm tệp (PDF/JPEG/PNG, tối đa 25 MB). Chỉ Admin/Trưởng VP; máy chủ kiểm. */
export function NewFormUpload({ officeId }: { readonly officeId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const file = pickedFile(form, 'file');
    if (!file) return setError(messageFor('INVALID_DOCUMENT'));
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const r = await postFile('office/tt06-form-files', file, {
        officeId,
        code: String(f.get('code')),
        title: String(f.get('title') ?? '').trim(),
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

  return (
    <form className="card form" onSubmit={submit} aria-labelledby="new-form-t">
      <h2 id="new-form-t">Tải lên bản mới</h2>
      <label>
        Phụ lục
        <select name="code" required defaultValue="I">
          {TT06_CODES.map((c) => (
            <option key={c} value={c}>
              Phụ lục {c}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tiêu đề
        <input name="title" required maxLength={500} />
      </label>
      <label>
        Tệp biểu mẫu (PDF, JPEG hoặc PNG, tối đa 25 MB)
        <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required />
      </label>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <p role="status" className="success" hidden={!done}>
        Đã đăng ký bản mới.
      </p>
      <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
        {busy ? 'Đang tải…' : 'Đăng ký'}
      </button>
    </form>
  );
}
