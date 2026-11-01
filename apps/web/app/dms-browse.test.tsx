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

import { savedParamsToHref, viewToSavedParams } from '../lib/dms-browse';

describe('bộ lọc đã lưu', () => {
  it('lưu rồi mở lại cho đúng cùng một cách nhìn', () => {
    const view = {
      filter: 'thieu-scan' as const,
      year: 2025,
      q: ' trần ',
      creator: 'u1',
      kind: 'Biên bản',
      branch: 'b1',
    };
    const saved = viewToSavedParams(view);
    expect(saved).toEqual({
      status: 'RECORDED',
      scan: 'missing',
      year: 2025,
      q: 'trần',
      creator: 'u1',
      kind: 'Biên bản',
      branch: 'b1',
    });
    const href = savedParamsToHref('/dms/vi-bang', saved);
    const qs = new URLSearchParams(href.split('?')[1]);
    expect(href.startsWith('/dms/vi-bang?')).toBe(true);
    expect(Object.fromEntries(qs)).toEqual({
      loc: 'thieu-scan',
      q: 'trần',
      year: '2025',
      nt: 'u1',
      lt: 'Biên bản',
      dv: 'b1',
    });
  });

  it('nháp, đã hủy, chờ duyệt và chính thức không năm', () => {
    expect(viewToSavedParams({ filter: 'nhap', year: 2025 })).toEqual({ status: 'DRAFT' });
    expect(viewToSavedParams({ filter: 'cho-duyet' })).toEqual({
      status: 'RECORDED',
      pending: true,
    });
    expect(savedParamsToHref('/dms/x', { status: 'DRAFT' })).toBe('/dms/x?loc=nhap');
    expect(savedParamsToHref('/dms/x', { status: 'RECORDED' })).toBe('/dms/x');
    expect(savedParamsToHref('/dms/x', { status: 'CANCELLED' })).toBe('/dms/x?loc=da-huy');
  });
});
