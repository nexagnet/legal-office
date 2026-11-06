/** Phiên kiểm kê vật tư theo chi nhánh. Đúng như `GET /office/stocktakes` (không có giá). */
export interface Stocktake {
  readonly id: string;
  readonly branchId: string;
  readonly branchName: string;
  readonly note: string | null;
  readonly status: 'OPEN' | 'APPROVED' | 'REJECTED' | string;
  readonly createdAt: string;
  readonly decidedAt: string | null;
  readonly lines: number;
  readonly varianceLines: number;
}

/** Dòng đã đếm của một phiên, đúng như `GET /office/stocktakes/:id/lines`. */
export interface StocktakeLine {
  readonly batchId: string;
  readonly itemName: string;
  readonly receiptRef: string;
  readonly systemQty: number;
  readonly countedQty: number;
  readonly diff: number;
  readonly reason: string | null;
}

/** Lô của chi nhánh, từ `GET /office/batches`. */
export interface BatchRef {
  readonly batchId: string;
  readonly itemName: string;
  readonly branchId: string;
  readonly receiptRef: string;
  readonly qtyRemaining: number;
}

export const STOCKTAKE_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Đang đếm',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
};

export interface CountRow {
  readonly batchId: string;
  readonly itemName: string;
  readonly receiptRef: string;
  /** Số sổ sách: số đã chốt khi đếm, chưa đếm thì số còn hiện tại của lô. */
  readonly systemQty: number;
  readonly countedQty: number | null;
  readonly reason: string | null;
}

/** Ghép mọi lô của chi nhánh với số đã đếm; lô chưa đếm có `countedQty` null. */
export function countRows(
  branchId: string,
  batches: readonly BatchRef[],
  lines: readonly StocktakeLine[],
): CountRow[] {
  const byBatch = new Map(lines.map((l) => [l.batchId, l]));
  return batches
    .filter((b) => b.branchId === branchId)
    .map((b) => {
      const l = byBatch.get(b.batchId);
      return {
        batchId: b.batchId,
        itemName: b.itemName,
        receiptRef: b.receiptRef,
        systemQty: l ? l.systemQty : b.qtyRemaining,
        countedQty: l ? l.countedQty : null,
        reason: l?.reason ?? null,
      };
    });
}

/** Chênh lệch bằng chữ, không chỉ bằng màu: Khớp, Thiếu n, Thừa n, Chưa đếm. */
export function diffLabel(r: Pick<CountRow, 'systemQty' | 'countedQty'>): {
  readonly text: string;
  readonly tone: 'ok' | 'warn' | 'idle';
} {
  if (r.countedQty === null) return { text: 'Chưa đếm', tone: 'idle' };
  const d = r.countedQty - r.systemQty;
  if (d === 0) return { text: 'Khớp', tone: 'ok' };
  return { text: d < 0 ? `Thiếu ${-d}` : `Thừa ${d}`, tone: 'warn' };
}

/** Có thể gửi quyết định duyệt khi phiên đang đếm và đã đếm ít nhất một lô. */
export function canDecide(status: string, counted: number): boolean {
  return status === 'OPEN' && counted > 0;
}
