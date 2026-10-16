import { describe, expect, it } from 'vitest';
import { addWorkingDays } from './working-days';

const MON_FRI = { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] as string[] };

// Ngày lịch Asia/Ho_Chi_Minh -> thời điểm 00:00 (UTC+7) của ngày đó.
const ict = (isoDate: string, time = '00:00:00'): Date => new Date(`${isoDate}T${time}+07:00`);
const ymd = (d: Date): string =>
  new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('addWorkingDays', () => {
  it('skips the weekend (Fri 2026-10-16 + 1 = Mon 2026-10-19)', () => {
    expect(ymd(addWorkingDays(ict('2026-10-16'), 1, MON_FRI))).toBe('2026-10-19');
  });

  it('does not count the start day', () => {
    expect(ymd(addWorkingDays(ict('2026-10-12'), 3, MON_FRI))).toBe('2026-10-15');
  });

  it('skips holidays', () => {
    const calendar = { ...MON_FRI, holidays: ['2026-10-19'] };
    expect(ymd(addWorkingDays(ict('2026-10-16'), 1, calendar))).toBe('2026-10-20');
  });

  it('crosses the year boundary', () => {
    const calendar = { ...MON_FRI, holidays: ['2027-01-01'] };
    // Thu 2026-12-31 + 1: Fri 2027-01-01 là lễ, Sat/Sun nghỉ -> Mon 2027-01-04.
    expect(ymd(addWorkingDays(ict('2026-12-31'), 1, calendar))).toBe('2027-01-04');
  });

  it('returns the start day when days = 0 and the start is a working day', () => {
    expect(ymd(addWorkingDays(ict('2026-10-16'), 0, MON_FRI))).toBe('2026-10-16');
  });

  it('rolls forward to a working day when days = 0 on a non-working day', () => {
    expect(ymd(addWorkingDays(ict('2026-10-17'), 0, MON_FRI))).toBe('2026-10-19');
  });

  it('starts on Saturday: Saturday is not a working day by default', () => {
    expect(ymd(addWorkingDays(ict('2026-10-17'), 1, MON_FRI))).toBe('2026-10-19');
  });

  it('counts Saturday when the calendar includes it', () => {
    const calendar = { workingWeekdays: [1, 2, 3, 4, 5, 6], holidays: [] as string[] };
    expect(ymd(addWorkingDays(ict('2026-10-16'), 1, calendar))).toBe('2026-10-17');
    expect(ymd(addWorkingDays(ict('2026-10-16'), 2, calendar))).toBe('2026-10-19');
  });

  it('uses the Asia/Ho_Chi_Minh calendar day, not the UTC day', () => {
    // 2026-10-16T18:00Z = Sat 2026-10-17 01:00 ICT -> ngày bắt đầu là thứ Bảy.
    expect(ymd(addWorkingDays(new Date('2026-10-16T18:00:00Z'), 1, MON_FRI))).toBe('2026-10-19');
    // 2026-10-15T20:00Z = Fri 2026-10-16 03:00 ICT.
    expect(ymd(addWorkingDays(new Date('2026-10-15T20:00:00Z'), 1, MON_FRI))).toBe('2026-10-19');
  });

  it('handles multiple weeks', () => {
    expect(ymd(addWorkingDays(ict('2026-10-16'), 10, MON_FRI))).toBe('2026-10-30');
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects days = %s', (days) => {
    expect(() => addWorkingDays(ict('2026-10-16'), days, MON_FRI)).toThrow(RangeError);
  });

  it('rejects an invalid start date', () => {
    expect(() => addWorkingDays(new Date('invalid'), 1, MON_FRI)).toThrow(RangeError);
  });

  it('rejects an empty or out-of-range workingWeekdays', () => {
    expect(() =>
      addWorkingDays(ict('2026-10-16'), 1, { workingWeekdays: [], holidays: [] }),
    ).toThrow(RangeError);
    expect(() =>
      addWorkingDays(ict('2026-10-16'), 1, { workingWeekdays: [0, 8], holidays: [] }),
    ).toThrow(RangeError);
  });
});
