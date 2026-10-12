/** Cửa sổ sửa trực tiếp: đúng 48 giờ liên tục kể từ createdAt, tính cả cuối tuần (không dùng lịch). */
export const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

/** 47:59:59 còn sửa được; đúng 48:00:00 là hết hạn. Thời điểm tương lai so với createdAt coi như chưa hết hạn. */
export function isWithinEditWindow(createdAtIso: string, now: Date): boolean {
  const created = Date.parse(createdAtIso);
  if (Number.isNaN(created)) return false;
  return now.getTime() - created < EDIT_WINDOW_MS;
}
