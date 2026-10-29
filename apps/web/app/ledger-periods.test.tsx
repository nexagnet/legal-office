import { describe, expect, it } from 'vitest';
import { currentYm, monthRows } from '../lib/ledger-periods';

describe('Đóng quyển theo tháng', () => {
  it('phân loại 12 tháng: đã đóng, chưa đóng, đang chạy, chưa đến', () => {
    const rows = monthRows(
      2026,
      [{ period: '2026-01', sealedBy: 'u1', sealedAt: '2026-02-03T03:00:00Z' }],
      '2026-10',
    );
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ ym: '2026-01', state: 'sealed' });
    expect(rows[1]).toMatchObject({ ym: '2026-02', state: 'open' });
    expect(rows[9]).toMatchObject({ ym: '2026-10', state: 'running' });
    expect(rows[10]).toMatchObject({ ym: '2026-11', state: 'future' });
  });

  it('tháng hiện tại tính theo giờ Việt Nam', () => {
    expect(currentYm(new Date('2026-10-31T18:00:00Z'))).toBe('2026-11');
    expect(currentYm(new Date('2026-10-31T10:00:00Z'))).toBe('2026-10');
  });
});
