import type { DmsFilter } from './dms';

/** Phần thuần (không đụng máy chủ) của bộ lọc danh sách DMS: dùng được cả ở thành phần chạy trên trình duyệt. */

/** Chip lọc -> bộ lọc của API. Nháp và đã hủy không có năm ghi sổ nên không lọc theo năm. */
export function filterToParams(
  filter: DmsFilter,
  year: number,
): { status: 'RECORDED' | 'DRAFT' | 'CANCELLED'; year?: number; scan?: string } {
  switch (filter) {
    case 'nhap':
      return { status: 'DRAFT' };
    case 'da-huy':
      return { status: 'CANCELLED' };
    case 'thieu-scan':
      return { status: 'RECORDED', year, scan: 'missing' };
    case 'du-scan':
      return { status: 'RECORDED', year, scan: 'complete' };
    default:
      return { status: 'RECORDED', year };
  }
}

/**
 * Cách nhìn hiện tại của trang danh sách (đúng như trên thanh địa chỉ). Đây là NGUỒN SỰ THẬT DUY NHẤT của bộ lọc:
 * trang, chip "Đang lọc", bộ lọc đã lưu và (sau này) nút Xuất Excel đều dựng từ cùng một `DmsView`.
 */
export interface DmsView {
  readonly filter: DmsFilter;
  readonly year?: number;
  readonly q?: string;
  readonly creator?: string;
  readonly kind?: string;
  readonly branch?: string;
  /** Thừa hành viên (chọn nhiều). */
  readonly thv?: readonly string[];
  /** Việc còn dở: true = còn dở, false = đã xong, không có = không lọc. */
  readonly open?: boolean;
  /** Đã trả kết quả: true / false / không lọc. */
  readonly returned?: boolean;
  /** Bộ lọc nghiệp vụ (0125): giá trị thô facet_a (hình thức tống đạt, tỉnh/thành, kết quả...) và facet_b (cơ quan giao). */
  readonly fa?: string;
  readonly fb?: string;
  /** Khoảng ngày giờ tự chọn (`YYYY-MM-DDTHH:mm`, giờ Việt Nam). */
  readonly tu?: string;
  readonly den?: string;
  /** Mốc nhanh (tương đối); có thì thay cho `tu`/`den`. */
  readonly ky?: string;
}

/** Tham số lưu trong DB cho bộ lọc đã lưu: cùng tên với bộ lọc của `/dms/case-search`, thêm `tu`/`den`/`ky`. */
export type DmsSavedParams = Readonly<
  Record<string, string | number | boolean | readonly string[]>
>;

const triState = (v: string | string[] | undefined): boolean | undefined => {
  const x = Array.isArray(v) ? v[0] : v;
  return x === '1' ? true : x === '0' ? false : undefined;
};

/** Các tham số lọc "mới" trên thanh địa chỉ: `thv` (lặp lại nhiều lần), `mo` (việc còn dở), `tra` (đã trả), `ky` (mốc nhanh). */
export function parseExtraView(sp: Readonly<Record<string, string | string[] | undefined>>): {
  thv: string[];
  open?: boolean;
  returned?: boolean;
  ky?: string;
  fa?: string;
  fb?: string;
} {
  const raw = sp.thv === undefined ? [] : Array.isArray(sp.thv) ? sp.thv : sp.thv.split(',');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const thv = [...new Set(raw.map((x) => x.trim()).filter((x) => uuid.test(x)))].slice(0, 20);
  const ky = Array.isArray(sp.ky) ? sp.ky[0] : sp.ky;
  const text = (v: string | string[] | undefined): string | undefined => {
    const x = (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 200);
    return x || undefined;
  };
  return {
    thv,
    open: triState(sp.mo),
    returned: triState(sp.tra),
    ky: ky || undefined,
    fa: text(sp.fa),
    fb: text(sp.fb),
  };
}

/** Cách nhìn -> chuỗi truy vấn của trang (mọi bộ lọc, kể cả trang `p`). `drop` bỏ một vài khóa (chip ×). */
export function viewToQuery(
  v: DmsView,
  opts: { page?: number; drop?: readonly string[] } = {},
): URLSearchParams {
  const drop = new Set(opts.drop ?? []);
  const qs = new URLSearchParams();
  const put = (k: string, val: string | undefined) => {
    if (val !== undefined && val !== '' && !drop.has(k)) qs.set(k, val);
  };
  if (v.filter !== 'chinh-thuc') put('loc', v.filter);
  put('q', v.q);
  if (v.year !== undefined && !drop.has('year')) qs.set('year', String(v.year));
  put('nt', v.creator);
  put('lt', v.kind);
  put('dv', v.branch);
  if (!drop.has('thv')) for (const t of v.thv ?? []) qs.append('thv', t);
  if (v.open !== undefined) put('mo', v.open ? '1' : '0');
  if (v.returned !== undefined) put('tra', v.returned ? '1' : '0');
  put('fa', v.fa);
  put('fb', v.fb);
  if (v.ky) put('ky', v.ky);
  else {
    put('tu', v.tu);
    put('den', v.den);
  }
  if (opts.page && opts.page > 1) qs.set('p', String(opts.page));
  return qs;
}

export const viewHref = (
  base: string,
  v: DmsView,
  opts: { page?: number; drop?: readonly string[] } = {},
): string => {
  const s = viewToQuery(v, opts).toString();
  return s ? `${base}?${s}` : base;
};

/** Cách nhìn -> tham số lưu. Năm chỉ lưu khi người dùng đã chọn năm cụ thể (không ghim năm mặc định). */
export function viewToSavedParams(v: DmsView): DmsSavedParams {
  const base = filterToParams(v.filter, v.year ?? 0);
  const out: Record<string, string | number | boolean | readonly string[]> = {
    status: base.status,
  };
  if (base.scan) out.scan = base.scan;
  if (v.year && base.year !== undefined && !v.ky && !v.tu && !v.den) out.year = v.year;
  if (v.q?.trim()) out.q = v.q.trim();
  if (v.creator) out.creator = v.creator;
  if (v.kind) out.kind = v.kind;
  if (v.branch) out.branch = v.branch;
  // API nhận thv là chuỗi cách nhau dấu phẩy và boolean dạng chữ ('true'/'false'), nên lưu đúng dạng đó.
  if (v.thv && v.thv.length > 0) out.thv = v.thv.join(',');
  if (v.open !== undefined) out.open = String(v.open);
  if (v.returned !== undefined) out.returned = String(v.returned);
  if (v.fa) out.fa = v.fa;
  if (v.fb) out.fb = v.fb;
  if (v.ky) out.ky = v.ky;
  else {
    if (v.tu) out.tu = v.tu;
    if (v.den) out.den = v.den;
  }
  return out;
}

const asText = (x: unknown): string | undefined =>
  typeof x === 'string' ? x : Array.isArray(x) ? x.join(',') : undefined;
const asBool = (x: unknown): boolean | undefined =>
  x === true || x === 'true' || x === '1'
    ? true
    : x === false || x === 'false' || x === '0'
      ? false
      : undefined;

/** Tham số lưu -> đường dẫn trang danh sách (`base` + chuỗi truy vấn). Hiểu cả giá trị cũ (chưa có thv/open/returned/ky). */
export function savedParamsToHref(base: string, p: DmsSavedParams): string {
  let loc: DmsFilter = 'chinh-thuc';
  if (p.status === 'DRAFT') loc = 'nhap';
  else if (p.status === 'CANCELLED') loc = 'da-huy';
  else if (p.scan === 'missing') loc = 'thieu-scan';
  else if (p.scan === 'complete') loc = 'du-scan';
  const year = typeof p.year === 'number' ? p.year : Number(p.year);
  return viewHref(base, {
    filter: loc,
    q: typeof p.q === 'string' ? p.q : undefined,
    year: p.year !== undefined && Number.isFinite(year) ? year : undefined,
    creator: typeof p.creator === 'string' ? p.creator : undefined,
    kind: typeof p.kind === 'string' ? p.kind : undefined,
    branch: typeof p.branch === 'string' ? p.branch : undefined,
    thv: asText(p.thv)?.split(',').filter(Boolean),
    open: asBool(p.open),
    returned: asBool(p.returned),
    fa: typeof p.fa === 'string' ? p.fa : undefined,
    fb: typeof p.fb === 'string' ? p.fb : undefined,
    ky: asText(p.ky),
    tu: asText(p.tu),
    den: asText(p.den),
  });
}
