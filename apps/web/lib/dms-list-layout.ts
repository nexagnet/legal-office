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
  readonly special?: 'stt' | 'scan' | 'scanlite' | 'number' | 'actions' | 'phone' | 'returned';
  /** Một ô của hàng hồ sơ: `get` đọc dòng sổ đầu tiên, `all` là mọi dòng sổ của hồ sơ (hồ sơ Tống đạt cũ có thể có nhiều dòng). */
  readonly cell?: (get: Getter, all: readonly Getter[]) => ListCellText;
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

/** Cột đánh dấu của sổ: có giá trị thì hiện ✓. */
const tick =
  (key: string) =>
  (get: Getter): ListCellText => ({ primary: get(key) ? '✓' : '' });
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
    { id: 'loai', head: 'Loại văn bản', width: 90, cell: text('loai_van_ban') },
    {
      id: 'so_ngay',
      head: 'Số, ngày, tháng, năm văn bản cần tống đạt',
      width: 110,
      cell: numberThenDate('so_ngay_van_ban'),
    },
    {
      id: 'toa_an',
      group: 'Cơ quan giao văn bản tống đạt',
      head: 'Tòa án',
      width: 80,
      cell: tick('co_quan_toa_an'),
    },
    {
      id: 'thads',
      group: 'Cơ quan giao văn bản tống đạt',
      head: 'Cơ quan THADS',
      width: 80,
      cell: tick('co_quan_thads'),
    },
    {
      id: 'ksat',
      group: 'Cơ quan giao văn bản tống đạt',
      head: 'Cơ quan kiểm sát',
      width: 80,
      cell: tick('co_quan_kiem_sat'),
    },
    { id: 'ngay', head: 'Ngày tống đạt', width: 90, cell: text('ngay_tong_dat') },
    { id: 'hinh_thuc', head: 'Hình thức tống đạt', width: 90, cell: text('hinh_thuc_tong_dat') },
    {
      id: 'thv',
      head: 'THV thực hiện (họ tên, số thẻ)',
      width: 110,
      cell: nameThenRest('thua_hanh_vien'),
    },
    { id: 'ghi_chu', head: 'Ghi chú', width: 80, cell: text('ghi_chu') },
    { ...SCAN, head: 'Tài liệu · Scan', width: 90 },
    ACTIONS,
  ],
};

/** Cột SĐT khách hàng (N1): hiện ở cả 4 nghiệp vụ, không nằm trong sổ nên không có ở `LAYOUTS` theo cột sổ. */
const PHONE: ListColumn = { id: 'phone', head: 'SĐT khách hàng', width: 110, special: 'phone' };
/** Cột ô tích "Đã trả kết quả" (N2): chỉ là dấu hiệu nhìn. */
const RETURNED: ListColumn = { id: 'returned', head: 'Đã trả KQ', width: 80, special: 'returned' };

/**
 * Nhãn của ô tích sau ghi sổ. Riêng Tổ chức THA ô này là "Đã có biên bản N-08" (không còn dựa vào loại tài liệu; chủ dự án
 * chốt 13/11/2026), các nghiệp vụ khác là "Đã trả kết quả". Cùng một cờ trong DB (`dms_case_returned`).
 */
export function returnedLabels(domainCode: string): {
  readonly head: string;
  readonly title: string;
  readonly yes: string;
  readonly no: string;
  readonly aria: string;
} {
  return domainCode === 'tochuc'
    ? {
        head: 'Đã có N-08',
        title: 'Đã có biên bản N-08',
        yes: 'Đã có N-08',
        no: 'Chưa có N-08',
        aria: 'Đã có biên bản N-08 của hồ sơ',
      }
    : {
        head: 'Đã trả KQ',
        title: 'Đã trả kết quả',
        yes: 'Đã trả',
        no: 'Chưa trả',
        aria: 'Đã trả kết quả hồ sơ',
      };
}

/**
 * Bố cục danh sách một nghiệp vụ: các cột sổ cốt lõi của Figma, thêm SĐT khách hàng ngay sau cột STT · Mã hồ sơ và
 * ô "Đã trả KQ" ngay trước cột Tài liệu · Scan.
 */
export function listLayoutFor(domainCode: string): readonly ListColumn[] | undefined {
  const base = LAYOUTS[domainCode];
  if (!base) return undefined;
  const scanAt = base.findIndex((c) => c.special === 'scan');
  return [
    base[0]!,
    PHONE,
    ...base.slice(1, scanAt < 0 ? base.length : scanAt),
    domainCode === 'tochuc' ? { ...RETURNED, head: returnedLabels(domainCode).head } : RETURNED,
    ...(scanAt < 0 ? [] : base.slice(scanAt)),
  ];
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

/** Hàm lấy giá trị một cột sổ theo khóa, từ dòng sổ đầu tiên của hồ sơ (rỗng nếu không có). */
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

/** Dải số thứ tự của hồ sơ: "10–13" hoặc "6"; "—" khi chưa có dòng sổ. */
export function sttRange(stts: readonly number[]): string {
  if (stts.length === 0) return '—';
  const lo = Math.min(...stts);
  const hi = Math.max(...stts);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}
