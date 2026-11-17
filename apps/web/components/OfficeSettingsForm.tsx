'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { messageFor } from '../lib/messages';
import { OfficeLogo } from './OfficeLogo';

interface Props {
  readonly officeId: string;
  readonly legalName: string;
  readonly displayName: string;
  /** Phiên bản logo hiện tại (mili giây); null = đang dùng logo mặc định. */
  readonly logoVersion: number | null;
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
    <form onSubmit={submit} className="settings">
      <div className="page-head">
        <h2>Thiết lập Văn phòng</h2>
        {p.canEdit ? (
          <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
            Lưu thay đổi
          </button>
        ) : null}
      </div>
      <div className="panels assign-grid settings-grid">
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
          <LogoField officeId={p.officeId} version={p.logoVersion} canEdit={p.canEdit} />
          <p role="alert" className="error" hidden={!error}>
            {error}
          </p>
          <p role="status" className="success" hidden={!done}>
            Đã lưu thay đổi.
          </p>
        </section>
        <section className="panel">
          <h2>Địa điểm hoạt động</h2>
          <ul className="branch-list">
            {p.branches.map((b) => (
              <li key={b.id}>
                <strong>{b.name}</strong>
              </li>
            ))}
          </ul>
          <p className="muted">Một dãy số Vi bằng chung toàn văn phòng</p>
        </section>
      </div>
    </form>
  );
}

/** Logo của văn phòng: Admin tải lên (JPG/PNG/WebP, tối đa 2 MB), đổi hoặc gỡ để quay về logo mặc định. */
function LogoField(p: {
  readonly officeId: string;
  readonly version: number | null;
  readonly canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/office/logo?officeId=${encodeURIComponent(p.officeId)}`;

  async function send(init: RequestInit, okText: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { code?: string };
        return setError(
          json.code === 'FILE_TOO_LARGE'
            ? 'Ảnh quá lớn (tối đa 2 MB).'
            : json.code === 'INVALID_DOCUMENT'
              ? 'Chỉ nhận ảnh JPG, PNG hoặc WebP.'
              : messageFor(json.code),
        );
      }
      toast.success(okText);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type))
      return setError('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    if (file.size > 2 * 1024 * 1024) return setError('Ảnh quá lớn (tối đa 2 MB).');
    await send(
      { method: 'PUT', headers: { 'content-type': file.type }, body: file },
      'Đã cập nhật logo',
    );
  }

  return (
    <div className="logo-field">
      <span>Logo văn phòng</span>
      <div className="flex items-center gap-3">
        <span className="logo-slot" aria-hidden="true">
          <OfficeLogo officeId={p.officeId} version={p.version} />
        </span>
        {p.canEdit ? (
          <>
            <label className="button">
              {p.version ? 'Đổi logo' : 'Tải logo lên'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={busy}
                aria-label="Chọn ảnh logo"
                onChange={(e) => {
                  void pick(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {p.version ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void send({ method: 'DELETE' }, 'Đã gỡ logo')}
              >
                Gỡ logo
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <p className="muted">Logo hiện ở thanh bên và làm biểu tượng tab trình duyệt.</p>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </div>
  );
}
