'use client';

import { useState } from 'react';

// Không nhập từ lib/dms-legacy: module đó kéo theo mã chỉ chạy ở máy chủ (next/headers), không dùng được trong thành phần client.
const legacyDownloadHref = (id: string): string => `/api/dms/legacy/files/${id}/download`;

/**
 * Mở một tệp tài liệu cũ trong tab mới. Kho R2 trả liên kết ngắn hạn (JSON `{url}`), kho đĩa trả thẳng nội dung.
 * Máy chủ kiểm quyền và ghi nhật ký mỗi lần mở.
 */
export function LegacyOpenButton({ id, name }: { readonly id: string; readonly name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(legacyDownloadHref(id), { credentials: 'same-origin' });
      if (!res.ok) {
        setError(res.status === 404 ? 'Không tìm thấy tệp.' : 'Không mở được tệp. Thử lại sau.');
        return;
      }
      if ((res.headers.get('content-type') ?? '').includes('application/json')) {
        const body = (await res.json()) as { url?: string };
        if (!body.url) {
          setError('Không mở được tệp. Thử lại sau.');
          return;
        }
        window.open(body.url, '_blank', 'noopener,noreferrer');
      } else {
        const url = URL.createObjectURL(await res.blob());
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch {
      setError('Không mở được tệp. Kiểm tra kết nối và thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-link"
        onClick={open}
        disabled={busy}
        aria-label={`Mở ${name}`}
      >
        {busy ? 'Đang mở…' : 'Mở'}
      </button>
      {error ? (
        <small className="dms-sub" role="alert">
          {' '}
          {error}
        </small>
      ) : null}
    </>
  );
}
