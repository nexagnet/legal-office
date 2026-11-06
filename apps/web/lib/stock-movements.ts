/** Một dòng lịch sử nhập/xuất/điều chỉnh vật tư kèm nguồn lô (không có giá). Đúng như `GET /office/movements`. */
export interface StockMovement {
  readonly movementId: string | number;
  readonly at: string;
  readonly kind: 'RECEIPT' | 'ISSUE' | 'ADJUSTMENT' | string;
  readonly delta: number;
  readonly purpose: string | null;
  readonly actorUserId: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly unit: string;
  readonly branchId: string;
  readonly batchId: string;
  readonly receiptRef: string;
  readonly batchReceivedAt: string;
}

export const MOVEMENT_KIND_LABEL: Record<string, string> = {
  RECEIPT: 'Nhập kho',
  ISSUE: 'Xuất kho',
  ADJUSTMENT: 'Điều chỉnh',
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Bộ lọc lịch sử từ query của trang; giá trị sai bị bỏ, không làm hỏng yêu cầu. */
export function movementQuery(sp: {
  readonly item?: string;
  readonly branch?: string;
  readonly from?: string;
  readonly to?: string;
}): URLSearchParams {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const p = new URLSearchParams();
  if (sp.item && uuid.test(sp.item)) p.set('itemId', sp.item);
  if (sp.branch && uuid.test(sp.branch)) p.set('branchId', sp.branch);
  if (sp.from && ISO.test(sp.from)) p.set('from', sp.from);
  if (sp.to && ISO.test(sp.to)) p.set('to', sp.to);
  p.set('limit', '200');
  return p;
}

/** Số có dấu: nhập +, xuất -. */
export function signedQty(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export interface StockSummaryRow {
  readonly opening: number;
  readonly received: number;
  readonly issued: number;
  readonly adjusted: number;
  readonly last: StockMovement | null;
}

/**
 * Cột Figma "Văn phòng phẩm": tồn đầu kỳ, nhập, xuất, giao dịch gần nhất, tính từ lịch sử biến động trong kỳ.
 * Tồn đầu kỳ = tồn hiện tại − nhập + xuất − điều chỉnh (điều chỉnh có dấu), nên luôn khớp tồn hiện tại.
 */
export function summarizeStock(
  onHand: number | null,
  movements: readonly StockMovement[],
): StockSummaryRow {
  let received = 0;
  let issued = 0;
  let adjusted = 0;
  let last: StockMovement | null = null;
  for (const m of movements) {
    if (m.kind === 'RECEIPT') received += m.delta;
    else if (m.kind === 'ISSUE') issued += -m.delta;
    else adjusted += m.delta;
    if (!last || new Date(m.at) > new Date(last.at)) last = m;
  }
  const current = onHand ?? 0;
  return { opening: current - received + issued - adjusted, received, issued, adjusted, last };
}
