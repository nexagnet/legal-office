'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Đưa tiêu đề hồ sơ, trạng thái và nút "Thêm thao tác" lên banner của khung (Figma N13 E1–E5).
 * Banner nằm ngoài trang nên dùng portal vào `#case-banner`; trang vẫn giữ một h1 cho trình đọc màn hình.
 */
export function CaseBanner({
  title,
  meta,
  status,
  statusLabel,
  children,
}: {
  readonly title: string;
  readonly meta: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly children?: ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById('case-banner')), []);
  if (!slot) return null;
  return createPortal(
    <>
      <div className="grid gap-2">
        <p className="topbar-h case-banner-title">{title}</p>
        {meta ? <p className="topbar-sub">{meta}</p> : null}
        <p>
          <span className="badge" data-status={status}>
            {statusLabel}
          </span>
        </p>
      </div>
      {children}
    </>,
    slot,
  );
}
