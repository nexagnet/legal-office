import { describe, expect, it } from 'vitest';
import { deadlineHref } from '../lib/deadlines';

describe('deadlineHref cho hạn pháp định', () => {
  it('trỏ về màn nghiệp vụ tương ứng', () => {
    const base = { label: 'x', dueAt: '', overdue: false, caseId: 'c1' };
    expect(deadlineHref({ ...base, domain: 'XAC_MINH_QUYET_DINH', refId: 'r' } as never)).toBe(
      '/xac-minh',
    );
    expect(deadlineHref({ ...base, domain: 'THA_THU_HOI', refId: 'r' } as never)).toBe(
      '/to-chuc-tha',
    );
    expect(deadlineHref({ ...base, domain: 'TONG_DAT_BAO_KET_QUA', refId: 'r' } as never)).toBe(
      '/tong-dat',
    );
  });
});
