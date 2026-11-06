import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'info' | 'danger';

/**
 * Thẻ trạng thái toàn trang (Figma S1, N19 A1): vòng tròn dấu hiệu, tiêu đề serif, mô tả, một nút chính.
 * Dùng cho 404, 403, lỗi bất ngờ, phiên hết hạn và danh sách trống. `role="alert"` chỉ cho lỗi.
 */
export function StateCard({
  mark,
  title,
  description,
  tone = 'info',
  alert = false,
  children,
}: {
  /** Chữ hoặc số trong vòng tròn, ví dụ "404", "403", "!". */
  readonly mark: string;
  readonly title: string;
  readonly description: string;
  readonly tone?: Tone;
  readonly alert?: boolean;
  /** Nút hoặc liên kết hành động. */
  readonly children?: ReactNode;
}) {
  return (
    <section
      role={alert ? 'alert' : 'status'}
      className="mx-auto my-10 grid max-w-[440px] justify-items-center gap-3 rounded-2xl border border-line bg-surface px-8 py-10 text-center shadow-sm"
    >
      <span
        aria-hidden
        className={cn(
          'flex size-[100px] items-center justify-center rounded-full font-serif text-[32px] font-bold',
          tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent',
        )}
      >
        {mark}
      </span>
      <h1 className="m-0 font-serif text-[22px] leading-8 font-bold text-[#12263f]">{title}</h1>
      <p className="m-0 max-w-[360px] text-[14px] leading-6 text-muted">{description}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
