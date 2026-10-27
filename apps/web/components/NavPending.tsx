'use client';

import { useLinkStatus } from 'next/link';

/** Vòng quay nhỏ trong `<Link>`: báo ngay "đã nhận lệnh" khi trang đích còn đang nạp. */
export function NavPending() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span className="nav-pending" role="status" aria-label="Đang chuyển trang" />
  ) : null;
}
