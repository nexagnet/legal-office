'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useReportListBusy } from './DmsListBusy';

/** Không có phản hồi sau chừng này thì thôi báo "đang lọc" (tránh treo mờ mãi nếu mạng lỗi). */
const GIVE_UP_MS = 20_000;
/** Hiện tối thiểu chừng này để người dùng kịp thấy, kể cả khi máy chủ trả rất nhanh. */
const MIN_SHOW_MS = 450;

/**
 * Báo "đang lọc" khi người dùng đổi tab, chip, bộ lọc hoặc bấm Áp dụng trong danh sách hồ sơ.
 * Thanh lọc là liên kết và biểu mẫu GET (máy chủ vẽ lại trang), nên không có trạng thái tải sẵn: ở đây bắt cú bấm liên kết
 * cùng trang (khác chuỗi tìm) và cú gửi biểu mẫu, bật cờ chung cho bảng (mờ + vòng quay) và đặt `data-busy` lên khung danh sách
 * (thanh tiến trình mảnh, nút Áp dụng hiện vòng quay). Cờ tự tắt khi chuỗi địa chỉ đổi, tức máy chủ đã trả danh sách mới.
 */
export function DmsFilterNavBusy() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pending, setPending] = useState(false);
  useReportListBusy(pending);

  const startedAt = useRef(0);

  // Địa chỉ đã đổi: danh sách mới đã về. Giữ hiệu ứng đủ MIN_SHOW_MS rồi mới tắt.
  useEffect(() => {
    const wait = Math.max(0, startedAt.current + MIN_SHOW_MS - Date.now());
    const t = window.setTimeout(() => setPending(false), wait);
    return () => window.clearTimeout(t);
  }, [pathname, search]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.dms-list');
    if (!root) return;
    if (pending) root.setAttribute('data-busy', 'true');
    else root.removeAttribute('data-busy');
    if (!pending) return;
    const t = window.setTimeout(() => setPending(false), GIVE_UP_MS);
    return () => {
      window.clearTimeout(t);
      root.removeAttribute('data-busy');
    };
  }, [pending]);

  useEffect(() => {
    const inList = (el: Element | null) => !!el?.closest('.dms-list');
    const onClick = (e: MouseEvent) => {
      // Không xét defaultPrevented: <Link> của Next tự chặn mặc định rồi mới điều hướng bằng JavaScript.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest('a');
      if (!a || !inList(a) || a.target || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname)
        return;
      if (url.search === window.location.search) return;
      startedAt.current = Date.now();
      setPending(true);
    };
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement | null;
      if (e.defaultPrevented || !f || !inList(f)) return;
      if ((f.method || 'get').toLowerCase() !== 'get') return;
      startedAt.current = Date.now();
      setPending(true);
    };
    const onShow = () => setPending(false);
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit);
    window.addEventListener('pageshow', onShow);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit);
      window.removeEventListener('pageshow', onShow);
    };
  }, []);
  return null;
}
