'use client';

import { useRouter } from 'next/navigation';
import { Button } from './ui/button';

/** Trạng thái lỗi tải dữ liệu dùng chung (Figma S1): chữ đỏ và nút "Thử lại" tải lại trang. */
export function ErrorRetry({
  title = 'Lỗi tải dữ liệu',
  message = 'Không tải được danh sách. Kiểm tra kết nối và thử lại.',
}: {
  readonly title?: string;
  readonly message?: string;
}) {
  const router = useRouter();
  return (
    <div className="state" role="alert">
      <h2>{title}</h2>
      <p className="font-medium text-danger">{message}</p>
      <Button variant="secondary" onClick={() => router.refresh()}>
        Thử lại
      </Button>
    </div>
  );
}
