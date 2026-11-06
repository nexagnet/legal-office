import { describe, expect, it } from 'vitest';
import { movementQuery, signedQty } from '../lib/stock-movements';

describe('Lịch sử vật tư', () => {
  it('chỉ giữ bộ lọc hợp lệ và luôn giới hạn số dòng', () => {
    const id = '0b7e5c1e-7a6a-4c53-9d2e-0a1f4f2f3a11';
    const p = movementQuery({ item: id, branch: 'sai', from: '2026-10-01', to: '01/10/2026' });
    expect(p.get('itemId')).toBe(id);
    expect(p.get('branchId')).toBeNull();
    expect(p.get('from')).toBe('2026-10-01');
    expect(p.get('to')).toBeNull();
    expect(p.get('limit')).toBe('200');
  });

  it('ghi số lượng có dấu', () => {
    expect(signedQty(5)).toBe('+5');
    expect(signedQty(-3)).toBe('-3');
  });
});
