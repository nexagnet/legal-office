import { describe, expect, it } from 'vitest';
import { cleanLocalDateTime, dmsDateRange } from '../lib/dms-date-range';
import { searchDmsCases } from '../lib/dms-browse';
import { vi } from 'vitest';

vi.mock('../lib/server', () => ({ API_URL: 'http://api' }));

describe('lọc ngày giờ chính xác', () => {
  it('chỉ nhận ngày giờ có thật, đúng dạng datetime-local', () => {
    expect(cleanLocalDateTime('2026-11-05T08:30')).toBe('2026-11-05T08:30');
    expect(cleanLocalDateTime('2026-02-30T08:30')).toBeUndefined();
    expect(cleanLocalDateTime('2026-11-05T25:00')).toBeUndefined();
    expect(cleanLocalDateTime('2026-11-05')).toBeUndefined();
    expect(cleanLocalDateTime('1999-01-01T00:00')).toBeUndefined();
    expect(cleanLocalDateTime(undefined)).toBeUndefined();
  });

  it('giờ Việt Nam đổi sang UTC; "Đến" tính hết phút đó', () => {
    const r = dmsDateRange('2026-11-05T08:00', '2026-11-05T17:30');
    expect(r.from).toBe('2026-11-05T01:00:00.000Z');
    expect(r.to).toBe('2026-11-05T10:31:00.000Z');
    expect(r.inverted).toBe(false);
  });

  it('qua nửa đêm và đầu năm đúng múi giờ', () => {
    expect(dmsDateRange('2026-01-01T00:00', undefined).from).toBe('2025-12-31T17:00:00.000Z');
    expect(dmsDateRange(undefined, '2026-12-31T23:59').to).toBe('2026-12-31T17:00:00.000Z');
  });

  it('báo khi "Từ" muộn hơn "Đến"; giá trị sai bị bỏ', () => {
    expect(dmsDateRange('2026-11-06T00:00', '2026-11-05T00:00').inverted).toBe(true);
    const bad = dmsDateRange('xyz', 'abc');
    expect(bad.from).toBeUndefined();
    expect(bad.to).toBeUndefined();
  });

  it('gửi from/to cho API và bỏ lọc theo năm', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => {
      calls.push(String(u));
      return {
        ok: true,
        json: async () => ({ rows: [], total: 0, totalCapped: false }),
      } as Response;
    });
    const base = { officeId: 'o1', domain: 'tongdat', filter: 'chinh-thuc' as const, year: 2026 };
    await searchDmsCases(null, { ...base, from: '2026-11-05T01:00:00.000Z' });
    await searchDmsCases(null, base);
    expect(calls[0]).toContain('from=2026-11-05T01%3A00%3A00.000Z');
    expect(calls[0]).not.toContain('year=');
    expect(calls[1]).toContain('year=2026');
    vi.restoreAllMocks();
  });
});
