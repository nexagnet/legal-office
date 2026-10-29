/** Đóng quyển sổ theo tháng: trạng thái từng tháng của một năm, dựng từ danh sách tháng đã đóng. */
export interface SealedPeriod {
  readonly period: string;
  readonly sealedBy: string;
  readonly sealedAt: string;
}

export type MonthState = 'sealed' | 'open' | 'running' | 'future';

export interface MonthRow {
  readonly ym: string;
  readonly month: number;
  readonly state: MonthState;
  readonly sealed: SealedPeriod | null;
}

/** `nowYm` là tháng hiện tại theo giờ Việt Nam (YYYY-MM). Tháng đã qua mới đóng được; tháng đang chạy và tương lai thì chưa. */
export function monthRows(
  year: number,
  sealed: readonly SealedPeriod[],
  nowYm: string,
): MonthRow[] {
  const by = new Map(sealed.map((s) => [s.period, s]));
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const ym = `${year}-${String(month).padStart(2, '0')}`;
    const s = by.get(ym) ?? null;
    const state: MonthState = s
      ? 'sealed'
      : ym < nowYm
        ? 'open'
        : ym === nowYm
          ? 'running'
          : 'future';
    return { ym, month, state, sealed: s };
  });
}

export function currentYm(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now).slice(0, 7);
}

export const MONTH_STATE_LABEL: Record<MonthState, string> = {
  sealed: 'Đã đóng quyển',
  open: 'Chưa đóng quyển',
  running: 'Đang trong tháng',
  future: 'Chưa đến',
};
