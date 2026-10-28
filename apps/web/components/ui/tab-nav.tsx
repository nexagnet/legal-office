import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface TabItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly count?: number;
}

/** Bộ lọc theo URL dạng viên thuốc (Figma N0, N15): mục đang chọn nền xanh, số đếm dạng huy hiệu. Server component. */
export function TabNav({
  tabs,
  active,
  label,
  action,
}: {
  readonly tabs: readonly TabItem[];
  readonly active: string;
  readonly label: string;
  /** Nút chính của danh sách (vd. "+ Tạo ..."), nằm cùng hàng với bộ lọc ở bên phải. */
  readonly action?: ReactNode;
}) {
  const nav = (
    <nav aria-label={label} className="flex flex-wrap gap-2.5">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold whitespace-nowrap no-underline',
              on
                ? 'border-accent bg-accent text-white'
                : 'border-transparent bg-head text-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.count === undefined ? null : (
              <span
                className={cn(
                  'inline-grid min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold',
                  on ? 'bg-white/25 text-white' : 'bg-line text-muted',
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      {nav}
      {action}
    </div>
  );
}
