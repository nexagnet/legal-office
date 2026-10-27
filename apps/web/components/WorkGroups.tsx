import Link from 'next/link';
import type { ReactNode } from 'react';
import type { GroupTone, WorkGroup } from '../lib/overview';

const TONE: Record<GroupTone, string> = {
  danger: 'text-danger',
  warn: 'text-warn',
  info: 'text-muted',
};
const DOT: Record<GroupTone, string> = {
  danger: 'bg-danger',
  warn: 'bg-brass',
  info: 'bg-accent',
};

/** Danh sách việc gom theo độ gấp (Figma N12 D3/D4): mỗi dòng một việc, một nút hành động. */
export function WorkGroups({
  title,
  hint,
  groups,
  empty,
}: {
  readonly title: string;
  readonly hint: string;
  readonly groups: readonly WorkGroup[];
  readonly empty: ReactNode;
}) {
  return (
    <section className="panel" aria-labelledby="wg-t">
      <h2 id="wg-t">{title}</h2>
      <p className="muted">{hint}</p>
      {groups.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        groups.map((g) => (
          <div key={g.title} className="mt-4">
            <p className={`text-[11px] font-bold tracking-wide uppercase ${TONE[g.tone]}`}>
              {g.title}
            </p>
            <ul className="m-0 list-none p-0">
              {g.rows.map((r) => (
                <li
                  key={r.key}
                  className="flex items-center justify-between gap-4 border-b border-line py-3"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden="true"
                      className={`mt-2 size-2 shrink-0 rounded-full ${DOT[g.tone]}`}
                    />
                    <div className="grid min-w-0 gap-0.5">
                      <span className="truncate font-semibold text-ink">{r.title}</span>
                      <span className="text-[13px] text-muted">{r.meta}</span>
                    </div>
                  </div>
                  <Link
                    href={r.href}
                    className="inline-flex min-h-11 shrink-0 items-center rounded-[10px] border border-line-strong bg-surface px-5 text-sm font-semibold text-ink no-underline hover:bg-surface-2"
                  >
                    {r.action}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
