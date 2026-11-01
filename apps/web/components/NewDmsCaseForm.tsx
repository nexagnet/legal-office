'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

/** Tạo hồ sơ NHÁP (chưa ghi sổ). Quyền do máy chủ kiểm; lỗi hiển thị bằng tiếng Việt. */
export function NewDmsCaseForm({
  officeId,
  domainCode,
  redirectBase,
}: {
  readonly officeId: string;
  readonly domainCode: string;
  /** Có thì tạo xong chuyển thẳng tới trang chi tiết `${redirectBase}/<mã hồ sơ>` (Figma A1 → A2). */
  readonly redirectBase?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useState<readonly { id: string; name: string }[]>([]);

  // Chi nhánh người này được cấp. Một chi nhánh: máy chủ tự gắn. Nhiều chi nhánh: phải chọn. Lỗi tải: để máy chủ quyết định.
  useEffect(() => {
    let alive = true;
    fetch(`/api/dms/me/branches?officeId=${encodeURIComponent(officeId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ rows: { id: string; name: string }[] }>) : null))
      .then((b) => {
        if (alive && b) setBranches(b.rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [officeId]);

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
          ...(f.get('branch') ? { branchId: String(f.get('branch')) } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string; label?: string };
      if (!res.ok) return setError(messageFor(json.code));
      form.reset();
      if (redirectBase && json.label) router.push(`${redirectBase}/${json.label}`);
      else router.refresh();
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
        {domainCode.startsWith('vt') ? 'Tên loại và trích yếu nội dung' : 'Tên hồ sơ'}
        <input name="title" required maxLength={500} className="min-w-72" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Ghi chú
        <input name="note" maxLength={1000} className="min-w-72" />
      </label>
      {branches.length > 1 ? (
        <label className="flex flex-col gap-1 text-sm">
          Chi nhánh
          <select name="branch" required defaultValue="">
            <option value="" disabled>
              Chọn chi nhánh
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
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
