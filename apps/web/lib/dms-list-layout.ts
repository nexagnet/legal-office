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
  readonly special?: 'stt' | 'scan' | 'actions';
  readonly cell?: (get: (key: string) => string) => ListCellText;
}

const text =
  (key: string) =>
  (get: (k: string) => string): ListCellText => ({ primary: get(key) });
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
      cell: text('nguoi_yeu_cau'),
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
      cell: text('so_ngay_vi_bang'),
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
      cell: text('thua_hanh_vien'),
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
    { id: 'thv', head: 'Thừa hành viên', width: 110, cell: text('thua_hanh_vien') },
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
    { id: 'thv', head: 'Thừa hành viên', width: 110, cell: text('thua_hanh_vien') },
    { ...SCAN, head: 'Tài liệu · Scan' },
    ACTIONS,
  ],
  tongdat: [
    { ...STT, width: 110 },
    { id: 'loai', head: 'Loại văn bản', width: 100, cell: text('loai_van_ban') },
    {
      id: 'so_ngay',
      head: 'Số, ngày, tháng, năm văn bản cần tống đạt',
      width: 140,
      cell: text('so_ngay_van_ban'),
    },
    { id: 'toa_an', head: 'Tòa án', width: 70, cell: text('co_quan_toa_an') },
    { id: 'thads', head: 'Cơ quan THADS', width: 70, cell: text('co_quan_thads') },
    { id: 'ksat', head: 'Cơ quan kiểm sát', width: 70, cell: text('co_quan_kiem_sat') },
    { id: 'ngay', head: 'Ngày tống đạt', width: 90, cell: text('ngay_tong_dat') },
    { id: 'hinh_thuc', head: 'Hình thức tống đạt', width: 100, cell: text('hinh_thuc_tong_dat') },
    {
      id: 'thv',
      head: 'THV thực hiện (họ tên, số thẻ)',
      width: 100,
      cell: text('thua_hanh_vien'),
    },
    { id: 'ghi_chu', head: 'Ghi chú', width: 60, cell: text('ghi_chu') },
    { ...SCAN, head: 'Tài liệu · Scan', width: 100 },
    ACTIONS,
  ],
};

export function listLayoutFor(domainCode: string): readonly ListColumn[] | undefined {
  return LAYOUTS[domainCode];
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
