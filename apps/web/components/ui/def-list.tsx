import { Fragment, type ReactNode } from 'react';

export type DefRow = readonly [label: string, value: ReactNode];

/** Danh sách nhãn-giá trị chỉ để đọc (Figma N13 E2, E4): mỗi dòng một vạch ngăn, thay cho ô nhập giả. */
export function DefList({ rows }: { readonly rows: readonly DefRow[] }) {
  return (
    <dl className="m-0 grid grid-cols-[minmax(120px,216px)_1fr] text-sm max-sm:grid-cols-1">
      {rows.map(([label, value], i) => (
        <Fragment key={label}>
          <dt
            className={`py-3 text-[13px] text-muted max-sm:pb-0 ${i > 0 ? 'border-t border-line' : ''}`}
          >
            {label}
          </dt>
          <dd
            className={`m-0 py-3 font-semibold text-ink max-sm:pt-1 ${i > 0 ? 'border-t border-line max-sm:border-t-0' : ''}`}
          >
            {value}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}
