import Link from 'next/link';
import { Search } from 'lucide-react';
import { StatusPill } from '../../components/StatusPill';
import {
  AdjustBatchDialog,
  MovementSheet,
  NewItemSheet,
  ThresholdDialog,
} from '../../components/StockDialogs';
import { Input } from '../../components/ui/field';
import { FilterChips } from '../../components/ui/filter-chips';
import { TabNav } from '../../components/ui/tab-nav';
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
interface ThresholdRow {
  readonly itemId: string;
  readonly lowStockQty: number;
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

type Tab = 'ton-kho' | 'lo';
type Chip = 'all' | 'in' | 'low' | 'out';

const norm = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export default async function SuppliesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; chip?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? '').slice(0, 200);
  const chip: Chip = sp.chip === 'in' || sp.chip === 'low' || sp.chip === 'out' ? sp.chip : 'all';
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
  const thresholds = officeId ? await get<ThresholdRow>(cookie, 'item-thresholds', officeId) : [];
  const thresholdOf = new Map(
    (thresholds === 'error' ? [] : thresholds).map((t) => [t.itemId, t.lowStockQty]),
  );
  const canManage = session.roles.some((r) => r === 'ADMIN' || r === 'TRUONG_VP' || r === 'THU_KY');
  const canAdjust = session.roles.some((r) => r === 'ADMIN' || r === 'TRUONG_VP');
  const batchList = batches === 'error' ? [] : batches;
  const tab: Tab = sp.tab === 'lo' && canAdjust ? 'lo' : 'ton-kho';
  const rows = stock === 'error' ? [] : stock;
  const items = [
    ...new Map(rows.map((r) => [r.itemId, { itemId: r.itemId, name: r.name }])).values(),
  ];
  const hasStock = (r: StockRow) => (r.onHand ?? 0) > 0;
  const isLow = (r: StockRow) => {
    const limit = thresholdOf.get(r.itemId);
    return limit !== undefined && hasStock(r) && (r.onHand ?? 0) <= limit;
  };
  const counts = {
    all: rows.length,
    in: rows.filter(hasStock).length,
    low: rows.filter(isLow).length,
    out: rows.filter((r) => !hasStock(r)).length,
  };
  const needle = norm(q);
  const shown = rows
    .filter((r) =>
      chip === 'in'
        ? hasStock(r)
        : chip === 'low'
          ? isLow(r)
          : chip === 'out'
            ? !hasStock(r)
            : true,
    )
    .filter((r) => !needle || norm(r.name).includes(needle));
  const href = (over: { tab?: Tab; chip?: Chip }) => {
    const p = new URLSearchParams();
    const t = over.tab ?? tab;
    if (t !== 'ton-kho') p.set('tab', t);
    const c = over.chip ?? (over.tab ? 'all' : chip);
    if (c !== 'all') p.set('chip', c);
    if (q) p.set('q', q);
    const s = p.toString();
    return s ? `/vat-tu?${s}` : '/vat-tu';
  };
  return (
    <section aria-labelledby="t">
      <div className="page-head">
        <div>
          <h1 id="t">Vật tư văn phòng</h1>
        </div>
        {officeId && canManage ? (
          <div className="flex flex-wrap gap-3">
            <NewItemSheet officeId={officeId} />
            <MovementSheet items={items} branches={session.branches} />
          </div>
        ) : null}
      </div>
      <TabNav
        label="Mục vật tư"
        active={tab}
        tabs={[
          { key: 'ton-kho', label: 'Tồn kho', href: href({ tab: 'ton-kho' }), count: items.length },
          ...(canAdjust
            ? [
                {
                  key: 'lo',
                  label: 'Lô và kiểm kê',
                  href: href({ tab: 'lo' }),
                  count: batchList.length,
                },
              ]
            : []),
        ]}
      />
      {tab === 'ton-kho' ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <FilterChips
              label="Lọc tồn kho"
              active={chip}
              chips={[
                { key: 'all', label: 'Tất cả', href: href({ chip: 'all' }), count: counts.all },
                { key: 'in', label: 'Còn tồn', href: href({ chip: 'in' }), count: counts.in },
                { key: 'low', label: 'Sắp hết', href: href({ chip: 'low' }), count: counts.low },
                { key: 'out', label: 'Hết tồn', href: href({ chip: 'out' }), count: counts.out },
              ]}
            />
            <form method="get" role="search" className="flex-1 basis-72 sm:max-w-sm">
              {chip !== 'all' ? <input type="hidden" name="chip" value={chip} /> : null}
              <label className="relative block">
                <span className="sr-only">Tìm theo tên vật tư</span>
                <Search
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
                />
                <Input
                  type="search"
                  name="q"
                  defaultValue={q}
                  maxLength={200}
                  className="rounded-full pl-10"
                  placeholder="Tìm theo tên vật tư…"
                />
              </label>
            </form>
          </div>
          {stock === 'error' ? (
            <div className="state" role="alert">
              <h2>Không tải được tồn kho</h2>
              <p>Vui lòng thử lại sau.</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="state" role="status">
              <h2>Chưa có vật tư</h2>
              <p>Không có vật tư nào khớp bộ lọc.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Tồn kho vật tư</caption>
                <thead>
                  <tr>
                    <th scope="col">Vật tư</th>
                    <th scope="col">Chi nhánh</th>
                    <th scope="col">Tồn kho</th>
                    <th scope="col">Đơn vị</th>
                    <th scope="col">Ngưỡng</th>
                    <th scope="col">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={`${r.itemId}-${r.branchId ?? 'none'}`}>
                      <th scope="row">{r.name}</th>
                      <td>{r.branchName ?? <span className="muted">Chưa có tồn</span>}</td>
                      <td>{r.onHand === null ? '' : r.onHand}</td>
                      <td>{r.unit}</td>
                      <td>
                        {canAdjust ? (
                          <ThresholdDialog
                            itemId={r.itemId}
                            itemName={r.name}
                            current={thresholdOf.get(r.itemId) ?? null}
                          />
                        ) : (
                          (thresholdOf.get(r.itemId) ?? <span className="muted">—</span>)
                        )}
                      </td>
                      <td>
                        {isLow(r) ? (
                          <StatusPill status="LOW" label="Sắp hết" tone="warn" />
                        ) : (
                          <StatusPill
                            status={hasStock(r) ? 'IN_STOCK' : 'OUT'}
                            label={hasStock(r) ? 'Còn tồn' : 'Hết tồn'}
                            tone={hasStock(r) ? 'ok' : 'warn'}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted mt-4">
            Nguyên tắc xuất kho: ưu tiên lô nhập trước (FIFO), có lịch sử người nhập/xuất, thời gian
            và chi nhánh.
          </p>
        </>
      ) : batchList.length === 0 ? (
        <div className="state" role="status">
          <h2>Chưa có lô</h2>
          <p>Chưa có lô nhập nào để kiểm kê.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Lô vật tư</caption>
            <thead>
              <tr>
                <th scope="col">Vật tư</th>
                <th scope="col">Phiếu nhập</th>
                <th scope="col">Còn / nhập</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {batchList.map((b) => (
                <tr key={b.batchId}>
                  <th scope="row">{b.itemName}</th>
                  <td>{b.receiptRef}</td>
                  <td>
                    {b.qtyRemaining}/{b.qtyReceived}
                  </td>
                  <td>
                    <AdjustBatchDialog
                      batchId={b.batchId}
                      itemName={b.itemName}
                      receiptRef={b.receiptRef}
                      remaining={b.qtyRemaining}
                      received={b.qtyReceived}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
