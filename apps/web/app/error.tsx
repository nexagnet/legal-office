'use client';

/** Lỗi không lường trước của một trang: nói rõ, cho thử lại, không lộ chi tiết kỹ thuật. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="state" role="alert">
      <h1>Có lỗi xảy ra</h1>
      <p>Trang chưa tải được. Dữ liệu của bạn không bị thay đổi. Vui lòng thử lại.</p>
      <button type="button" className="primary" onClick={() => reset()}>
        Thử lại
      </button>
    </section>
  );
}
