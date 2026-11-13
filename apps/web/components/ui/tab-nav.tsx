import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface TabItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly count?: number;
  /** Sắc thái của chip kiểu "soft" (Figma danh sách): `warn` = nền vàng nhạt (Nháp, Đã hủy). */
  readonly tone?: 'warn';
}

/** Bộ lọc theo URL dạng viên thuốc (Figma N0, N15): mục đang chọn nền xanh, số đếm dạng huy hiệu. Server component. */
export function TabNav({
  tabs,
  active,
  label,
  action,
  compact = false,
  soft = false,
  underline = false,
}: {
  readonly tabs: readonly TabItem[];
  readonly active: string;
  readonly label: string;
  /** Nút chính của danh sách (vd. "+ Tạo ..."), nằm cùng hàng với bộ lọc ở bên phải. */
  readonly action?: ReactNode;
  /** Chip nhỏ gọn để chip lọc và nút hành động nằm cùng một hàng (Figma danh sách). */
  readonly compact?: boolean;
  /** Chip mềm của Figma danh sách hồ sơ DMS: mục đang chọn chữ xanh trên nền xanh nhạt, mục khác nền xám. */
  readonly soft?: boolean;
  /** Tab chữ gạch chân của Figma chi tiết hồ sơ (T1): mục đang chọn chữ xanh, gạch xanh dưới chân. */
  readonly underline?: boolean;
}) {
  if (underline) {
    return (
      <nav
        aria-label={label}
        className="mb-4 flex min-w-0 flex-nowrap gap-7 overflow-x-auto border-b border-line [scrollbar-width:thin]"
      >
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={cn(
                '-mb-px shrink-0 border-b-2 px-0.5 pt-1 pb-3 text-[15px] font-semibold whitespace-nowrap no-underline',
                on ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {t.label}
              {t.count === undefined ? null : ` (${t.count})`}
            </Link>
          );
        })}
      </nav>
    );
  }
  if (soft) {
    return (
      <div className="tabs-soft-row">
        <nav aria-label={label} className="tabs-soft">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={t.key === active ? 'page' : undefined}
              data-tone={t.tone}
            >
              {t.label}
              {t.count === undefined ? null : ` (${t.count})`}
            </Link>
          ))}
        </nav>
        {action}
      </div>
    );
  }
  const nav = (
    <nav
      aria-label={label}
      className={cn(
        'flex min-w-0 max-w-full flex-nowrap overflow-x-auto pb-0.5 [scrollbar-width:thin]',
        compact ? 'gap-1.5' : 'gap-2.5',
      )}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-full border text-sm font-semibold whitespace-nowrap no-underline',
              compact ? 'min-h-10 px-3' : 'min-h-11 px-4',
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
