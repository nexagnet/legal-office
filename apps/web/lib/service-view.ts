const DAY_MS = 86_400_000;
const fmtDay = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});

export type DeadlineTone = 'overdue' | 'soon' | 'ok' | 'done';

/**
 * Hạn tống đạt dạng dễ đọc: ngày đầy đủ kèm "còn X ngày" hoặc "quá hạn X ngày".
 * Văn bản đã kết thúc không còn đếm hạn.
 */
export function deadlineView(
  iso: string,
  finished: boolean,
  now: Date = new Date(),
): { readonly date: string; readonly note: string; readonly tone: DeadlineTone } {
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return { date: iso, note: '', tone: 'ok' };
  const date = fmtDay.format(due);
  if (finished) return { date, note: 'Đã kết thúc', tone: 'done' };
  if (due.getTime() < now.getTime()) {
    const late = Math.max(1, Math.ceil((now.getTime() - due.getTime()) / DAY_MS));
    return { date, note: `Quá hạn ${late} ngày`, tone: 'overdue' };
  }
  const days = Math.ceil((due.getTime() - now.getTime()) / DAY_MS);
  return { date, note: `Còn ${days} ngày`, tone: days <= 2 ? 'soon' : 'ok' };
}

/** Việc tiếp theo của một văn bản tống đạt, theo trạng thái (nhãn theo ngôn ngữ nghiệp vụ). */
export function serviceNextStep(status: string): string {
  if (status === 'PENDING') return 'Giao người xử lý';
  if (status === 'ASSIGNED') return 'Ghi nhận kết quả';
  if (status === 'DELIVERED') return 'Hoàn tất · xem bằng chứng';
  if (status === 'UNDELIVERABLE') return 'Hoàn tất · xem lý do';
  return 'Mở xem';
}
