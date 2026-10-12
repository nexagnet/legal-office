'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { NavItem } from '../app/nav';

interface Props {
  readonly items: readonly NavItem[];
  readonly tenantName: string | null;
  readonly children: ReactNode;
}

const GROUPS: Record<NavItem['group'], string> = {
  domain: 'Nghiệp vụ',
  office: 'Văn phòng',
  admin: 'Quản trị',
};

export function AppShell({ items, tenantName, children }: Props) {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Bỏ qua điều hướng
      </a>
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
        <div className="brand">
          <div
            data-testid="tenant-logo-slot"
            className="logo-slot"
            aria-label="Chỗ đặt logo văn phòng"
          />
          <span>{tenantName ?? 'Quản lý văn phòng'}</span>
        </div>
      </header>
      <nav id="primary-nav" aria-label="Điều hướng chính" className="nav" data-open={open}>
        {(Object.keys(GROUPS) as NavItem['group'][]).map((g) => {
          const list = items.filter((i) => i.group === g);
          if (list.length === 0) return null;
          return (
            <section key={g} aria-label={GROUPS[g]}>
              <h2 className="nav-title">{GROUPS[g]}</h2>
              <ul>
                {list.map((i) => (
                  <li key={i.slug}>
                    <Link
                      href={`/${i.slug}`}
                      aria-current={pathname === `/${i.slug}` ? 'page' : undefined}
                      onClick={() => setOpen(false)}
                    >
                      {i.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </nav>
      <main id="main" className="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
