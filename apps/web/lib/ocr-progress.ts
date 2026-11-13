// Tiến độ OCR tài liệu mới: hàm thuần, không import gì từ máy chủ để component client dùng được.
export type OcrStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';

export interface OcrProgressInfo {
  readonly status: OcrStatus | null;
  readonly done: number | null;
  readonly total: number | null;
}

/** Còn đang chờ/đang chạy (hoặc chưa vào hàng đợi) thì cần tiếp tục hỏi tiến độ. */
export function ocrIsActive(status: OcrStatus | null | undefined): boolean {
  return status == null || status === 'PENDING' || status === 'RUNNING';
}

/** Phần trăm 0..100 từ số trang; null khi chưa biết tổng số trang. */
export function ocrPercent(p: OcrProgressInfo): number | null {
  if (p.status === 'DONE') return 100;
  if (p.total == null || p.total <= 0 || p.done == null) return null;
  return Math.min(100, Math.max(0, Math.floor((p.done / p.total) * 100)));
}

/** Chữ hiển thị trạng thái OCR; null khi không cần hiện (tệp không phải PDF/ảnh). */
export function ocrLabel(p: OcrProgressInfo): string {
  switch (p.status) {
    case 'DONE':
      return 'OCR xong';
    case 'FAILED':
      return 'OCR lỗi';
    case 'SKIPPED':
      return 'Không OCR';
    case 'RUNNING': {
      const pct = ocrPercent(p);
      return pct === null ? 'Đang OCR…' : `Đang OCR ${pct}% (${p.done}/${p.total} trang)`;
    }
    default:
      return 'Chờ OCR';
  }
}
