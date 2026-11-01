import Link from 'next/link';
import { Search } from 'lucide-react';
import { StatusPill } from '../../components/StatusPill';
import {
  AdjustBatchDialog,
  MovementSheet,
  StockMoreMenu,
  ThresholdDialog,
} from '../../components/StockDialogs';
import {
  StocktakeCount,
  StocktakeDecision,
  StocktakeOpen,
} from '../../components/StocktakeActions';
import {
  STOCKTAKE_STATUS_LABEL,
  canDecide,
  countRows,
  diffLabel,
  type BatchRef,
  type Stocktake,
  type StocktakeLine,
} from '../../lib/stocktake-view';
import { Button } from '../../components/ui/button';
import { Input, Select } from '../../components/ui/field';
import {
  MOVEMENT_KIND_LABEL,
  movementQuery,
  signedQty,
  summarizeStock,
  type StockMovement,
} from '../../lib/stock-movements';
import { FilterChips } from '../../components/ui/filter-chips';
import { TabNav } from '../../components/ui/tab-nav';
import { loadMyDmsPermissions } from '../../lib/dms';
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

type Tab =
  'ton-kho' | 'danh-muc' | 'nhap-kho' | 'xuat-kho' | 'dieu-chinh' | 'lich-su' | 'kiem-ke' | 'lo';

/** Tab xem biến động theo loại (Figma): nhập kho, xuất kho, lịch sử điều chỉnh. */
const KIND_TAB: Partial<Record<Tab, string>> = {
  'nhap-kho': 'RECEIPT',
  'xuat-kho': 'ISSUE',
  'dieu-chinh': 'ADJUSTMENT',
};

async function loadLines(
  cookie: string | null,
  officeId: string,
  stocktakeId: string,
): Promise<StocktakeLine[] | 'error'> {
  try {
    const res = await fetch(
      `${API_URL}/office/stocktakes/${encodeURIComponent(stocktakeId)}/lines?officeId=${encodeURIComponent(officeId)}`,
      { headers: cookie ? { cookie } : {}, cache: 'no-store' },
    );
    if (!res.ok) return 'error';
    return (await res.json()) as StocktakeLine[];
  } catch {
    return 'error';
  }
}

const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

/** Lịch sử nhập/xuất/điều chỉnh. Lỗi hoặc không đủ quyền thì trả 'error', không giả lập. */
async function loadMovements(
  cookie: string | null,
  officeId: string,
  filters: URLSearchParams,
): Promise<StockMovement[] | 'error'> {
  try {
    const res = await fetch(
      `${API_URL}/office/movements?officeId=${encodeURIComponent(officeId)}&${filters.toString()}`,
      { headers: cookie ? { cookie } : {}, cache: 'no-store' },
    );
    if (!res.ok) return 'error';
    return (await res.json()) as StockMovement[];
  } catch {
    return 'error';
  }
}
type Chip = 'all' | 'in' | 'low' | 'out';

const norm = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export default async function SuppliesPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    chip?: string;
    q?: string;
    item?: string;
    branch?: string;
    from?: string;
    to?: string;
    id?: string;
  }>;
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
  // Quyền dms.stock.write (Nhóm quyền) cho phép như quản lý kho; vai cũ vẫn giữ để không mất quyền hiện có.
  const stockWrite = officeId
    ? (await loadMyDmsPermissions(cookie, officeId)).includes('dms.stock.write')
    : false;
  const canManage =
    stockWrite || session.roles.some((r) => r === 'ADMIN' || r === 'TRUONG_VP' || r === 'THU_KY');
  const canAdjust = stockWrite || session.roles.some((r) => r === 'ADMIN' || r === 'TRUONG_VP');
  const batchList = batches === 'error' ? [] : batches;
  const canCount = canManage || session.roles.includes('VAN_THU');
  const tab: Tab =
    sp.tab === 'lo' && canAdjust
      ? 'lo'
      : sp.tab === 'lich-su' && canManage
        ? 'lich-su'
        : sp.tab && sp.tab in KIND_TAB && canManage
          ? (sp.tab as Tab)
          : sp.tab === 'danh-muc'
            ? 'danh-muc'
            : sp.tab === 'kiem-ke' && canCount
              ? 'kiem-ke'
              : 'ton-kho';
  const stocktakes =
    tab === 'kiem-ke' && officeId ? await get<Stocktake>(cookie, 'stocktakes', officeId) : [];
  const sessions = stocktakes === 'error' ? [] : stocktakes;
  const current = sessions.find((s) => s.id === sp.id) ?? sessions[0] ?? null;
  const currentLines =
    tab === 'kiem-ke' && officeId && current ? await loadLines(cookie, officeId, current.id) : [];
  const currentRows = current
    ? countRows(
        current.branchId,
        (batches === 'error' ? [] : batches) as readonly BatchRef[],
        currentLines === 'error' ? [] : currentLines,
      )
    : [];
  const countedCount = currentRows.filter((r) => r.countedQty !== null).length;
  // Cột tồn đầu kỳ/nhập/xuất tính từ biến động trong năm hiện tại (giờ Việt Nam); tab lịch sử dùng bộ lọc ngày của người dùng.
  const yearVn = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date());
  const movementFilters = movementQuery(
    tab === 'lich-su' ? sp : { ...sp, from: sp.from ?? `${yearVn}-01-01` },
  );
  const needMovements = tab === 'ton-kho' || tab === 'lich-su' || tab in KIND_TAB;
  const movementsAll =
    needMovements && officeId && canManage
      ? await loadMovements(cookie, officeId, movementFilters)
      : [];
  const kindFilter = KIND_TAB[tab];
  const movements =
    movementsAll === 'error' || !kindFilter
      ? movementsAll
      : movementsAll.filter((m) => m.kind === kindFilter);
  const branchName = new Map(session.branches.map((b) => [b.id, b.name]));
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
          <h1 id="t">Văn phòng phẩm</h1>
          <p className="muted">Danh mục, nhập, xuất, tồn kho và lịch sử điều chỉnh vật tư.</p>
        </div>
        {officeId && canManage ? (
          <div className="flex flex-wrap gap-3">
            <MovementSheet items={items} branches={session.branches} />
            <StockMoreMenu officeId={officeId} />
          </div>
        ) : null}
      </div>
      <TabNav
        label="Mục vật tư"
        active={tab}
        tabs={[
          { key: 'ton-kho', label: 'Tồn kho', href: href({ tab: 'ton-kho' }), count: items.length },
          { key: 'danh-muc', label: 'Danh mục', href: href({ tab: 'danh-muc' }) },
          ...(canManage
            ? [
                { key: 'nhap-kho', label: 'Nhập kho', href: href({ tab: 'nhap-kho' }) },
                { key: 'xuat-kho', label: 'Xuất kho', href: href({ tab: 'xuat-kho' }) },
                {
                  key: 'dieu-chinh',
                  label: 'Lịch sử điều chỉnh',
                  href: href({ tab: 'dieu-chinh' }),
                },
                { key: 'lich-su', label: 'Lịch sử nhập/xuất', href: href({ tab: 'lich-su' }) },
              ]
            : []),
          ...(canCount
            ? [{ key: 'kiem-ke', label: 'Kiểm kê', href: href({ tab: 'kiem-ke' }) }]
            : []),
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
                    <th scope="col">ĐVT</th>
                    <th scope="col">Tồn đầu kỳ</th>
                    <th scope="col">Nhập</th>
                    <th scope="col">Xuất</th>
                    <th scope="col">Tồn hiện tại</th>
                    <th scope="col">Giao dịch gần nhất</th>
                    <th scope="col">Ngưỡng</th>
                    <th scope="col">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const sum = summarizeStock(
                      r.onHand,
                      movementsAll === 'error'
                        ? []
                        : movementsAll.filter(
                            (m) =>
                              m.itemId === r.itemId && m.branchId === (r.branchId ?? m.branchId),
                          ),
                    );
                    const shownSum = canManage && movementsAll !== 'error';
                    return (
                      <tr key={`${r.itemId}-${r.branchId ?? 'none'}`}>
                        <th scope="row">
                          {r.name}
                          <br />
                          <span className="muted">{r.branchName ?? 'Chưa có tồn'}</span>
                        </th>
                        <td>{r.unit}</td>
                        <td>{shownSum ? sum.opening : ''}</td>
                        <td>{shownSum ? sum.received : ''}</td>
                        <td>{shownSum ? sum.issued : ''}</td>
                        <td className="font-bold">{r.onHand === null ? '' : r.onHand}</td>
                        <td>
                          {shownSum && sum.last ? (
                            `${MOVEMENT_KIND_LABEL[sum.last.kind] ?? sum.last.kind} ${new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(sum.last.at))}${sum.last.purpose ? ` · ${sum.last.purpose}` : ''}`
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted mt-4">
            Mọi giao dịch nhập/xuất được giữ lại. Điều chỉnh giao dịch đã ghi nhận phải qua ghi nhận
            điều chỉnh có lưu vết, không xóa lịch sử. Nguyên tắc xuất kho: ưu tiên lô nhập trước
            (FIFO), có lịch sử người nhập/xuất, thời gian và chi nhánh.
          </p>
        </>
      ) : tab === 'danh-muc' ? (
        <>
          {items.length === 0 ? (
            <div className="state" role="status">
              <h2>Chưa có vật tư</h2>
              <p>Thêm vật tư ở menu "…" cạnh nút Nhập / xuất.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Danh mục vật tư</caption>
                <thead>
                  <tr>
                    <th scope="col">Vật tư</th>
                    <th scope="col">ĐVT</th>
                    <th scope="col">Ngưỡng sắp hết</th>
                  </tr>
                </thead>
                <tbody>
                  {[...new Map(rows.map((r) => [r.itemId, r])).values()].map((r) => (
                    <tr key={r.itemId}>
                      <th scope="row">{r.name}</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : tab === 'kiem-ke' ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="muted">
              Kiểm kê theo phiên. Chênh lệch chỉ ghi vào sổ sau khi Trưởng văn phòng duyệt; mỗi
              chênh lệch cần lý do; chỉ ghi số lượng.
            </p>
            {officeId ? <StocktakeOpen officeId={officeId} branches={session.branches} /> : null}
          </div>
          {stocktakes === 'error' ? (
            <div className="state" role="alert">
              <h2>Không tải được các phiên kiểm kê</h2>
              <p>Vui lòng thử lại sau.</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="state" role="status">
              <h2>Chưa có phiên kiểm kê</h2>
              <p>Bấm “Tạo phiên kiểm kê” để bắt đầu đếm một chi nhánh.</p>
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] items-start gap-4 max-lg:grid-cols-1">
              <nav className="panel" aria-label="Các phiên kiểm kê">
                <h2>Các phiên kiểm kê</h2>
                <ul className="grid gap-2">
                  {sessions.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/vat-tu?tab=kiem-ke&id=${s.id}`}
                        aria-current={current?.id === s.id ? 'page' : undefined}
                        className="flex items-center justify-between gap-2 rounded-xl border border-line p-3 no-underline aria-[current=page]:border-accent aria-[current=page]:bg-accent-soft/40"
                      >
                        <span>
                          {s.branchName}
                          <span className="muted block text-xs">
                            {dateTime.format(new Date(s.createdAt))}
                          </span>
                        </span>
                        <StatusPill
                          status={s.status}
                          label={STOCKTAKE_STATUS_LABEL[s.status] ?? s.status}
                          tone={
                            s.status === 'OPEN' ? 'warn' : s.status === 'APPROVED' ? 'ok' : 'danger'
                          }
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              {current ? (
                <div className="grid gap-4">
                  <div className="panel">
                    <h2>
                      {current.branchName} ·{' '}
                      {STOCKTAKE_STATUS_LABEL[current.status] ?? current.status}
                    </h2>
                    {current.note ? <p className="muted">{current.note}</p> : null}
                    <div className="table-wrap">
                      <table>
                        <caption className="sr-only">Số đếm theo lô của phiên kiểm kê</caption>
                        <thead>
                          <tr>
                            <th scope="col">Vật tư</th>
                            <th scope="col">Lô</th>
                            <th scope="col">Số sổ sách</th>
                            <th scope="col">Đếm thực tế</th>
                            <th scope="col">Chênh lệch</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentRows.map((r) => {
                            const d = diffLabel(r);
                            return (
                              <tr key={r.batchId}>
                                <th scope="row">{r.itemName}</th>
                                <td>{r.receiptRef}</td>
                                <td>{r.systemQty}</td>
                                <td>
                                  {current.status === 'OPEN' ? (
                                    <StocktakeCount
                                      stocktakeId={current.id}
                                      batchId={r.batchId}
                                      systemQty={r.systemQty}
                                      countedQty={r.countedQty}
                                      reason={r.reason}
                                    />
                                  ) : (
                                    (r.countedQty ?? <span className="muted">—</span>)
                                  )}
                                </td>
                                <td>
                                  <StatusPill status={d.tone} label={d.text} tone={d.tone} />
                                  {r.reason ? <span className="muted"> · {r.reason}</span> : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {current.status === 'OPEN' && canAdjust ? (
                    <div className="panel">
                      <h2>Trưởng văn phòng duyệt</h2>
                      <p className="muted">
                        Duyệt thì mới ghi phiếu điều chỉnh cho các dòng lệch; sổ đổi giữa chừng thì
                        phải đếm lại.
                      </p>
                      <StocktakeDecision
                        stocktakeId={current.id}
                        enabled={canDecide(current.status, countedCount)}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </>
      ) : tab === 'lich-su' || tab in KIND_TAB ? (
        <>
          <form method="get" role="search" className="mb-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value={tab} />
            <label className="grid gap-1 text-[13px] font-semibold">
              Vật tư
              <Select name="item" defaultValue={sp.item ?? ''}>
                <option value="">Tất cả</option>
                {items.map((i) => (
                  <option key={i.itemId} value={i.itemId}>
                    {i.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-[13px] font-semibold">
              Chi nhánh
              <Select name="branch" defaultValue={sp.branch ?? ''}>
                <option value="">Tất cả</option>
                {session.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-[13px] font-semibold">
              Từ ngày
              <Input type="date" name="from" defaultValue={sp.from ?? ''} />
            </label>
            <label className="grid gap-1 text-[13px] font-semibold">
              Đến ngày
              <Input type="date" name="to" defaultValue={sp.to ?? ''} />
            </label>
            <Button type="submit">Lọc</Button>
          </form>
          {movements === 'error' ? (
            <div className="state" role="alert">
              <h2>Không tải được lịch sử</h2>
              <p>Vui lòng thử lại sau.</p>
            </div>
          ) : movements.length === 0 ? (
            <div className="state" role="status">
              <h2>Chưa có biến động</h2>
              <p>Không có lần nhập, xuất hay điều chỉnh nào khớp bộ lọc.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Lịch sử nhập, xuất và điều chỉnh vật tư</caption>
                <thead>
                  <tr>
                    <th scope="col">Thời gian</th>
                    <th scope="col">Loại</th>
                    <th scope="col">Vật tư</th>
                    <th scope="col">Số lượng</th>
                    <th scope="col">Lô (phiếu nhập)</th>
                    <th scope="col">Chi nhánh</th>
                    <th scope="col">Lý do, mục đích</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.movementId}>
                      <th scope="row">{dateTime.format(new Date(m.at))}</th>
                      <td>{MOVEMENT_KIND_LABEL[m.kind] ?? m.kind}</td>
                      <td>{m.itemName}</td>
                      <td>
                        {signedQty(m.delta)} {m.unit}
                      </td>
                      <td>{m.receiptRef}</td>
                      <td>{branchName.get(m.branchId) ?? '—'}</td>
                      <td>{m.purpose ?? <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted mt-4">
            Xuất kho trừ theo lô nhập trước (FIFO) và chặn khi vượt tồn; mọi biến động đều ghi người
            thực hiện, thời gian và lô nguồn. Không ghi giá.
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
