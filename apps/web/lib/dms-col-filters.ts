/**
 * Lọc theo cột của danh sách 4 nghiệp vụ (migration 0131). Phần thuần: kiểu dữ liệu, đọc/ghi tham số URL `cl`, nhãn chip,
 * và bảng "cột nào của danh sách lọc theo ô sổ nào". Máy chủ đối chiếu lại khóa cột và dựng SQL an toàn.
 */
export interface ColFilter {
  /** Chữ chứa (không phân biệt hoa thường và dấu). */
  readonly c?: string;
  /** Chọn nhiều giá trị gốc. */
  readonly in?: readonly string[];
  /** Khoảng ngày (YYYY-MM-DD), tính cả hai đầu. */
  readonly d?: { readonly from?: string; readonly to?: string };
  /** Có (true) / không (false) giá trị. */
  readonly b?: boolean;
}
export type ColFilters = Readonly<Record<string, ColFilter>>;

export type ColFieldType = 'text' | 'date' | 'choice' | 'bool';
export interface ColField {
  /** Khóa thuộc tính sổ (hoặc `stt`) trong chỉ mục. */
  readonly key: string;
  readonly label: string;
  readonly type: ColFieldType;
}

export const MAX_COLS = 12;
const KEY = /^[a-z0-9_]{1,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const clean = (raw: unknown): ColFilter | undefined => {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const out: { c?: string; in?: string[]; d?: { from?: string; to?: string }; b?: boolean } = {};
  if (typeof r.c === 'string' && r.c.trim()) out.c = r.c.trim().slice(0, 200);
  if (Array.isArray(r.in)) {
    const v = r.in.filter((x): x is string => typeof x === 'string' && x !== '').slice(0, 50);
    if (v.length > 0) out.in = v.map((x) => x.slice(0, 300));
  }
  if (typeof r.d === 'object' && r.d !== null) {
    const d = r.d as Record<string, unknown>;
    const from = typeof d.from === 'string' && DAY.test(d.from) ? d.from : undefined;
    const to = typeof d.to === 'string' && DAY.test(d.to) ? d.to : undefined;
    if (from || to) out.d = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  }
  if (typeof r.b === 'boolean') out.b = r.b;
  return Object.keys(out).length > 0 ? out : undefined;
};

/** Đọc tham số `cl` (JSON) từ URL; bỏ mọi thứ sai dạng, tối đa 12 cột. */
export function parseCols(raw: string | string[] | undefined): ColFilters {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (!text || text.length > 4000) return {};
  try {
    const obj = JSON.parse(text) as unknown;
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
    const out: Record<string, ColFilter> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (Object.keys(out).length >= MAX_COLS) break;
      const f = KEY.test(k) ? clean(v) : undefined;
      if (f) out[k] = f;
    }
    return out;
  } catch {
    return {};
  }
}

/** Ghi thành chuỗi tham số (URL `cl`, bộ lọc đã lưu `cols`, API `cols`); không có cột nào thì undefined. */
export const colsToParam = (cols: ColFilters | undefined): string | undefined =>
  cols && Object.keys(cols).length > 0 ? JSON.stringify(cols) : undefined;

/** Đặt (hoặc bỏ, khi `f` rỗng) bộ lọc của một cột. */
export function withCol(
  cols: ColFilters | undefined,
  key: string,
  f: ColFilter | undefined,
): ColFilters {
  const { [key]: _old, ...rest } = cols ?? {};
  void _old;
  const next = f ? clean(f) : undefined;
  return next ? { ...rest, [key]: next } : rest;
}

const vnDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Nội dung chip "Đang lọc" của một ô sổ, ví dụ `Người yêu cầu: chứa "Ánh"`. */
export function colChipText(label: string, f: ColFilter): string {
  const parts: string[] = [];
  if (f.c) parts.push(`chứa "${f.c}"`);
  if (f.in) parts.push(f.in.length === 1 ? f.in[0]! : `${f.in.length} giá trị`);
  if (f.d)
    parts.push(
      f.d.from && f.d.to
        ? `${vnDay(f.d.from)} – ${vnDay(f.d.to)}`
        : f.d.from
          ? `từ ${vnDay(f.d.from)}`
          : `đến ${vnDay(f.d.to!)}`,
    );
  if (f.b !== undefined) parts.push(f.b ? 'có' : 'không có');
  return `${label}: ${parts.join(', ')}`;
}

const t = (key: string, label: string): ColField => ({ key, label, type: 'text' });
const choice = (key: string, label: string): ColField => ({ key, label, type: 'choice' });
const date = (key: string, label: string): ColField => ({ key, label, type: 'date' });
const bool = (key: string, label: string): ColField => ({ key, label, type: 'bool' });

/**
 * Cột của danh sách (theo `id` trong `listLayoutFor`) -> các ô sổ lọc được. Cột ghép hai ô (người yêu cầu / người phải THA...)
 * có hai ô lọc trong cùng một popover. Cột không có ở đây (Tài liệu · Scan, Đã trả KQ, thao tác) đã có bộ lọc riêng
 * hoặc không lọc theo cột.
 */
export const COLUMN_FILTERS: Readonly<
  Record<string, Readonly<Record<string, readonly ColField[]>>>
> = {
  vibang: {
    stt: [t('stt', 'Mã hồ sơ')],
    phone: [t('so_dien_thoai', 'SĐT khách hàng')],
    nguoi_yeu_cau: [t('nguoi_yeu_cau', 'Người yêu cầu')],
    noi_dung: [t('noi_dung_yeu_cau', 'Nội dung')],
    so_ngay: [t('so_ngay_vi_bang', 'Số, ngày vi bằng'), date('so_ngay_vi_bang', 'Ngày vi bằng')],
    dia_chi: [t('dia_chi_noi_lap', 'Địa chỉ')],
    thv: [t('thua_hanh_vien', 'Thừa hành viên')],
    ghi_chu: [t('ghi_chu', 'Ghi chú')],
  },
  tongdat: {
    stt: [t('stt', 'Mã hồ sơ')],
    phone: [t('so_dien_thoai', 'SĐT khách hàng')],
    loai: [choice('loai_van_ban', 'Loại văn bản')],
    so_ngay: [t('so_ngay_van_ban', 'Số, ngày văn bản'), date('so_ngay_van_ban', 'Ngày văn bản')],
    toa_an: [bool('co_quan_toa_an', 'Tòa án')],
    thads: [bool('co_quan_thads', 'Cơ quan THADS')],
    ksat: [bool('co_quan_kiem_sat', 'Cơ quan kiểm sát')],
    ngay: [date('ngay_tong_dat', 'Ngày tống đạt'), bool('ngay_tong_dat', 'Đã có ngày tống đạt')],
    hinh_thuc: [choice('hinh_thuc_tong_dat', 'Hình thức')],
    thv: [t('thua_hanh_vien', 'Thừa hành viên')],
    ghi_chu: [t('ghi_chu', 'Ghi chú')],
  },
  xacminh: {
    stt: [t('stt', 'Mã hồ sơ')],
    phone: [t('so_dien_thoai', 'SĐT khách hàng')],
    nguoi: [
      t('nguoi_yeu_cau_thi_hanh_an', 'Người yêu cầu THA'),
      t('nguoi_phai_thi_hanh_an', 'Người phải THA'),
    ],
    noi_dung: [t('noi_dung_xac_minh', 'Nội dung xác minh')],
    hd_qd: [t('hop_dong_dich_vu', 'Hợp đồng dịch vụ'), t('quyet_dinh_xac_minh', 'QĐ xác minh')],
    ket_qua: [choice('ket_qua_xac_minh', 'Kết quả xác minh')],
    thv: [t('thua_hanh_vien', 'Thừa hành viên')],
  },
  tochuc: {
    stt: [t('stt', 'Mã hồ sơ')],
    phone: [t('so_dien_thoai', 'SĐT khách hàng')],
    ben: [t('ben_phai_thi_hanh_an', 'Bên phải THA'), t('ben_duoc_thi_hanh_an', 'Bên được THA')],
    khoan: [t('cac_khoan_phai_thi_hanh_an', 'Các khoản')],
    hd_qd: [
      t('hop_dong_dich_vu', 'Hợp đồng dịch vụ'),
      t('quyet_dinh_thi_hanh_an', 'QĐ thi hành án'),
    ],
    ket_qua: [choice('ket_qua_thi_hanh_an', 'Kết quả THA')],
    thv: [t('thua_hanh_vien', 'Thừa hành viên')],
  },
};

/** Nhãn của một ô sổ lọc được (dùng cho chip), theo nghiệp vụ. */
export function colLabel(domain: string, key: string): string {
  for (const fields of Object.values(COLUMN_FILTERS[domain] ?? {}))
    for (const f of fields) if (f.key === key) return f.label;
  return key === 'stt' ? 'Mã hồ sơ' : key;
}
