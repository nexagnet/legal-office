import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Dải thông báo dưới tiêu đề (Figma A2: nền vàng nhạt + liên kết hành động bên phải). */
export function NoticeBar({
  children,
  action,
  tone = 'warn',
  lock = false,
}: {
  readonly children: ReactNode;
  readonly action?: ReactNode;
  readonly tone?: 'warn' | 'info';
  /** Biểu tượng khóa đầu dòng (Figma T2: thông báo quyền của hồ sơ đã ghi sổ). */
  readonly lock?: boolean;
}) {
  return (
    <div
      role="note"
      className={cn(
        'mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-[13px]',
        tone === 'warn' ? 'bg-[#fdf0d5] text-[#5a3d00]' : 'bg-accent-soft text-accent',
      )}
    >
      {lock ? <Lock size={16} aria-hidden="true" className="shrink-0" /> : null}
      <p className="m-0 min-w-0 flex-1">{children}</p>
      {action ? <div className="shrink-0 font-semibold">{action}</div> : null}
    </div>
  );
}

/** Thẻ trắng bo góc chứa một khối thông tin (Figma A2: "Thông tin chung", "Thông tin hệ thống"). */
export function InfoCard({
  title,
  children,
  id,
}: {
  readonly title?: string;
  readonly children: ReactNode;
  readonly id?: string;
}) {
  return (
    <section
      aria-labelledby={title ? id : undefined}
      className="mb-4 rounded-2xl bg-surface p-5 shadow-sm"
    >
      {title ? (
        <h2 id={id} className="mb-3 font-serif text-lg font-bold">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

export type InfoItem = readonly [label: string, value: ReactNode];

/** Lưới nhãn / giá trị 2–3 cột trong thẻ; giá trị rỗng hiện "—". */
export function InfoGrid({ items }: { readonly items: readonly InfoItem[] }) {
  return (
    <dl className="m-0 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-normal text-muted">{label}</dt>
          <dd className="m-0 mt-0.5 font-semibold break-words text-ink">
            {value === '' || value === null || value === undefined ? '—' : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Thẻ nhóm tệp của một tài liệu: tiêu đề nhóm rồi từng dòng tệp (Figma A2 tab Tài liệu). */
export function FileGroupCard({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <article aria-label={title} className="mb-4 rounded-2xl bg-surface p-4 shadow-sm">
      <h3 className="m-0 mb-2 text-[13px] font-semibold text-muted">
        {title}
        {hint ? <span className="ml-1 font-normal">{hint}</span> : null}
      </h3>
      {children}
    </article>
  );
}

/** Một dòng tệp: tên + chi tiết nhỏ, chip loại, và các nút (Xem, Tải, Xóa scan). */
export function FileRow({
  name,
  meta,
  chip,
  chipTone = 'plain',
  actions,
  current,
  extra,
}: {
  readonly name: string;
  readonly meta: string;
  /** Dòng phụ dưới chi tiết (vd. tiến độ OCR). */
  readonly extra?: ReactNode;
  readonly chip: string;
  readonly chipTone?: 'main' | 'plain';
  readonly actions: ReactNode;
  /** Tệp đang được xem ở khung bên phải. */
  readonly current?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 border-t border-line py-2.5 first-of-type:border-t-0',
        current && 'rounded-lg bg-accent-soft/50 px-2',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-semibold text-ink">{name}</p>
        <p className="m-0 text-xs text-muted">{meta}</p>
        {extra ? <div className="mt-0.5">{extra}</div> : null}
      </div>
      <span
        className={cn(
          'rounded-full px-2.5 py-0.5 text-xs font-semibold',
          chipTone === 'main' ? 'bg-accent-soft text-accent' : 'bg-head text-muted',
        )}
      >
        {chip}
      </span>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  );
}

/** Khung xem trước tệp nền sáng, bo góc; nút thao tác nằm dưới (Figma A2: Tải bản scan chính, In, Tải thêm scan). */
export function PdfPane({
  src,
  title,
  caption,
  actions,
  note,
}: {
  readonly src: string;
  readonly title: string;
  readonly caption: string;
  readonly actions: ReactNode;
  readonly note?: string;
}) {
  return (
    <div>
      <iframe
        title={title}
        src={src}
        className="h-[520px] w-full rounded-2xl border border-line bg-surface-2"
      />
      <p className="mt-2 mb-0 text-xs text-muted">{caption}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>
      {note ? <p className="mt-2 mb-0 text-xs text-muted">{note}</p> : null}
    </div>
  );
}
