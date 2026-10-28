import { describe, expect, it } from 'vitest';
import { linkedCaseHref, progressSteps } from '../lib/correspondence-view';

describe('Chi tiết công văn', () => {
  it('dẫn về hồ sơ liên quan theo loại, không có thì null', () => {
    expect(linkedCaseHref('VIBANG', 'c1')).toBe('/vi-bang/c1');
    expect(linkedCaseHref('ENFORCEMENT', 'c2')).toBe('/to-chuc-tha/c2');
    expect(linkedCaseHref('SERVICE', 'c3')).toBe('/tong-dat/c3');
    expect(linkedCaseHref('VERIFICATION', 'c4')).toBe('/xac-minh/c4');
    expect(linkedCaseHref(null, null)).toBeNull();
    expect(linkedCaseHref('LA', 'x')).toBeNull();
  });

  it('tiến trình công văn đến: chưa giao thì đang ở Tiếp nhận, đã xử lý thì xong hết', () => {
    const states = (s: ReturnType<typeof progressSteps>) => s.map((x) => x.state);
    expect(
      states(progressSteps({ direction: 'INBOUND', status: 'RECEIVED', handlerUserId: null })),
    ).toEqual(['current', 'todo', 'todo', 'todo']);
    expect(
      states(progressSteps({ direction: 'INBOUND', status: 'RECEIVED', handlerUserId: 'u' })),
    ).toEqual(['done', 'current', 'todo', 'todo']);
    expect(
      states(progressSteps({ direction: 'INBOUND', status: 'HANDLED', handlerUserId: 'u' })),
    ).toEqual(['done', 'done', 'done', 'done']);
  });

  it('tiến trình công văn đi theo trạng thái', () => {
    const cur = (status: string) =>
      progressSteps({ direction: 'OUTBOUND', status, handlerUserId: null }).findIndex(
        (x) => x.state === 'current',
      );
    expect(cur('DRAFT')).toBe(0);
    expect(cur('SUBMITTED')).toBe(1);
    expect(cur('APPROVED')).toBe(2);
    expect(cur('ISSUED')).toBe(-1);
  });
});
