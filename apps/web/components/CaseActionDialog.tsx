'use client';

import { useState, type ReactNode } from 'react';
import { CloseContext } from './StageDialog';
import { Modal } from './ui/dialog';

/** Nút mở hộp thoại cho biểu mẫu ngắn của hồ sơ (Figma N13 E4, E5). */
export function CaseActionDialog({
  label,
  title,
  description,
  primary = false,
  className,
  children,
}: {
  readonly label: string;
  readonly title: string;
  readonly description?: string;
  readonly primary?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className ?? (primary ? 'primary' : undefined)}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <Modal open={open} onOpenChange={setOpen} title={title} description={description}>
        <CloseContext.Provider value={() => setOpen(false)}>{children}</CloseContext.Provider>
      </Modal>
    </>
  );
}
