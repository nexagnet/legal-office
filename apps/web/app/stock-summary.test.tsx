import { describe, expect, it } from 'vitest';
import { summarizeStock, type StockMovement } from '../lib/stock-movements';

const m = (
  id: number,
  kind: string,
  delta: number,
  at: string,
  purpose: string | null = null,
): StockMovement => ({
  movementId: id,
  at,
  kind,
  delta,
  purpose,
  actorUserId: 'u',
  itemId: 'i',
  itemName: 'Giấy A4',
  unit: 'ram',
  branchId: 'b',
  batchId: 'l',
  receiptRef: 'PN-1',
  batchReceivedAt: '2026-01-02T00:00:00Z',
});

describe('tóm tắt tồn vật tư (Figma Văn phòng phẩm)', () => {
  it('tồn đầu kỳ = tồn hiện tại − nhập + xuất − điều chỉnh, nên cộng lại luôn ra tồn hiện tại', () => {
    const list = [
      m(1, 'RECEIPT', 30, '2026-03-01T00:00:00Z'),
      m(2, 'ISSUE', -35, '2026-04-01T00:00:00Z', 'Bộ phận Hồ sơ'),
      m(3, 'ADJUSTMENT', -2, '2026-05-01T00:00:00Z', 'Kiểm kê'),
    ];
    const s = summarizeStock(13, list);
    expect(s.received).toBe(30);
    expect(s.issued).toBe(35);
    expect(s.adjusted).toBe(-2);
    expect(s.opening).toBe(20);
    expect(s.opening + s.received - s.issued + s.adjusted).toBe(13);
  });

  it('giao dịch gần nhất là biến động mới nhất; không có biến động thì tồn đầu kỳ bằng tồn hiện tại', () => {
    const s = summarizeStock(5, [
      m(1, 'RECEIPT', 5, '2026-01-01T00:00:00Z'),
      m(2, 'ISSUE', -1, '2026-02-01T00:00:00Z', 'x'),
    ]);
    expect(s.last?.movementId).toBe(2);
    const none = summarizeStock(7, []);
    expect(none.opening).toBe(7);
    expect(none.last).toBeNull();
    expect(summarizeStock(null, []).opening).toBe(0);
  });
});
