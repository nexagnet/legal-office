import Link from 'next/link';
import { cn } from '../../lib/cn';

export interface TabItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly count?: number;
}

/** Thanh tab theo URL (Figma N12 D6/D8): tab đang mở gạch chân đồng thau, số đếm dạng huy hiệu. Server component. */
export function TabNav({
  tabs,
  active,
  label,
}: {
  readonly tabs: readonly TabItem[];
  readonly active: string;
  readonly label: string;
}) {
  return (
    <nav aria-label={label} className="mb-5 flex gap-7 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex no-underline min-h-11 shrink-0 items-center gap-2 border-b-[3px] px-0.5 text-[15px] font-semibold whitespace-nowrap',
              on ? 'border-brass text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.count === undefined ? null : (
              <span
                className={cn(
                  'inline-grid min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold',
                  on ? 'bg-accent text-white' : 'bg-line text-muted',
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
}
