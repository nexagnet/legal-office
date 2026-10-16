'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

interface Props {
  readonly officeId: string;
  readonly legalName: string;
  readonly displayName: string;
  readonly numberRule: string;
  readonly branches: readonly { readonly id: string; readonly name: string }[];
  readonly canEdit: boolean;
}

/** Cấu hình văn phòng (Figma 3:392). Chỉ Admin sửa tên pháp lý và tên hiển thị; quy tắc số là quy tắc hệ thống. */
export function OfficeSettingsForm(p: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch('/api/office/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          officeId: p.officeId,
          legalName: String(f.get('legalName') ?? '').trim(),
          displayName: String(f.get('displayName') ?? '').trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      setDone(true);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="page-head">
        <h2>Thiết lập Văn phòng</h2>
        {p.canEdit ? (
          <button type="submit" className="primary" disabled={busy}>
            Lưu thay đổi
          </button>
        ) : null}
      </div>
      <div className="panels assign-grid">
        <section className="panel form">
          <h2>Thông tin pháp lý</h2>
          <label>
            Đơn vị pháp lý
            <input
              name="legalName"
              defaultValue={p.legalName}
              readOnly={!p.canEdit}
              maxLength={300}
            />
          </label>
          <label>
            Tên hiển thị trên văn bản
            <input
              name="displayName"
              defaultValue={p.displayName}
              readOnly={!p.canEdit}
              maxLength={300}
            />
          </label>
          <label>
            Quy tắc số Vi bằng
            <input value={p.numberRule} readOnly />
          </label>
          <p className="notice-amber">
            Cloud lưu bản scan quản lý; dữ liệu thật chỉ vận hành sau khi hoàn tất điều kiện pháp lý
            và được phê duyệt.
          </p>
          <p role="alert" className="error" hidden={!error}>
            {error}
          </p>
          <p role="status" className="success" hidden={!done}>
            Đã lưu thay đổi.
          </p>
        </section>
        <section className="panel">
          <h2>Địa điểm hoạt động</h2>
          <ul className="check-list">
            {p.branches.map((b) => (
              <li key={b.id}>
                <strong>{b.name}</strong> · Cùng một đơn vị pháp lý
              </li>
            ))}
          </ul>
          <p className="muted">Một dãy số Vi bằng chung toàn văn phòng</p>
        </section>
      </div>
    </form>
  );
}
