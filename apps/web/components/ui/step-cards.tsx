import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type StepState = 'done' | 'current' | 'todo';

export interface StepCard {
  readonly key: string;
  /** Ai làm bước này (vd. "Văn thư"); hiện nhỏ phía trên tên bước. */
  readonly role?: string;
  readonly title: string;
  readonly state: StepState;
  /** Bước đã xong nhưng kết quả xấu (vd. không tống đạt được): hiện dấu ✕ đỏ thay vì tick. */
  readonly failed?: boolean;
  readonly description?: ReactNode;
  /** Nút hoặc biểu mẫu của bước; chỉ nên có ở bước hiện tại (một nút chính). */
  readonly action?: ReactNode;
}

const CHIP: Record<StepState, string> = {
  done: 'Đã xong',
  current: 'Đang ở bước này',
  todo: 'Chưa đến',
};

/**
 * Stepper dạng thẻ dùng chung (Figma N15 P1): mỗi bước một thẻ có viền, số bước, vai thực hiện,
 * nhãn trạng thái bằng chữ; bước hiện tại nổi bật và là nơi duy nhất có nút chính. Server component.
 * `row`: từ màn lớn xếp ba thẻ ngang hàng thay vì dọc.
 */
export function StepCards({
  steps,
  label,
  row = false,
}: {
  readonly steps: readonly StepCard[];
  readonly label: string;
  readonly row?: boolean;
}) {
  return (
    <ol
      aria-label={label}
      className={cn('m-0 grid list-none gap-0 p-0', row && 'lg:grid-cols-3 lg:gap-4')}
    >
      {steps.map((s, i) => {
        const ok = s.state === 'done' && !s.failed;
        const bad = s.state === 'done' && s.failed;
        return (
          <li
            key={s.key}
            data-state={s.state}
            aria-current={s.state === 'current' ? 'step' : undefined}
            className="grid"
          >
            <div
              className={cn(
                'grid content-start gap-2.5 rounded-2xl border p-4',
                s.state === 'current' &&
                  'border-2 border-accent bg-surface shadow-[0_4px_14px_rgba(37,99,235,0.14)]',
                ok && 'border-ok/40 bg-surface',
                bad && 'border-danger/40 bg-surface',
                s.state === 'todo' && 'border-line bg-surface-2',
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-[34px] shrink-0 place-items-center rounded-full border-2 text-[15px] font-bold',
                    s.state === 'current' && 'border-accent bg-accent text-white',
                    ok && 'border-ok bg-ok text-white',
                    bad && 'border-danger bg-danger text-white',
                    s.state === 'todo' && 'border-line-strong bg-surface text-faint',
                  )}
                >
                  {ok ? <Check size={18} /> : bad ? <X size={18} /> : i + 1}
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  {s.role ? (
                    <span className="text-[10px] font-semibold tracking-wide text-faint uppercase">
                      {s.role}
                    </span>
                  ) : null}
                  <h3
                    className={cn(
                      'm-0 text-base leading-snug font-bold',
                      s.state === 'todo' ? 'text-faint' : 'text-ink',
                    )}
                  >
                    {s.title}
                  </h3>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    s.state === 'current' && 'bg-accent-soft text-accent',
                    ok && 'bg-ok-soft text-ok',
                    bad && 'bg-danger-soft text-danger',
                    s.state === 'todo' && 'bg-line text-muted',
                  )}
                >
                  {bad ? 'Kết thúc' : CHIP[s.state]}
                </span>
              </div>
              {s.description ? (
                <div
                  className={cn(
                    'text-[13px] leading-5',
                    s.state === 'todo' ? 'text-faint' : 'text-muted',
                  )}
                >
                  {s.description}
                </div>
              ) : null}
              {s.action}
            </div>
            {i < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn('ml-[33px] h-3.5 w-0.5 bg-line-strong', row && 'lg:hidden')}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
