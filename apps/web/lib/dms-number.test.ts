import { describe, expect, it } from 'vitest';
import { numberPrefix, withCaseNumber } from './dms-number';

describe('số hồ sơ: chữ mờ trước ô ngày', () => {
  it('Vi bằng chưa cấp số dùng ký hiệu VB-THV', () => {
    expect(numberPrefix('vibang', 2026)).toBe('…/2026/VB-THV ngày');
  });

  it('nghiệp vụ khác giữ ký hiệu ...-TPL', () => {
    expect(numberPrefix('tongdat', 2026)).toBe('…/2026/TĐ-TPL ngày');
    expect(numberPrefix('xacminh', 2026)).toBe('…/2026/XM-TPL ngày');
    expect(numberPrefix('tochuc', 2026)).toBe('…/2026/TC-TPL ngày');
  });

  it('đã có số thì hiện đúng số đã cấp, kể cả số VB-TPL cấp trước khi đổi ký hiệu', () => {
    expect(numberPrefix('vibang', 2026, '030/2026/VB-THV')).toBe('030/2026/VB-THV ngày');
    expect(numberPrefix('vibang', 2026, '029/2026/VB-TPL')).toBe('029/2026/VB-TPL ngày');
  });

  it('ghép số với ngày người nhập', () => {
    expect(withCaseNumber('030/2026/VB-THV', '31/10/2026')).toBe('030/2026/VB-THV ngày 31/10/2026');
  });
});
