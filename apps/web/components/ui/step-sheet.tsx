'use client';

import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

/** Thanh bước của drawer tạo mới (Figma N12 D7): số trong vòng tròn, bước đang mở xanh, bước xong có dấu tick. */
export function Stepper({
  steps,
  current,
}: {
  readonly steps: readonly string[];
  readonly current: number;
}) {
  return (
    <ol
      aria-label="Các bước"
      className="m-0 flex list-none items-center gap-3 border-b border-line px-7 py-4"
    >
      {steps.map((s, i) => {
        const done = i < current;
        const on = i === current;
        return (
          <li key={s} aria-current={on ? 'step' : undefined} className="flex items-center gap-3">
            {i > 0 ? <span aria-hidden="true" className="h-px w-8 bg-line-strong" /> : null}
            <span
              className={cn(
                'grid size-7 place-items-center rounded-full text-xs font-bold',
                on || done ? 'bg-accent text-white' : 'bg-line text-muted',
              )}
            >
              {done ? <Check size={14} aria-hidden="true" /> : i + 1}
            </span>
            <span className={cn('text-[13px] font-semibold', on ? 'text-ink' : 'text-muted')}>
              {s}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
