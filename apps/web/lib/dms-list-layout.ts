import type { DmsBookRow, DmsBookSpec } from './dms';
import { bookCell } from './dms';

/**
 * Bố cục cột của bảng danh sách bốn nghiệp vụ theo Figma "DMS v2 · Danh sách" (352:964, 352:1415, 352:1613, 352:1811).
 * Mỗi cột có tiêu đề + độ rộng (px, tổng 1144 ở màn 1440) và hàm lấy nội dung từ dòng sổ của hồ sơ.
 * Danh sách chỉ hiện phần cốt lõi của sổ; các cột còn lại nằm trong chi tiết hồ sơ (đúng lời Figma).
 */
export interface ListCellText {
  readonly primary: string;
  /** Dòng phụ nhỏ, mờ (vd. địa chỉ dưới tên người). */
  readonly secondary?: string;
}

export interface ListColumn {
  readonly id: string;
  readonly head: string;
  readonly width: number;
  /** Cột đặc biệt do bảng tự vẽ. */
  readonly special?: 'stt' | 'scan' | 'scanlite' | 'number' | 'actions';
  /** Một ô của hàng hồ sơ: `get` đọc dòng sổ đầu tiên, `all` là mọi dòng sổ của hồ sơ (Tống đạt: mỗi giấy tờ một dòng). */
  readonly cell?: (get: Getter, all: readonly Getter[]) => ListCellText;
  /** Khoá cột đánh dấu: hàng hồ sơ hiện số giấy tờ có dấu, dòng sổ con hiện ✓. */
  readonly tick?: string;
  /** Nhãn gộp trên đầu một nhóm cột liên tiếp (Tống đạt: "Cơ quan giao văn bản tống đạt"). */
  readonly group?: string;
}

export type Getter = (key: string) => string;

const text =
  (key: string) =>
  (get: Getter): ListCellText => ({ primary: get(key) });

/** "Cty CP Hòa Phát, 12 Lê Duẩn, Hà Nội": tên ở dòng chính, phần còn lại (địa chỉ, số thẻ) ở dòng phụ xám (Figma). */
const nameThenRest =
  (key: string) =>
  (get: Getter): ListCellText => {
    const v = get(key);
    const i = v.indexOf(', ');
    return i > 0 ? { primary: v.slice(0, i), secondary: v.slice(i + 2) } : { primary: v };
  };

/** "Số 42 ngày 24/10/2026": số ở dòng chính, ngày ở dòng phụ (Figma); không tách được thì giữ nguyên một dòng. */
const numberThenDate =
  (key: string) =>
  (get: Getter): ListCellText => {
    const v = get(key);
    const m = /^(.*?)[,;]?\s+ngày\s+(.+)$/i.exec(v);
    return m && m[1] ? { primary: m[1], secondary: m[2]! } : { primary: v };
  };

const distinct = (all: readonly Getter[], key: string): string[] => [
  ...new Set(all.map((g) => g(key)).filter(Boolean)),
];

/** "Quyết định THA, giấy triệu tập +2": hai giá trị đầu, phần còn lại gộp thành +N. */
const kinds =
  (key: string) =>
  (_get: Getter, all: readonly Getter[]): ListCellText => {
    const v = distinct(all, key);
    return { primary: v.slice(0, 2).join(', ') + (v.length > 2 ? ` +${v.length - 2}` : '') };
  };

/** Giá trị đầu tiên + "(+N)" cho N giấy tờ còn lại. */
const firstPlus =
  (key: string) =>
  (get: Getter, all: readonly Getter[]): ListCellText => ({
    primary: get(key) && all.length > 1 ? `${get(key)} (+${all.length - 1})` : get(key),
  });

/** Số giấy tờ có đánh dấu ở cột (Tòa án, Cơ quan THADS, Cơ quan kiểm sát). */
const tickCount =
  (key: string) =>
  (_get: Getter, all: readonly Getter[]): ListCellText => ({
    primary: String(all.filter((g) => g(key) !== '').length),
  });

const joined =
  (key: string) =>
  (_get: Getter, all: readonly Getter[]): ListCellText => ({
    primary: distinct(all, key).join(', '),
  });

const DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
/** "15–18/10/2026" khi cùng tháng năm; nếu có giấy tờ chưa tống đạt thì kèm "(N chưa tống đạt)". */
export function servedRange(values: readonly string[]): string {
  const done = values.filter(Boolean);
  const open = values.length - done.length;
  if (done.length === 0) return '';
  const m = done.map((v) => DMY.exec(v));
  let text: string;
  if (m.every(Boolean)) {
    const p = (m as RegExpExecArray[]).map((x) => ({ d: +x[1]!, m: x[2]!, y: x[3]! }));
    const sameMonth = p.every((x) => x.m === p[0]!.m && x.y === p[0]!.y);
    const days = p.map((x) => x.d);
    const lo = Math.min(...days);
    const hi = Math.max(...days);
    text = sameMonth
      ? lo === hi
        ? `${lo}/${p[0]!.m}/${p[0]!.y}`
        : `${lo}–${hi}/${p[0]!.m}/${p[0]!.y}`
      : [...new Set(done)].join(', ');
  } else text = [...new Set(done)].join(', ');
  return open > 0 ? `${text} (${open} chưa tống đạt)` : text;
}
const withPrefix = (prefix: string, value: string): string =>
  value && !new RegExp(`^(${prefix}|hợp đồng|quyết định)`, 'i').test(value)
    ? `${prefix} ${value}`
    : value;

const STT: ListColumn = { id: 'stt', head: 'STT · Mã hồ sơ', width: 130, special: 'stt' };
const SCAN: ListColumn = { id: 'scan', head: 'Tài liệu · Bản scan', width: 120, special: 'scan' };
const ACTIONS: ListColumn = {
  id: 'actions',
  head: 'Xem · Tải scan',
  width: 134,
  special: 'actions',
};

const LAYOUTS: Readonly<Record<string, readonly ListColumn[]>> = {
  vibang: [
    STT,
    {
      id: 'nguoi_yeu_cau',
      head: 'Người yêu cầu lập vi bằng (họ tên, địa chỉ)',
      width: 180,
      cell: nameThenRest('nguoi_yeu_cau'),
    },
    {
      id: 'noi_dung',
      head: 'Nội dung yêu cầu lập vi bằng',
      width: 140,
      cell: text('noi_dung_yeu_cau'),
    },
    {
      id: 'so_ngay',
      head: 'Số, ngày, tháng, năm của vi bằng',
      width: 120,
      cell: numberThenDate('so_ngay_vi_bang'),
    },
    {
      id: 'dia_chi',
      head: 'Địa chỉ nơi lập vi bằng',
      width: 130,
      cell: text('dia_chi_noi_lap'),
    },
    {
      id: 'thv',
      head: 'Thừa hành viên lập vi bằng (họ tên, số thẻ)',
      width: 130,
      cell: nameThenRest('thua_hanh_vien'),
    },
    SCAN,
    { id: 'ghi_chu', head: 'Ghi chú', width: 60, cell: text('ghi_chu') },
    { ...ACTIONS, head: 'Xem · Tải scan' },
  ],
  xacminh: [
    { ...STT, width: 120 },
    {
      id: 'nguoi',
      head: 'Người yêu cầu / người phải THA',
      width: 190,
      cell: (g) => ({
        primary: g('nguoi_yeu_cau_thi_hanh_an') ? `Yêu cầu: ${g('nguoi_yeu_cau_thi_hanh_an')}` : '',
        secondary: g('nguoi_phai_thi_hanh_an') ? `Phải THA: ${g('nguoi_phai_thi_hanh_an')}` : '',
      }),
    },
    { id: 'noi_dung', head: 'Nội dung xác minh', width: 180, cell: text('noi_dung_xac_minh') },
    {
      id: 'hd_qd',
      head: 'Hợp đồng · QĐ xác minh',
      width: 180,
      cell: (g) => ({
        primary: withPrefix('HĐ', g('hop_dong_dich_vu')),
        secondary: withPrefix('QĐ', g('quyet_dinh_xac_minh')),
      }),
    },
    { id: 'ket_qua', head: 'Kết quả', width: 110, cell: text('ket_qua_xac_minh') },
    { id: 'thv', head: 'Thừa hành viên', width: 110, cell: nameThenRest('thua_hanh_vien') },
    { ...SCAN, head: 'Tài liệu · Scan' },
    ACTIONS,
  ],
  tochuc: [
    { ...STT, width: 120 },
    {
      id: 'ben',
      head: 'Bên phải THA / bên được THA',
      width: 200,
      cell: (g) => ({
        primary: g('ben_phai_thi_hanh_an') ? `Phải THA: ${g('ben_phai_thi_hanh_an')}` : '',
        secondary: g('ben_duoc_thi_hanh_an') ? `Được THA: ${g('ben_duoc_thi_hanh_an')}` : '',
      }),
    },
    {
      id: 'khoan',
      head: 'Các khoản phải THA',
      width: 160,
      cell: text('cac_khoan_phai_thi_hanh_an'),
    },
    {
      id: 'hd_qd',
      head: 'Hợp đồng · QĐ về THA',
      width: 200,
      cell: (g) => ({
        primary: withPrefix('HĐ', g('hop_dong_dich_vu')),
        secondary: withPrefix('QĐ', g('quyet_dinh_thi_hanh_an')),
      }),
    },
    { id: 'ket_qua', head: 'Kết quả', width: 100, cell: text('ket_qua_thi_hanh_an') },
    { id: 'thv', head: 'Thừa hành viên', width: 110, cell: nameThenRest('thua_hanh_vien') },
    { ...SCAN, head: 'Tài liệu · Scan' },
    ACTIONS,
  ],
  tongdat: [
    { ...STT, width: 110 },
    { id: 'loai', head: 'Loại văn bản', width: 100, cell: kinds('loai_van_ban') },
    {
      id: 'so_ngay',
      head: 'Số, ngày, tháng, năm văn bản cần tống đạt',
      width: 140,
      cell: firstPlus('so_ngay_van_ban'),
    },
    {
      id: 'toa_an',
      group: 'Cơ quan giao văn bản tống đạt',
      head: 'Tòa án',
      width: 70,
      tick: 'co_quan_toa_an',
      cell: tickCount('co_quan_toa_an'),
    },
    {
      id: 'thads',
      group: 'Cơ quan giao văn bản tống đạt',
      head: 'Cơ quan THADS',
      width: 70,
      tick: 'co_quan_thads',
      cell: tickCount('co_quan_thads'),
    },
    {
      id: 'ksat',
      group: 'Cơ quan giao văn bản tống đạt',
      head: 'Cơ quan kiểm sát',
      width: 70,
      tick: 'co_quan_kiem_sat',
      cell: tickCount('co_quan_kiem_sat'),
    },
    {
      id: 'ngay',
      head: 'Ngày tống đạt',
      width: 90,
      cell: (_g, all) => ({ primary: servedRange(all.map((g) => g('ngay_tong_dat'))) }),
    },
    {
      id: 'hinh_thuc',
      head: 'Hình thức tống đạt',
      width: 100,
      cell: joined('hinh_thuc_tong_dat'),
    },
    {
      id: 'thv',
      head: 'THV thực hiện (họ tên, số thẻ)',
      width: 100,
      cell: nameThenRest('thua_hanh_vien'),
    },
    { id: 'ghi_chu', head: 'Ghi chú', width: 60, cell: joined('ghi_chu') },
    { ...SCAN, head: 'Tài liệu · Scan', width: 100 },
    ACTIONS,
  ],
};

export function listLayoutFor(domainCode: string): readonly ListColumn[] | undefined {
  return LAYOUTS[domainCode];
}

const VT_WIDTH: Readonly<Record<string, number>> = {
  ngay_den: 95,
  stt: 70,
  co_quan_ban_hanh: 120,
  so_ky_hieu: 110,
  ngay_van_ban: 95,
  title: 190,
  don_vi_nguoi_nhan: 90,
  ky_nhan: 60,
  ghi_chu: 60,
};

/**
 * Bố cục ba sổ Văn thư theo Figma "Văn thư · Văn bản đến/đi/nội bộ" (352:2009, 352:2163, 352:2293): đúng thứ tự cột của sổ,
 * rồi cột Scan (huy hiệu số tệp) và cột Xem · Tải / Upload. Không có cột mã hồ sơ.
 */
export function vanThuLayout(spec: DmsBookSpec): readonly ListColumn[] {
  const cols: ListColumn[] = spec.columns.map((c) => ({
    id: c.key,
    head: c.key === 'stt' ? c.heading : c.heading,
    width: VT_WIDTH[c.key] ?? 100,
    special: c.key === 'stt' ? ('number' as const) : undefined,
    cell: text(c.key),
  }));
  const used = cols.reduce((n, c) => n + c.width, 0);
  return [
    ...cols,
    { id: 'scan', head: 'Scan', width: 100, special: 'scanlite' },
    { id: 'actions', head: '', width: Math.max(130, 1144 - used - 100), special: 'actions' },
  ];
}

/** Hàm lấy giá trị một cột sổ theo khoá, từ dòng sổ đầu tiên của hồ sơ (rỗng nếu không có). */
export function bookGetter(
  spec: DmsBookSpec,
  row: DmsBookRow | undefined,
): (key: string) => string {
  return (key) => {
    if (!row) return '';
    const col = spec.columns.find((c) => c.key === key);
    return col ? bookCell(spec, col, row) : '';
  };
}

/** Nghiệp vụ mà mỗi hồ sơ gồm nhiều dòng sổ (S-01: mỗi giấy tờ một dòng) nên danh sách có hàng mở rộng. */
export const EXPANDABLE_DOMAINS: ReadonlySet<string> = new Set(['tongdat']);

/** Dải số thứ tự của hồ sơ: "10–13" hoặc "6"; "—" khi chưa có dòng sổ. */
export function sttRange(stts: readonly number[]): string {
  if (stts.length === 0) return '—';
  const lo = Math.min(...stts);
  const hi = Math.max(...stts);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}
