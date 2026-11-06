import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}

/** Ngăn kéo bên phải (khung drawer trong Figma). Radix lo focus trap, Esc và aria. */
export function Sheet({ open, onOpenChange, title, description, children }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#122640]/50" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col bg-surface shadow-2xl focus:outline-none"
          aria-describedby={undefined}
        >
          <header className="flex items-start gap-3 border-b border-line px-7 py-5">
            <div className="grid flex-1 gap-1">
              <Dialog.Title className="font-serif text-[22px] leading-7 font-bold text-[#12263f]">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="text-[13px] text-muted">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              className="grid size-11 place-items-center rounded-[10px] text-muted hover:bg-surface-2"
              aria-label="Đóng"
            >
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SheetBody({ children }: { readonly children: ReactNode }) {
  return (
    <div className="grid flex-1 content-start gap-4 overflow-y-auto px-7 py-6">{children}</div>
  );
}

export function SheetFooter({ children }: { readonly children: ReactNode }) {
  return (
    <footer className="flex justify-end gap-3 border-t border-line bg-surface-2 px-7 py-4">
      {children}
    </footer>
  );
}

/** Khối lưu ý trong form: `tone` quyết định màu (cảnh báo, nguy hiểm, thông tin). */
export function Notice({
  tone,
  title,
  children,
}: {
  readonly tone: 'warn' | 'danger' | 'info';
  readonly title: string;
  readonly children: ReactNode;
}) {
  const style = {
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-accent-soft text-accent',
  }[tone];
  return (
    <div className={`grid gap-1 rounded-xl p-3.5 ${style}`}>
      <p className="text-[13px] font-semibold">{title}</p>
      <p className="text-[13px] leading-5 text-ink">{children}</p>
    </div>
  );
}
