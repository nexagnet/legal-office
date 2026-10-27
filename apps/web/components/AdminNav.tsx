'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface AdminSection {
  readonly href: string;
  readonly label: string;
  readonly badge?: number;
}

/** Điều hướng các mục Quản trị: mỗi mục một trang, mỗi lần chỉ hiện một việc. */
export function AdminNav({ sections }: { readonly sections: readonly AdminSection[] }) {
  const pathname = usePathname() ?? '';
  return (
    <nav className="admin-rail" aria-label="Các mục Quản trị">
      <h2 className="admin-rail-title">Quản trị</h2>
      <ul>
        {sections.map((s) => {
          const on = pathname === s.href || pathname.startsWith(`${s.href}/`);
          return (
            <li key={s.href}>
              <Link href={s.href} aria-current={on ? 'page' : undefined}>
                <span>{s.label}</span>
                {s.badge ? (
                  <span className="nav-badge">
                    <span className="sr-only">Đang chờ: </span>
                    {s.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
