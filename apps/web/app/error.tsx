'use client';

import { Button } from '../components/ui/button';
import { StateCard } from '../components/ui/state-card';

/** Lỗi không lường trước của một trang: nói rõ, cho thử lại, không lộ chi tiết kỹ thuật. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <StateCard
      mark="!"
      tone="danger"
      alert
      title="Đã xảy ra lỗi"
      description="Trang chưa tải được. Dữ liệu của bạn không bị thay đổi. Thử tải lại; nếu vẫn lỗi hãy báo quản trị."
    >
      <Button variant="danger" onClick={() => reset()}>
        Tải lại
      </Button>
    </StateCard>
  );
}
