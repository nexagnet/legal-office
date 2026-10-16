'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { NavItem } from '../app/nav';

interface Props {
  readonly items: readonly NavItem[];
  readonly tenantName: string | null;
  readonly signedIn?: boolean;
  /** Vai hiển thị ở thẻ người dùng cuối thanh bên (không phải nguồn quyền). */
  readonly roleLabel?: string | null;
  readonly children: ReactNode;
}

const initials = (label: string) =>
  label
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Trang con có đầu trang riêng trong Figma (3:54). */
const SUBPAGE_HEAD: Record<string, { title: string; sub: string }> = {
  '/quan-tri': { title: 'Nhân sự và phân quyền', sub: 'Vai trò, chi nhánh và quyền xử lý hồ sơ' },
  '/vi-bang/tao-moi': { title: 'Tạo hồ sơ Vi bằng', sub: 'Tiếp nhận yêu cầu lập Vi bằng' },
};

const CASE_PATH = /^\/vi-bang\/(?!tao-moi$)[^/]+$/;
const STAGE_HEAD: Record<string, { title: string; sub: string }> = {
  'duyet-sua': {
    title: 'Yêu cầu sửa hồ sơ sau 48 giờ',
    sub: 'Sửa dữ liệu nội bộ phải duyệt; không áp dụng cho Vi bằng đã phát hành.',
  },
  'phan-cong': {
    title: 'Admin phân công Thừa hành viên',
    sub: 'Chỉ Admin phân công, mỗi Vi bằng có một THV phụ trách.',
  },
  'cap-so': {
    title: 'Xác nhận MISA và cấp số',
    sub: 'Kiểm tra điều kiện cấp số và cấp số Vi bằng',
  },
  'ky-dong-dau': {
    title: 'Ký, đóng dấu và bản scan',
    sub: 'Hoàn tất Vi bằng trên bản giấy và lưu bản scan',
  },
  'thu-hoi-misa': {
    title: 'Thu hồi xác nhận thanh toán trên MISA',
    sub: 'Giữ nguyên số Vi bằng đã cấp; tạm chặn trả nếu xác nhận thanh toán bị thu hồi.',
  },
  'sua-loi-n11': {
    title: 'Sửa lỗi kỹ thuật Vi bằng · N-11',
    sub: 'Áp dụng quy trình pháp lý riêng; không dùng quyền sửa hồ sơ nội bộ 48 giờ.',
  },
  'tra-ket-qua': {
    title: 'Trả kết quả và liên hệ khách',
    sub: 'Ghi nhận liên hệ, bàn giao Vi bằng cho khách',
  },
};
const STAGE_PATH = /^\/vi-bang\/[^/]+\/([a-z0-9-]+)$/;
const CASE_HEAD = { title: 'Chi tiết và tiến độ Vi bằng', sub: 'Theo dõi tiến độ và xử lý hồ sơ' };

const hrefOf = (i: NavItem) => `/${i.slug}`;

/** Mục đang mở: khớp chính xác, hoặc trang con (`/vi-bang/123`) của một mục không phải Tổng quan. */
function currentItem(items: readonly NavItem[], pathname: string): NavItem | undefined {
  return items.find(
    (i) => pathname === hrefOf(i) || (i.slug !== '' && pathname.startsWith(`${hrefOf(i)}/`)),
  );
}

/**
 * Khung chung theo Figma "Full UX": thanh bên tối 248px (logo chờ, nhãn không gian làm việc, menu, thẻ người dùng)
 * và đầu trang trắng 92px (tên trang + mô tả). Dưới 900px thanh bên thu thành menu bật/tắt.
 */
export function AppShell({
  items,
  tenantName,
  signedIn = false,
  roleLabel = null,
  children,
}: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const current = currentItem(items, pathname);
  const head =
    SUBPAGE_HEAD[pathname] ??
    STAGE_HEAD[STAGE_PATH.exec(pathname)?.[1] ?? ''] ??
    (CASE_PATH.test(pathname) ? CASE_HEAD : undefined);
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Bỏ qua điều hướng
      </a>
      <aside className="side" data-open={open}>
        <div className="brand">
          <div
            data-testid="tenant-logo-slot"
            className="logo-slot"
            aria-label="Chỗ đặt logo văn phòng"
          >
            Vị trí logo của văn phòng
          </div>
          <span className="brand-name">{tenantName ?? 'Quản lý văn phòng'}</span>
        </div>
        <nav id="primary-nav" aria-label="Điều hướng chính" className="nav" data-open={open}>
          <h2 className="nav-title">Không gian làm việc</h2>
          <ul>
            {items.map((i) => (
              <li key={i.slug}>
                <Link
                  href={hrefOf(i)}
                  aria-current={current === i ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                >
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {signedIn ? (
          <div className="profile">
            <span className="avatar" aria-hidden="true">
              {initials(roleLabel ?? 'Nhân viên')}
            </span>
            <span className="profile-text">
              <strong>{roleLabel ?? 'Nhân viên văn phòng'}</strong>
              <small>Xem quyền theo tài khoản</small>
            </span>
            <button
              type="button"
              className="link-btn"
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
                router.push('/login');
                router.refresh();
              }}
            >
              Đăng xuất
            </button>
          </div>
        ) : null}
      </aside>
      <div className="content">
        <header className="topbar">
          <button
            type="button"
            className="menu-btn"
            aria-expanded={open}
            aria-controls="primary-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Đóng menu' : 'Menu'}
          </button>
          <div className="topbar-title">
            <p className="topbar-h">
              {head?.title ?? current?.label ?? tenantName ?? 'Quản lý văn phòng'}
            </p>
            {head || current ? <p className="topbar-sub">{head?.sub ?? current?.summary}</p> : null}
          </div>
        </header>
        <main id="main" className="main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
