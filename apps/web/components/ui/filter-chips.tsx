import Link from 'next/link';
import { cn } from '../../lib/cn';

export interface Chip {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly count?: number;
}

/** Chip lọc nhanh theo URL (Figma N12 D6): chip đang chọn nền xanh đậm. Server component. */
export function FilterChips({
  chips,
  active,
  label,
}: {
  readonly chips: readonly Chip[];
  readonly active: string;
  readonly label: string;
}) {
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-wrap gap-2.5 p-0">
      {chips.map((c) => {
        const on = c.key === active;
        return (
          <li key={c.key}>
            <Link
              href={c.href}
              aria-current={on ? 'true' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center rounded-full border px-4 no-underline text-sm font-semibold',
                on
                  ? 'border-[#12263f] bg-[#12263f] text-white'
                  : 'border-line-strong bg-surface text-ink hover:bg-surface-2',
              )}
            >
              {c.label}
              {c.count === undefined ? null : <span className="ml-1.5">{c.count}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
