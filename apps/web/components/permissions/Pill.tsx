import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type PillTone = 'ok' | 'warn' | 'danger' | 'info' | 'mute' | 'brass';

const TONE: Record<PillTone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-accent-soft text-accent',
  mute: 'bg-line text-muted',
  brass: 'bg-brass-soft text-[#7a5a10]',
};

/** Nhãn trạng thái dạng viên thuốc nhỏ (Figma N11: Đang dùng, Chờ duyệt, Mẫu, Tùy chỉnh…). */
export function Pill({
  tone,
  children,
}: {
  readonly tone: PillTone;
  readonly children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs leading-none font-semibold whitespace-nowrap',
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

type NoteTone = 'info' | 'warn';

/** Khối ghi chú có vạch màu bên trái (Figma: "Cách đọc quyền hiệu lực", "Địa điểm không phải là quyền"). */
export function NoteBox({
  tone = 'info',
  title,
  children,
}: {
  readonly tone?: NoteTone;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <aside
      className={cn(
        'grid gap-1 rounded-[10px] border-l-4 px-5 py-4 text-sm leading-relaxed text-ink',
        tone === 'warn' ? 'border-warn bg-brass-soft/60' : 'border-accent bg-accent-soft',
      )}
    >
      <strong className={cn('text-[15px]', tone === 'warn' ? 'text-warn' : 'text-accent')}>
        {title}
      </strong>
      <span>{children}</span>
    </aside>
  );
}
