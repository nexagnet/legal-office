'use client';

import { useState } from 'react';
import { Button } from './ui/button';

/**
 * "Xuất PDF để in": tải PDF dựng sẵn từ máy chủ rồi mở thẳng hộp thoại in của trình duyệt
 * (iframe ẩn cùng nguồn). Nếu trình duyệt không cho in từ iframe thì mở PDF ở tab mới để người dùng in/tải.
 */
export function PrintPdfButton({ href, label }: { readonly href: string; readonly label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(href, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(
        new Blob([await res.arrayBuffer()], { type: 'application/pdf' }),
      );
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      const cleanup = () => {
        frame.remove();
        URL.revokeObjectURL(url);
      };
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          setTimeout(cleanup, 120_000);
        } catch {
          window.open(url, '_blank');
        }
      };
      frame.src = url;
      document.body.appendChild(frame);
    } catch {
      setError('Không tạo được bản PDF để in. Thử lại hoặc dùng Xuất Excel.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="primary" onClick={run} loading={busy}>
        {label}
      </Button>
      {error ? (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      ) : null}
    </>
  );
}
