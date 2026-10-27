'use client';

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

/** Hộp thoại giữa màn hình cho thao tác ngắn (Figma N12 D9). Radix lo focus trap, Esc và aria. */
export function Modal({ open, onOpenChange, title, description, children }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#122640]/50" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 grid max-h-[90vh] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-2xl bg-surface p-7 shadow-2xl focus:outline-none"
          aria-describedby={undefined}
        >
          <header className="flex items-start gap-3">
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
