import { API_URL } from './server';
import type { DmsBookRow, DmsBookSpec, DmsCaseRow, DmsFilter } from './dms';

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

/** Chip lọc -> bộ lọc của API. Nháp và đã hủy không có năm ghi sổ nên không lọc theo năm. */
export function filterToParams(
  filter: DmsFilter,
  year: number,
): { status: 'RECORDED' | 'DRAFT' | 'CANCELLED'; year?: number; scan?: string; pending?: string } {
  switch (filter) {
    case 'nhap':
      return { status: 'DRAFT' };
    case 'da-huy':
      return { status: 'CANCELLED' };
    case 'cho-duyet':
      return { status: 'RECORDED', year, pending: 'true' };
    case 'thieu-scan':
      return { status: 'RECORDED', year, scan: 'missing' };
    case 'du-scan':
      return { status: 'RECORDED', year, scan: 'complete' };
    default:
      return { status: 'RECORDED', year };
  }
}

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

/** Cách nhìn hiện tại của trang danh sách (đúng như trên thanh địa chỉ). */
export interface DmsView {
  readonly filter: DmsFilter;
  readonly year?: number;
  readonly q?: string;
  readonly creator?: string;
  readonly kind?: string;
  readonly branch?: string;
}

/** Tham số lưu trong DB cho bộ lọc đã lưu: cùng tên với bộ lọc của `/dms/case-search`. */
export type DmsSavedParams = Readonly<Record<string, string | number | boolean>>;

/** Cách nhìn -> tham số lưu. Năm chỉ lưu khi người dùng đã chọn năm cụ thể (không ghim năm mặc định). */
export function viewToSavedParams(v: DmsView): DmsSavedParams {
  const base = filterToParams(v.filter, v.year ?? 0);
  const out: Record<string, string | number | boolean> = { status: base.status };
  if (base.scan) out.scan = base.scan;
  if (base.pending) out.pending = true;
  if (v.year && base.year !== undefined) out.year = v.year;
  if (v.q?.trim()) out.q = v.q.trim();
  if (v.creator) out.creator = v.creator;
  if (v.kind) out.kind = v.kind;
  if (v.branch) out.branch = v.branch;
  return out;
}

/** Tham số lưu -> đường dẫn trang danh sách (`base` + chuỗi truy vấn). */
export function savedParamsToHref(base: string, p: DmsSavedParams): string {
  let loc: DmsFilter = 'chinh-thuc';
  if (p.status === 'DRAFT') loc = 'nhap';
  else if (p.status === 'CANCELLED') loc = 'da-huy';
  else if (p.pending === true || p.pending === 'true') loc = 'cho-duyet';
  else if (p.scan === 'missing') loc = 'thieu-scan';
  else if (p.scan === 'complete') loc = 'du-scan';
  const qs = new URLSearchParams();
  if (loc !== 'chinh-thuc') qs.set('loc', loc);
  if (typeof p.q === 'string' && p.q) qs.set('q', p.q);
  if (p.year !== undefined) qs.set('year', String(p.year));
  if (typeof p.creator === 'string') qs.set('nt', p.creator);
  if (typeof p.kind === 'string') qs.set('lt', p.kind);
  if (typeof p.branch === 'string') qs.set('dv', p.branch);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

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
