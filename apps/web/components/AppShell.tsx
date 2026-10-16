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
  '/vi-bang/tao-moi': { title: 'Tạo hồ sơ Vi bằng', sub: 'Tiếp nhận yêu cầu lập Vi bằng' },
};

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
  const head = SUBPAGE_HEAD[pathname];
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
