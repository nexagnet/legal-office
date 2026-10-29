import { describe, expect, it } from 'vitest';
import { canDecide, countRows, diffLabel } from '../lib/stocktake-view';

const batches = [
  { batchId: 'b1', itemName: 'Giấy A4', branchId: 'br1', receiptRef: 'L-1', qtyRemaining: 50 },
  { batchId: 'b2', itemName: 'Mực in', branchId: 'br1', receiptRef: 'L-2', qtyRemaining: 10 },
  { batchId: 'b3', itemName: 'Bút', branchId: 'br2', receiptRef: 'L-3', qtyRemaining: 18 },
];

describe('Kiểm kê vật tư', () => {
  it('ghép lô của chi nhánh với số đã đếm, lô chưa đếm để trống', () => {
    const rows = countRows('br1', batches, [
      {
        batchId: 'b2',
        itemName: 'Mực in',
        receiptRef: 'L-2',
        systemQty: 10,
        countedQty: 9,
        diff: -1,
        reason: 'Hỏng',
      },
    ]);
    expect(rows.map((r) => r.batchId)).toEqual(['b1', 'b2']);
    expect(rows[0]).toMatchObject({ systemQty: 50, countedQty: null });
    expect(rows[1]).toMatchObject({ systemQty: 10, countedQty: 9, reason: 'Hỏng' });
  });

  it('ghi chênh lệch bằng chữ', () => {
    expect(diffLabel({ systemQty: 5, countedQty: null })).toEqual({
      text: 'Chưa đếm',
      tone: 'idle',
    });
    expect(diffLabel({ systemQty: 5, countedQty: 5 })).toEqual({ text: 'Khớp', tone: 'ok' });
    expect(diffLabel({ systemQty: 10, countedQty: 9 }).text).toBe('Thiếu 1');
    expect(diffLabel({ systemQty: 18, countedQty: 20 }).text).toBe('Thừa 2');
  });

  it('chỉ duyệt khi phiên đang đếm và đã có dòng đếm', () => {
    expect(canDecide('OPEN', 1)).toBe(true);
    expect(canDecide('OPEN', 0)).toBe(false);
    expect(canDecide('APPROVED', 3)).toBe(false);
  });
});
