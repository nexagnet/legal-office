'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Modal } from './ui/dialog';
import { Sheet, SheetBody } from './ui/sheet';

const CloseContext = createContext<(() => void) | null>(null);

/** Hàm đóng hộp thoại thao tác (chỉ có khi thao tác một lần, tự đóng sau khi thành công). */
export const useDialogClose = () => useContext(CloseContext);

/**
 * Thao tác của hồ sơ mở đè lên khung hồ sơ (Figma N13 E7, E8): hộp thoại cho thao tác hiếm,
 * ngăn kéo cho thao tác theo giai đoạn. Đóng thì quay lại trang trước (`router.back()`).
 */
export function StageDialog({
  title,
  variant,
  children,
}: {
  readonly title: string;
  readonly variant: 'modal' | 'sheet';
  readonly children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const close = () => {
    setOpen(false);
    router.back();
  };
  const onOpenChange = (next: boolean) => {
    if (!next) close();
  };
  if (variant === 'sheet') {
    return (
      <Sheet open={open} onOpenChange={onOpenChange} title={title}>
        <SheetBody>{children}</SheetBody>
      </Sheet>
    );
  }
  return (
    <CloseContext.Provider value={close}>
      <Modal open={open} onOpenChange={onOpenChange} title={title}>
        {children}
      </Modal>
    </CloseContext.Provider>
  );
}
