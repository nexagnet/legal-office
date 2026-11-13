'use client';

import { useEffect } from 'react';

/** Các ngăn lọc là <details> (không cần JavaScript để mở); mặc định trình duyệt không tự đóng chúng. */
const SELECTOR = 'details.dms-pop[open], details.dms-adv[open]';

/**
 * Đóng ngăn lọc đang mở khi bấm ra ngoài hoặc nhấn Esc (Esc trả tiêu điểm về nút mở). Gắn một lần cho cả trang,
 * không vẽ gì. Ngăn "Thời gian" lồng bên trong "Bộ lọc khác" không bị đụng tới.
 */
export function DmsPopoverDismiss() {
  useEffect(() => {
    const onDown = (e: Event) => {
      const target = e.target as Node | null;
      for (const d of document.querySelectorAll<HTMLDetailsElement>(SELECTOR)) {
        if (!target || !d.contains(target)) d.open = false;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      for (const d of document.querySelectorAll<HTMLDetailsElement>(SELECTOR)) {
        const hadFocus = d.contains(document.activeElement);
        d.open = false;
        if (hadFocus) d.querySelector<HTMLElement>(':scope > summary')?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  return null;
}
