export interface WorkingCalendar {
  /** 1 = thứ Hai … 7 = Chủ nhật. Gợi ý mặc định: [1, 2, 3, 4, 5]. */
  workingWeekdays: readonly number[];
  /** Ngày nghỉ lễ dạng `YYYY-MM-DD` (theo lịch Asia/Ho_Chi_Minh). */
  holidays: readonly string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Asia/Ho_Chi_Minh là UTC+7 quanh năm, không có giờ mùa hè.
const OFFSET_MS = 7 * 60 * 60 * 1000;
// Chặn vòng lặp vô hạn khi lịch gần như không có ngày làm việc nào (vd. mọi ngày đều là ngày lễ).
const MAX_SCAN_DAYS = 366 * 20;

/** Số ngày kể từ epoch của ngày lịch Asia/Ho_Chi_Minh chứa `instant`. */
const toDayNumber = (instant: Date): number => Math.floor((instant.getTime() + OFFSET_MS) / DAY_MS);

const fromDayNumber = (day: number): Date => new Date(day * DAY_MS - OFFSET_MS);

const toIsoDate = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** 1 = thứ Hai … 7 = Chủ nhật. 1970-01-01 (day 0) là thứ Năm. */
const weekdayOf = (day: number): number => (((day + 3) % 7) + 7) % 7 + 1;

/**
 * Hạn dự kiến sau `days` ngày làm việc kể từ `start`. Ngày bắt đầu không được tính và ngày kết quả
 * luôn là ngày làm việc (với `days = 0` mà `start` không phải ngày làm việc thì lấy ngày làm việc
 * kế tiếp). Trả về thời điểm 00:00 Asia/Ho_Chi_Minh của ngày kết quả.
 */
export function addWorkingDays(start: Date, days: number, calendar: WorkingCalendar): Date {
  if (!Number.isInteger(days) || days < 0) {
    throw new RangeError('days must be a non-negative integer');
  }
  if (Number.isNaN(start.getTime())) throw new RangeError('start must be a valid date');
  if (
    calendar.workingWeekdays.length === 0 ||
    !calendar.workingWeekdays.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)
  ) {
    throw new RangeError('workingWeekdays must be a non-empty list of integers in 1..7');
  }

  const holidays = new Set(calendar.holidays);
  const isWorkingDay = (day: number): boolean =>
    calendar.workingWeekdays.includes(weekdayOf(day)) && !holidays.has(toIsoDate(day));

  const first = toDayNumber(start);
  let day = first;
  let remaining = days;
  while (remaining > 0 || !isWorkingDay(day)) {
    if (day - first > MAX_SCAN_DAYS) throw new RangeError('calendar has no reachable working day');
    day += 1;
    if (remaining > 0 && isWorkingDay(day)) remaining -= 1;
  }
  return fromDayNumber(day);
}
