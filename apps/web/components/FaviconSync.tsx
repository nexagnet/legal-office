'use client';

import { useEffect, useRef } from 'react';

/** Favicon mặc định (khớp `generateMetadata` ở layout). */
const DEFAULT_ICONS: readonly { rel: string; href: string; type?: string; sizes?: string }[] = [
  { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
  { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
  { rel: 'icon', href: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
  { rel: 'icon', href: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
];

/**
 * Đồng bộ biểu tượng tab ngay khi Admin đổi hoặc gỡ logo mà không cần tải lại trang. Trình duyệt giữ favicon theo địa chỉ
 * trang và không tự bỏ icon cũ khi chỉ đổi thẻ link; nên khi phiên bản logo đổi, thay hẳn các thẻ icon bằng thẻ mới:
 * logo mới có `?v=<phiên bản>`, còn gỡ logo thì favicon mặc định kèm `?r=<thời điểm>` để bỏ qua icon đã nhớ.
 */
export function FaviconSync({
  officeId,
  version,
}: {
  readonly officeId: string | null;
  readonly version: number | null;
}) {
  const previous = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const before = previous.current;
    previous.current = version;
    // Lần hiển thị đầu: HTML từ máy chủ đã đúng, không cần thay.
    if (before === undefined || before === version) return;
    const head = document.head;
    head
      .querySelectorAll(
        'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
      )
      .forEach((el) => el.remove());
    const stamp = Date.now();
    const icons =
      version && officeId
        ? (['icon', 'shortcut icon', 'apple-touch-icon'] as const).map((rel) => ({
            rel: rel as string,
            href: `/api/office/logo?officeId=${encodeURIComponent(officeId)}&v=${version}`,
            type: undefined as string | undefined,
            sizes: undefined as string | undefined,
          }))
        : DEFAULT_ICONS.map((i) => ({ ...i, href: `${i.href}?r=${stamp}` }));
    for (const i of icons) {
      const link = document.createElement('link');
      link.rel = i.rel;
      link.href = i.href;
      if (i.type) link.type = i.type;
      if (i.sizes) link.setAttribute('sizes', i.sizes);
      head.appendChild(link);
    }
  }, [officeId, version]);
  return null;
}
