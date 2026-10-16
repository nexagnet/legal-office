import Link from 'next/link';
import { StatCard } from '../../components/StatCard';
import { AdjustBatchForm, NewItemForm, StockMovementForm } from '../../components/StockForms';
import { API_URL, currentSession, requestCookie } from '../../lib/server';

export const dynamic = 'force-dynamic';

interface StockRow {
  readonly itemId: string;
  readonly name: string;
  readonly unit: string;
  readonly branchId: string | null;
  readonly branchName: string | null;
  readonly onHand: number | null;
}
interface BatchRow {
  readonly batchId: string;
  readonly itemName: string;
  readonly branchId: string;
  readonly receiptRef: string;
  readonly qtyReceived: number;
  readonly qtyRemaining: number;
}

async function get<T>(
  cookie: string | null,
  path: string,
  officeId: string,
): Promise<T[] | 'error'> {
  try {
    const res = await fetch(`${API_URL}/office/${path}?officeId=${encodeURIComponent(officeId)}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return (await res.json()) as T[];
  } catch {
    return 'error';
  }
}

export default async function SuppliesPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Vật tư</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem vật tư.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  const cookie = await requestCookie();
  const stock = officeId ? await get<StockRow>(cookie, 'stock', officeId) : [];
  const batches = officeId ? await get<BatchRow>(cookie, 'batches', officeId) : [];
  const canManage = session.roles.some((r) => r === 'ADMIN' || r === 'TRUONG_VP' || r === 'THU_KY');
  const canAdjust = session.roles.some((r) => r === 'ADMIN' || r === 'TRUONG_VP');
  const items =
    stock === 'error'
      ? []
      : [...new Map(stock.map((r) => [r.itemId, { itemId: r.itemId, name: r.name }])).values()];
  const outOfStock =
    stock === 'error'
      ? 0
      : items.filter((i) => !stock.some((r) => r.itemId === i.itemId && (r.onHand ?? 0) > 0))
          .length;
  return (
    <section aria-labelledby="t">
      <div className="page-head">
        <div>
          <h1 id="t">Vật tư văn phòng</h1>
          <p className="muted">Tồn kho theo chi nhánh, quản lý theo lô nhập. Không có giá.</p>
        </div>
        {officeId && canManage ? (
          <a className="primary btn-link" href="#nhap-vat-tu">
            + Nhập vật tư
          </a>
        ) : null}
      </div>
      {stock !== 'error' && items.length > 0 ? (
        <div className="stats">
          <StatCard label="Mặt hàng" value={items.length} note="Trong danh mục vật tư" />
          <StatCard
            label="Có tồn kho"
            value={items.length - outOfStock}
            note="Còn ít nhất một chi nhánh có tồn"
            tone="green"
          />
          <StatCard
            label="Hết tồn"
            value={outOfStock}
            note="Không còn ở chi nhánh nào"
            tone="amber"
          />
        </div>
      ) : null}
      {stock === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được tồn kho</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="state" role="status">
          <h2>Chưa có vật tư</h2>
          <p>Danh mục vật tư đang trống.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Tồn kho vật tư</caption>
            <thead>
              <tr>
                <th scope="col">Tên vật tư</th>
                <th scope="col">Chi nhánh</th>
                <th scope="col">Tồn kho</th>
                <th scope="col">Đơn vị</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((r) => (
                <tr key={`${r.itemId}-${r.branchId ?? 'none'}`}>
                  <th scope="row">{r.name}</th>
                  <td>{r.branchName ?? <span className="muted">Chưa có tồn</span>}</td>
                  <td>{r.onHand === null ? '' : r.onHand}</td>
                  <td>{r.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <aside className="panel">
        <p className="muted">
          Nguyên tắc xuất kho: ưu tiên lô nhập trước (FIFO), có lịch sử người nhập/xuất, thời gian
          và chi nhánh.
        </p>
      </aside>
      <div id="nhap-vat-tu">
        {officeId && canManage ? <NewItemForm officeId={officeId} /> : null}
        <StockMovementForm items={items} branches={session.branches} />
      </div>
      {canAdjust && batches !== 'error' && batches.length > 0 ? (
        <>
          <h2>Kiểm kê lô</h2>
          <ul className="stack">
            {batches.map((b) => (
              <li key={b.batchId} className="card">
                <strong>{b.itemName}</strong>{' '}
                <span className="muted">
                  · phiếu {b.receiptRef} · còn {b.qtyRemaining}/{b.qtyReceived}
                </span>
                <AdjustBatchForm
                  batchId={b.batchId}
                  remaining={b.qtyRemaining}
                  received={b.qtyReceived}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
