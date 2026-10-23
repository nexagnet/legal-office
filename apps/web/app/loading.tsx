/** Đang tải: khung xám nhấp nháy giữ chỗ, đọc được bằng trình đọc màn hình. */
export default function Loading() {
  return (
    <section aria-busy="true" aria-live="polite">
      <p className="sr-only">Đang tải…</p>
      <div className="skeleton skeleton-title" />
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton skeleton-short" />
    </section>
  );
}
