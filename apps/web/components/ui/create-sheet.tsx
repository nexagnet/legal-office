'use client';

import { useState, type ReactNode } from 'react';
import { Button } from './button';
import { Sheet, SheetBody } from './sheet';

/** Nút "+ Tạo" mở ngăn kéo chứa form (Figma N12 D11); form vẫn là form cũ, quyền do máy chủ kiểm. */
export function CreateSheet({
  label,
  title,
  children,
}: {
  readonly label: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      <Sheet open={open} onOpenChange={setOpen} title={title}>
        <SheetBody>{children}</SheetBody>
      </Sheet>
    </>
  );
}
