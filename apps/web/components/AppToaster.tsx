'use client';

import { Toaster } from 'sonner';

/** Nơi hiện toast (Figma N14 khung C mục 3): góc dưới phải, thành công tự tắt, lỗi giữ lại cho tới khi đóng. */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      closeButton
      duration={3000}
      toastOptions={{
        style: {
          fontFamily: 'var(--font-sans, inherit)',
          borderRadius: 12,
          border: '1px solid var(--line)',
          color: 'var(--ink)',
        },
      }}
    />
  );
}
