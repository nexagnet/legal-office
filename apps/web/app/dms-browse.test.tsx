import { describe, expect, it } from 'vitest';
import { filterToParams, formatTotal, pageWindow } from '../lib/dms-browse';

describe('lib/dms-browse', () => {
  it('chip lọc đổi thành bộ lọc API; nháp và đã hủy không lọc theo năm', () => {
    expect(filterToParams('chinh-thuc', 2026)).toEqual({ status: 'RECORDED', year: 2026 });
    expect(filterToParams('thieu-scan', 2026)).toMatchObject({ scan: 'missing', year: 2026 });
    expect(filterToParams('du-scan', 2026)).toMatchObject({ scan: 'complete' });
    expect(filterToParams('cho-duyet', 2026)).toMatchObject({ pending: 'true' });
    expect(filterToParams('nhap', 2026)).toEqual({ status: 'DRAFT' });
    expect(filterToParams('da-huy', 2026)).toEqual({ status: 'CANCELLED' });
  });

  it('thanh trang gọn: đầu, cuối, hai trang mỗi bên, có dấu …', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, '…', 5]);
    expect(pageWindow(50, 1001)).toEqual([1, '…', 48, 49, 50, 51, 52, '…', 1001]);
    expect(pageWindow(1001, 1001)).toEqual([1, '…', 999, 1000, 1001]);
  });

  it('tổng bị chặn hiện 10.000+', () => {
    expect(formatTotal(1234, false)).toBe('1.234');
    expect(formatTotal(10001, true)).toBe('10.000+');
  });
});
