'use client';

import { Button } from './ui/button';

/** In trang hiện tại (sổ xem trước theo mẫu). Ẩn khi in nhờ lớp `print-hide` ở trang gọi. */
export function PrintButton({
  label = 'In sổ',
  primary = false,
}: {
  label?: string;
  primary?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={primary ? 'primary' : 'secondary'}
      onClick={() => window.print()}
    >
      {label}
    </Button>
  );
}
