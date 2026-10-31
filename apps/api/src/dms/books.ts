/**
 * Định nghĩa 4 sổ nghiệp vụ theo mẫu TP-THV-S-01/02/04/05 (Thông tư 08/2026/TT-BTP), đúng tiêu đề và thứ tự cột của Figma
 * "Xuất sổ". Giá trị mỗi cột lấy từ thuộc tính do người nhập điền (khoá `key`); STT do hệ thống cấp, không nằm trong thuộc tính.
 * Hệ thống KHÔNG tự cấp số văn bản pháp lý (số vi bằng, số quyết định...): đó là dữ liệu người nhập.
 */
export type BookCode = 'S-01' | 'S-02' | 'S-04' | 'S-05';
export type VanThuCode = 'VT-DEN' | 'VT-DI' | 'VT-NB';
export type BookSource = 'case' | 'document';

export interface BookColumn {
  /** Số cột theo mẫu (STT là cột 1). */
  readonly no: number;
  readonly heading: string;
  /** Khoá trong thuộc tính của hồ sơ/tài liệu. `stt` là cột do hệ thống cấp. */
  readonly key: string;
  /** Tiêu đề nhóm cột (hàng tiêu đề trên) nếu có. */
  readonly group?: string;
  /** Cột đánh dấu ✓ (có giá trị là ✓). */
  readonly tick?: boolean;
}

export interface BookSpec {
  readonly code: BookCode | VanThuCode;
  readonly domain: 'tongdat' | 'vibang' | 'xacminh' | 'tochuc' | 'vtden' | 'vtdi' | 'vtnb';
  readonly form: string;
  readonly title: string;
  /** Nguồn thuộc tính của một dòng sổ: S-01 là tài liệu (giấy tờ), còn lại là hồ sơ. */
  readonly source: BookSource;
  readonly columns: readonly BookColumn[];
}

const stt: BookColumn = { no: 1, heading: 'STT', key: 'stt' };

export const BOOKS: Readonly<Record<BookCode, BookSpec>> = {
  'S-01': {
    code: 'S-01',
    domain: 'tongdat',
    form: 'TP-THV-S-01',
    title: 'SỔ THEO DÕI VIỆC TỐNG ĐẠT',
    source: 'document',
    columns: [
      stt,
      { no: 2, heading: 'LOẠI VĂN BẢN', key: 'loai_van_ban' },
      { no: 3, heading: 'SỐ, NGÀY, THÁNG, NĂM VĂN BẢN CẦN TỐNG ĐẠT', key: 'so_ngay_van_ban' },
      {
        no: 4,
        heading: 'Tòa án',
        key: 'co_quan_toa_an',
        group: 'TÊN CƠ QUAN GIAO VĂN BẢN TỐNG ĐẠT',
        tick: true,
      },
      {
        no: 5,
        heading: 'Cơ quan THADS',
        key: 'co_quan_thads',
        group: 'TÊN CƠ QUAN GIAO VĂN BẢN TỐNG ĐẠT',
        tick: true,
      },
      {
        no: 6,
        heading: 'Cơ quan kiểm sát',
        key: 'co_quan_kiem_sat',
        group: 'TÊN CƠ QUAN GIAO VĂN BẢN TỐNG ĐẠT',
        tick: true,
      },
      { no: 7, heading: 'NGÀY TỐNG ĐẠT', key: 'ngay_tong_dat' },
      { no: 8, heading: 'HÌNH THỨC TỐNG ĐẠT ĐÃ THỰC HIỆN', key: 'hinh_thuc_tong_dat' },
      { no: 9, heading: 'THỪA HÀNH VIÊN THỰC HIỆN (họ tên, số thẻ)', key: 'thua_hanh_vien' },
      { no: 10, heading: 'GHI CHÚ', key: 'ghi_chu' },
    ],
  },
  'S-02': {
    code: 'S-02',
    domain: 'vibang',
    form: 'TP-THV-S-02',
    title: 'SỔ THEO DÕI VIỆC LẬP VI BẰNG',
    source: 'case',
    columns: [
      stt,
      {
        no: 2,
        heading: 'NGƯỜI YÊU CẦU LẬP VI BẰNG (Ghi rõ họ tên, địa chỉ)',
        key: 'nguoi_yeu_cau',
      },
      { no: 3, heading: 'NỘI DUNG YÊU CẦU LẬP VI BẰNG', key: 'noi_dung_yeu_cau' },
      { no: 4, heading: 'SỐ, NGÀY, THÁNG, NĂM CỦA VI BẰNG', key: 'so_ngay_vi_bang' },
      {
        no: 5,
        heading: 'ĐỊA CHỈ NƠI LẬP VI BẰNG (xã/phường/đặc khu, tỉnh/thành phố)',
        key: 'dia_chi_noi_lap',
      },
      {
        no: 6,
        heading: 'THỪA HÀNH VIÊN LẬP VI BẰNG (Ghi rõ họ tên, số thẻ)',
        key: 'thua_hanh_vien',
      },
      { no: 7, heading: 'GHI CHÚ', key: 'ghi_chu' },
    ],
  },
  'S-04': {
    code: 'S-04',
    domain: 'xacminh',
    form: 'TP-THV-S-04',
    title: 'SỔ THEO DÕI VIỆC XÁC MINH ĐIỀU KIỆN THI HÀNH ÁN',
    source: 'case',
    columns: [
      stt,
      { no: 2, heading: 'HỢP ĐỒNG DỊCH VỤ (số, ngày, tháng, năm)', key: 'hop_dong_dich_vu' },
      {
        no: 3,
        heading: 'QUYẾT ĐỊNH VỀ THI HÀNH ÁN (số, ngày, tháng, năm)',
        key: 'quyet_dinh_thi_hanh_an',
      },
      { no: 4, heading: 'BẢN ÁN, QUYẾT ĐỊNH CỦA TÒA ÁN', key: 'ban_an_quyet_dinh_toa_an' },
      { no: 5, heading: 'QUYẾT ĐỊNH XÁC MINH (số, ngày)', key: 'quyet_dinh_xac_minh' },
      { no: 6, heading: 'NGƯỜI YÊU CẦU THI HÀNH ÁN', key: 'nguoi_yeu_cau_thi_hanh_an' },
      { no: 7, heading: 'NGƯỜI PHẢI THI HÀNH ÁN', key: 'nguoi_phai_thi_hanh_an' },
      { no: 8, heading: 'NỘI DUNG XÁC MINH', key: 'noi_dung_xac_minh' },
      { no: 9, heading: 'KẾT QUẢ XÁC MINH', key: 'ket_qua_xac_minh' },
      { no: 10, heading: 'THỪA HÀNH VIÊN THỰC HIỆN', key: 'thua_hanh_vien' },
      { no: 11, heading: 'GHI CHÚ', key: 'ghi_chu' },
    ],
  },
  'S-05': {
    code: 'S-05',
    domain: 'tochuc',
    form: 'TP-THV-S-05',
    title: 'SỔ THEO DÕI VIỆC THI HÀNH ÁN',
    source: 'case',
    columns: [
      stt,
      { no: 2, heading: 'HỢP ĐỒNG DỊCH VỤ (số, ngày, tháng, năm)', key: 'hop_dong_dich_vu' },
      {
        no: 3,
        heading: 'Số, ngày, tháng, năm',
        key: 'quyet_dinh_thi_hanh_an',
        group: 'QUYẾT ĐỊNH VỀ THI HÀNH ÁN',
      },
      {
        no: 4,
        heading: 'Sửa đổi, bổ sung',
        key: 'quyet_dinh_sua_doi_bo_sung',
        group: 'QUYẾT ĐỊNH VỀ THI HÀNH ÁN',
      },
      { no: 5, heading: 'Thu hồi', key: 'quyet_dinh_thu_hoi', group: 'QUYẾT ĐỊNH VỀ THI HÀNH ÁN' },
      { no: 6, heading: 'BẢN ÁN, QUYẾT ĐỊNH CỦA TÒA ÁN', key: 'ban_an_quyet_dinh_toa_an' },
      {
        no: 7,
        heading: 'BÊN PHẢI THI HÀNH ÁN (họ tên/tên gọi, địa chỉ)',
        key: 'ben_phai_thi_hanh_an',
      },
      {
        no: 8,
        heading: 'BÊN ĐƯỢC THI HÀNH ÁN (họ tên/tên gọi, địa chỉ)',
        key: 'ben_duoc_thi_hanh_an',
      },
      {
        no: 9,
        heading: 'CÁC KHOẢN PHẢI THI HÀNH ÁN (theo hợp đồng)',
        key: 'cac_khoan_phai_thi_hanh_an',
      },
      { no: 10, heading: 'KẾT QUẢ THI HÀNH ÁN', key: 'ket_qua_thi_hanh_an' },
      { no: 11, heading: 'THỪA HÀNH VIÊN THỰC HIỆN (họ tên, số thẻ)', key: 'thua_hanh_vien' },
      { no: 12, heading: 'GHI CHÚ', key: 'ghi_chu' },
    ],
  },
};

export const BOOK_CODES = Object.keys(BOOKS) as BookCode[];

/**
 * Ba sổ Văn thư (Figma "Văn thư"). `title` là cột "Tên loại và trích yếu nội dung" (lấy từ tiêu đề hồ sơ). Chỉ "Số đến" (sổ đến) và
 * "STT" (sổ đi, nội bộ) do hệ thống cấp; số/ký hiệu văn bản là dữ liệu người nhập. Cột Scan chỉ có ở giao diện, không vào CSV.
 */
const vt = (
  code: VanThuCode,
  domain: BookSpec['domain'],
  title: string,
  columns: BookColumn[],
): BookSpec => ({
  code,
  domain,
  form: code,
  title,
  source: 'case',
  columns,
});
const col = (no: number, heading: string, key: string): BookColumn => ({ no, heading, key });

export const VANTHU_BOOKS: Readonly<Record<VanThuCode, BookSpec>> = {
  'VT-DEN': vt('VT-DEN', 'vtden', 'SỔ VĂN BẢN ĐẾN', [
    col(1, 'Ngày đến', 'ngay_den'),
    col(2, 'Số đến', 'stt'),
    col(3, 'Cơ quan ban hành', 'co_quan_ban_hanh'),
    col(4, 'Số, ký hiệu văn bản', 'so_ky_hieu'),
    col(5, 'Ngày, tháng văn bản', 'ngay_van_ban'),
    col(6, 'Tên loại và trích yếu nội dung', 'title'),
    col(7, 'Đơn vị, người nhận', 'don_vi_nguoi_nhan'),
    col(8, 'Ký nhận', 'ky_nhan'),
    col(9, 'Ghi chú', 'ghi_chu'),
  ]),
  'VT-DI': vt('VT-DI', 'vtdi', 'SỔ VĂN BẢN ĐI', [
    col(1, 'STT', 'stt'),
    col(2, 'Số, ký hiệu văn bản', 'so_ky_hieu'),
    col(3, 'Ngày, tháng văn bản', 'ngay_van_ban'),
    col(4, 'Tên loại và trích yếu nội dung', 'title'),
    col(5, 'Người ký', 'nguoi_ky'),
    col(6, 'Nơi nhận văn bản', 'noi_nhan'),
    col(7, 'Số lượng bản (nơi nhận + lưu)', 'so_luong_ban'),
    col(8, 'Ngày chuyển giao', 'ngay_chuyen_giao'),
    col(9, 'Ghi chú', 'ghi_chu'),
  ]),
  'VT-NB': vt('VT-NB', 'vtnb', 'SỔ VĂN BẢN NỘI BỘ', [
    col(1, 'STT', 'stt'),
    col(2, 'Số, ký hiệu văn bản', 'so_ky_hieu'),
    col(3, 'Ngày, tháng văn bản', 'ngay_van_ban'),
    col(4, 'Tên loại và trích yếu nội dung', 'title'),
    col(5, 'Người ký', 'nguoi_ky'),
    col(6, 'Nơi nhận văn bản', 'noi_nhan'),
    col(7, 'Số lượng bản', 'so_luong_ban'),
    col(8, 'Ghi chú', 'ghi_chu'),
  ]),
};
export const VANTHU_CODES = Object.keys(VANTHU_BOOKS) as VanThuCode[];

export const bookOf = (code: string): BookSpec | undefined =>
  BOOKS[code as BookCode] ?? VANTHU_BOOKS[code as VanThuCode];
export const bookForDomain = (domain: string): BookSpec | undefined =>
  [...BOOK_CODES.map((c) => BOOKS[c]), ...VANTHU_CODES.map((c) => VANTHU_BOOKS[c])].find(
    (b) => b.domain === domain,
  );

export interface BookRowRaw {
  readonly stt: number;
  readonly case_title: string;
  readonly case_attributes: Record<string, unknown>;
  readonly doc_kind: string | null;
  readonly doc_attributes: Record<string, unknown> | null;
}

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/** Một dòng sổ dạng chữ theo đúng thứ tự cột. Ô trống để trống (không suy đoán, không điền hộ). */
export function bookCells(spec: BookSpec, row: BookRowRaw): string[] {
  const attrs = spec.source === 'document' ? (row.doc_attributes ?? {}) : row.case_attributes;
  return spec.columns.map((c) => {
    if (c.key === 'stt') return String(row.stt);
    if (c.key === 'title') return text(row.case_title);
    // Loại văn bản của S-01 mặc định lấy từ loại tài liệu nếu người nhập chưa ghi riêng.
    const v = text(attrs[c.key]) || (c.key === 'loai_van_ban' ? text(row.doc_kind) : '');
    return c.tick ? (v === '' ? '' : '✓') : v;
  });
}

/** CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt). Chống chèn công thức: ô bắt đầu bằng = + - @ được thêm dấu nháy. */
export function toCsv(spec: BookSpec, rows: readonly BookRowRaw[]): string {
  const esc = (s: string) => {
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  const lines = [spec.columns.map((c) => esc(c.heading)).join(',')];
  for (const r of rows) lines.push(bookCells(spec, r).map(esc).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
