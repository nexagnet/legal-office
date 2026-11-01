import { API_URL } from './server';
import type { DmsBookRow, DmsBookSpec, DmsCaseRow, DmsFilter } from './dms';
import { filterToParams } from './dms-filter-params';

export {
  filterToParams,
  savedParamsToHref,
  viewToSavedParams,
  type DmsSavedParams,
  type DmsView,
} from './dms-filter-params';

/**
 * Danh sách hồ sơ DMS ở quy mô lớn: lọc, tìm, đếm và phân trang chạy trong cơ sở dữ liệu (`/dms/case-search`,
 * `/dms/case-facet-counts`, xem docs/engineering/dms-scale-search.md). Web chỉ giữ một trang hồ sơ trong bộ nhớ.
 */

export interface DmsSearchCase extends DmsCaseRow {
  readonly creator_name: string | null;
  readonly branch_id: string | null;
  readonly branch_name: string | null;
  readonly doc_kinds: readonly string[];
  readonly pending_count: number;
  readonly attributes: Record<string, unknown>;
}

export interface DmsCaseSearchParams {
  readonly officeId: string;
  readonly domain: string;
  readonly filter: DmsFilter;
  readonly year: number;
  readonly q?: string;
  readonly creator?: string;
  readonly kind?: string;
  readonly branch?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly total?: boolean;
}

export interface DmsCaseSearchResult {
  readonly rows: readonly DmsSearchCase[];
  readonly total: number | null;
  /** Tổng bị chặn ở 10.000 (đếm tối đa 10.001): giao diện hiện "10.000+". */
  readonly totalCapped: boolean;
}

export const TOTAL_CAP = 10_000;

function searchQuery(p: DmsCaseSearchParams): URLSearchParams {
  const q = new URLSearchParams({ officeId: p.officeId, domain: p.domain });
  for (const [k, v] of Object.entries(filterToParams(p.filter, p.year)))
    if (v !== undefined) q.set(k, String(v));
  const text = (p.q ?? '').trim();
  if (text) q.set('q', text);
  if (p.creator) q.set('creator', p.creator);
  if (p.kind) q.set('kind', p.kind);
  if (p.branch) q.set('branch', p.branch);
  return q;
}

async function getJson<T>(path: string, cookie: string | null): Promise<T | 'error'> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    return res.ok ? ((await res.json()) as T) : 'error';
  } catch {
    return 'error';
  }
}

export async function searchDmsCases(
  cookie: string | null,
  p: DmsCaseSearchParams,
): Promise<DmsCaseSearchResult | 'error'> {
  const q = searchQuery(p);
  q.set('limit', String(p.limit ?? 10));
  q.set('offset', String(p.offset ?? 0));
  q.set('total', String(p.total ?? true));
  const body = await getJson<{
    rows: DmsSearchCase[];
    total: number | null;
    totalCapped: boolean;
  }>(`/dms/case-search?${q}`, cookie);
  return body === 'error'
    ? 'error'
    : { rows: body.rows, total: body.total, totalCapped: body.totalCapped };
}

/** Chỉ cần số đếm của một chip (không tải dòng nào). */
export async function countDmsCases(
  cookie: string | null,
  p: Pick<DmsCaseSearchParams, 'officeId' | 'domain' | 'filter' | 'year'>,
): Promise<number | undefined> {
  const r = await searchDmsCases(cookie, { ...p, limit: 1, total: true });
  return r === 'error' || r.total === null ? undefined : r.total;
}

export interface DmsFacetOption {
  readonly value: string;
  readonly label: string;
  readonly n: number;
}
export interface DmsFacetCounts {
  readonly creator: readonly DmsFacetOption[];
  readonly branch: readonly DmsFacetOption[];
  readonly kind: readonly DmsFacetOption[];
}

/** Lựa chọn của ba ô lọc kèm số hồ sơ, đếm theo các bộ lọc khác đang chọn; lỗi thì bỏ qua, không chặn trang. */
export async function loadDmsFacetCounts(
  cookie: string | null,
  p: DmsCaseSearchParams,
): Promise<DmsFacetCounts> {
  const body = await getJson<Partial<Record<keyof DmsFacetCounts, DmsFacetOption[]>>>(
    `/dms/case-facet-counts?${searchQuery(p)}`,
    cookie,
  );
  const empty: DmsFacetCounts = { creator: [], branch: [], kind: [] };
  return body === 'error'
    ? empty
    : {
        creator: body.creator ?? [],
        branch: body.branch ?? [],
        kind: body.kind ?? [],
      };
}

/** Dòng sổ (STT + các ô) của đúng các hồ sơ đang hiện trên trang. */
export async function loadBookRowsForCases(
  cookie: string | null,
  officeId: string,
  book: string,
  caseIds: readonly string[],
): Promise<{ book: DmsBookSpec; rows: DmsBookRow[] } | 'error' | null> {
  if (caseIds.length === 0) return null;
  const q = new URLSearchParams({ officeId, book, cases: caseIds.join(',') });
  const body = await getJson<{ book: DmsBookSpec | null; rows: DmsBookRow[] }>(
    `/dms/book-rows-for-cases?${q}`,
    cookie,
  );
  if (body === 'error') return 'error';
  return body.book ? { book: body.book, rows: body.rows } : null;
}

/** Số trang cần hiện: trang đầu, cuối (nếu biết), và hai trang mỗi bên trang hiện tại, chen "…". */
export function pageWindow(page: number, pageCount: number): (number | '…')[] {
  const want = new Set([1, pageCount, page - 2, page - 1, page, page + 1, page + 2]);
  const nums = [...want].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  nums.forEach((n, i) => {
    const prev = nums[i - 1];
    if (prev !== undefined && n - prev > 1) out.push('…');
    out.push(n);
  });
  return out;
}

export const formatTotal = (total: number, capped: boolean): string =>
  capped ? `${TOTAL_CAP.toLocaleString('vi-VN')}+` : total.toLocaleString('vi-VN');

export interface DmsOcrFacets extends DmsFacetCounts {
  readonly year: readonly DmsFacetOption[];
}

/** Lựa chọn lọc cho trang tìm nội dung scan: toàn văn phòng, chỉ hồ sơ đã ghi sổ (bản nháp không có OCR được tìm). */
export async function loadDmsOcrFacets(
  cookie: string | null,
  officeId: string,
  domain?: string,
): Promise<DmsOcrFacets> {
  const q = new URLSearchParams({ officeId, status: 'RECORDED' });
  if (domain) q.set('domain', domain);
  const body = await getJson<Partial<Record<keyof DmsOcrFacets, DmsFacetOption[]>>>(
    `/dms/case-facet-counts?${q}`,
    cookie,
  );
  return body === 'error'
    ? { creator: [], branch: [], kind: [], year: [] }
    : {
        creator: body.creator ?? [],
        branch: body.branch ?? [],
        kind: body.kind ?? [],
        year: body.year ?? [],
      };
}
