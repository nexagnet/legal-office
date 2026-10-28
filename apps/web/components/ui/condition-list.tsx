import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface Condition {
  readonly key: string;
  readonly title: string;
  readonly hint?: ReactNode;
  /** true: đạt (dấu tick xanh); false: chưa đạt (dấu ! đỏ). */
  readonly met: boolean;
}

/** Danh sách điều kiện của một thao tác (Figma V2, V3): mỗi dòng nói rõ đạt hay chưa bằng chữ lẫn biểu tượng. */
export function ConditionList({
  conditions,
  label,
}: {
  readonly conditions: readonly Condition[];
  readonly label: string;
}) {
  return (
    <ul aria-label={label} className="m-0 grid list-none gap-3 p-0">
      {conditions.map((c) => (
        <li key={c.key} className="flex items-start gap-3">
          <span
            aria-hidden
            className={cn(
              'mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-white',
              c.met ? 'bg-ok' : 'bg-danger',
            )}
          >
            {c.met ? <Check className="size-3.5" /> : <X className="size-3.5" />}
          </span>
          <span className="grid gap-0.5">
            <span className={cn('text-[15px] font-semibold', c.met ? 'text-ink' : 'text-danger')}>
              {c.title}
              <span className="sr-only">{c.met ? ' (đạt)' : ' (chưa đạt)'}</span>
            </span>
            {c.hint ? <span className="text-[13px] text-muted">{c.hint}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
