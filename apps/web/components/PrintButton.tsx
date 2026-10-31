'use client';

/** In trang hiện tại (sổ xem trước theo mẫu). Ẩn khi in nhờ lớp `print-hide`. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}>
      In sổ
    </button>
  );
}
