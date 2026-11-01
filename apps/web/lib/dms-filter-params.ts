import type { DmsFilter } from './dms';

/** Phần thuần (không đụng máy chủ) của bộ lọc danh sách DMS: dùng được cả ở thành phần chạy trên trình duyệt. */

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
