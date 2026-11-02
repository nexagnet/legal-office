/**
 * Bố cục in của các sổ, chép từ tọa độ thật trong Phụ lục I Thông tư 08/2026/TT-BTP (trang ruột TP-THV-S-01/02/04/05,
 * khổ A4 ngang 842.04 × 595.32 pt) và từ ba sổ Excel của bộ phận Văn thư. Đơn vị là pt.
 *
 * Mẫu S-05 có 13 cột (nhóm "Quyết định về thi hành án" gồm 4 cột con), nhiều hơn định nghĩa 12 cột trong `books.ts`
 * (đang theo Figma). `columnIndex` nối cột mẫu với cột dữ liệu; cột mẫu chưa có nguồn dữ liệu là `null` và để trống,
 * không điền hộ.
 */
import type { BookCode, VanThuCode } from './books';

/** Dòng rỗng trong `lines` là khoảng cách nhỏ giữa tên cột và phần chú thích trong ngoặc. */
export const HEADER_GAP = '';

export interface HeaderCell {
  /** Cột mẫu đầu và cuối (đánh số từ 1, gồm cả hai đầu). */
  readonly from: number;
  readonly to: number;
  /** `full`: cao hết hàng tiêu đề; `group`: nửa trên của nhóm cột; `sub`: nửa dưới (cột con). */
  readonly zone: 'full' | 'group' | 'sub';
  readonly lines: readonly string[];
}

export interface FormLayout {
  /** Biên trái của từng cột, cộng biên phải cuối cùng (số cột + 1 phần tử). */
  readonly xs: readonly number[];
  readonly top: number;
  /** Đường ngang giữa nhóm cột và cột con; chỉ có khi mẫu có nhóm. */
  readonly split?: number;
  readonly headBottom: number;
  /** Đáy hàng đánh số cột (cũng là đỉnh phần thân bảng). */
  readonly numBottom: number;
  readonly bottom: number;
  /** Bước dòng của phần thân (một dòng chấm chấm trong mẫu). */
  readonly pitch: number;
  /** Cách đỉnh dòng sổ đến dòng chấm (đường viết) của dòng đó. */
  readonly leader: number;
  readonly cells: readonly HeaderCell[];
  /** Cột mẫu (từ 0) → chỉ số cột dữ liệu trong `BookSpec.columns`; `null` = chưa có dữ liệu. */
  readonly columnIndex: readonly (number | null)[];
}

const identity = (n: number) => Array.from({ length: n }, (_, i) => i);

export const FORM_LAYOUTS: Readonly<Record<BookCode, FormLayout>> = {
  'S-01': {
    xs: [51.2, 80.5, 151.5, 228.5, 320.7, 426.9, 526.3, 604.2, 680.5, 753.1, 809.8],
    top: 57.3,
    split: 99.5,
    headBottom: 130.3,
    numBottom: 147.1,
    bottom: 489.6,
    pitch: 25.8,
    leader: 18.7,
    columnIndex: identity(10),
    cells: [
      { from: 1, to: 1, zone: 'full', lines: ['STT'] },
      { from: 2, to: 2, zone: 'full', lines: ['LOẠI VĂN BẢN'] },
      {
        from: 3,
        to: 3,
        zone: 'full',
        lines: ['SỐ, NGÀY,', 'THÁNG, NĂM', 'VĂN BẢN CẦN', 'TỐNG ĐẠT'],
      },
      { from: 4, to: 6, zone: 'group', lines: ['TÊN CƠ QUAN GIAO VĂN BẢN TỐNG ĐẠT'] },
      { from: 4, to: 4, zone: 'sub', lines: ['CƠ QUAN TÒA ÁN'] },
      { from: 5, to: 5, zone: 'sub', lines: ['CƠ QUAN THI HÀNH ÁN', 'DÂN SỰ'] },
      { from: 6, to: 6, zone: 'sub', lines: ['CƠ QUAN KIỂM SÁT'] },
      { from: 7, to: 7, zone: 'full', lines: ['NGÀY, THÁNG,', 'NĂM TỐNG ĐẠT'] },
      { from: 8, to: 8, zone: 'full', lines: ['HÌNH THỨC', 'TỐNG ĐẠT ĐÃ', 'THỰC HIỆN'] },
      {
        from: 9,
        to: 9,
        zone: 'full',
        lines: [
          'THỪA HÀNH',
          'VIÊN THỰC',
          'HIỆN',
          'TỐNG ĐẠT',
          HEADER_GAP,
          '(Ghi rõ họ tên, số Thẻ)',
        ],
      },
      { from: 10, to: 10, zone: 'full', lines: ['GHI CHÚ'] },
    ],
  },
  'S-02': {
    xs: [51.2, 93.9, 242.7, 405.7, 504.9, 632.5, 724.7, 795.6],
    top: 57.3,
    headBottom: 113.7,
    numBottom: 130.5,
    bottom: 498.8,
    pitch: 25.8,
    leader: 18.7,
    columnIndex: identity(7),
    cells: [
      { from: 1, to: 1, zone: 'full', lines: ['STT'] },
      {
        from: 2,
        to: 2,
        zone: 'full',
        lines: ['NGƯỜI YÊU CẦU LẬP VI BẰNG', '(Ghi rõ họ tên, địa chỉ)'],
      },
      { from: 3, to: 3, zone: 'full', lines: ['NỘI DUNG YÊU CẦU LẬP VI BẰNG'] },
      { from: 4, to: 4, zone: 'full', lines: ['SỐ, NGÀY, THÁNG,', 'NĂM CỦA VI BẰNG'] },
      {
        from: 5,
        to: 5,
        zone: 'full',
        lines: ['ĐỊA CHỈ NƠI LẬP', 'VI BẰNG', '(xã/phường/đặc khu, tỉnh/thành', 'phố)'],
      },
      {
        from: 6,
        to: 6,
        zone: 'full',
        lines: ['THỪA HÀNH VIÊN', 'LẬP VI BẰNG', '(Ghi rõ họ tên, số Thẻ)'],
      },
      { from: 7, to: 7, zone: 'full', lines: ['GHI CHÚ'] },
    ],
  },
  'S-04': {
    xs: [19.6, 46.6, 109.6, 195.0, 267.0, 357.0, 438.0, 510.1, 591.1, 676.7, 766.7, 811.7],
    top: 57.3,
    headBottom: 137.9,
    numBottom: 154.6,
    bottom: 512.8,
    pitch: 29.3,
    leader: 20.2,
    columnIndex: identity(11),
    cells: [
      { from: 1, to: 1, zone: 'full', lines: ['STT'] },
      {
        from: 2,
        to: 2,
        zone: 'full',
        lines: ['HỢP ĐỒNG', 'DỊCH VỤ', HEADER_GAP, '(Số, ngày,', 'tháng, năm)'],
      },
      {
        from: 3,
        to: 3,
        zone: 'full',
        lines: [
          'QUYẾT ĐỊNH VỀ THI',
          'HÀNH ÁN (Quyết định',
          'thi hành án; sửa đổi, bổ',
          'sung, thu hồi, hủy bỏ',
          'Quyết định thi hành án)',
          HEADER_GAP,
          '(Số, ngày, tháng,',
          'năm)',
        ],
      },
      {
        from: 4,
        to: 4,
        zone: 'full',
        lines: ['BẢN ÁN,', 'QUYẾT ĐỊNH', 'CỦA TÒA ÁN', HEADER_GAP, '(Số, ngày, tháng,', 'năm)'],
      },
      {
        from: 5,
        to: 5,
        zone: 'full',
        lines: [
          'QUYẾT ĐỊNH XÁC',
          'MINH ĐIỀU KIỆN',
          'THI HÀNH ÁN',
          HEADER_GAP,
          '(Số, ngày, tháng, năm)',
        ],
      },
      {
        from: 6,
        to: 6,
        zone: 'full',
        lines: ['NGƯỜI YÊU CẦU', 'THI HÀNH ÁN', HEADER_GAP, '(Ghi rõ họ tên, địa chỉ)'],
      },
      {
        from: 7,
        to: 7,
        zone: 'full',
        lines: ['NGƯỜI PHẢI', 'THI HÀNH ÁN', HEADER_GAP, '(Ghi rõ họ tên,', 'địa chỉ)'],
      },
      { from: 8, to: 8, zone: 'full', lines: ['NỘI DUNG XÁC', 'MINH ĐIỀU KIỆN', 'THI HÀNH ÁN'] },
      { from: 9, to: 9, zone: 'full', lines: ['KẾT QUẢ XÁC', 'MINH ĐIỀU KIỆN', 'THI HÀNH ÁN'] },
      {
        from: 10,
        to: 10,
        zone: 'full',
        lines: ['THỪA HÀNH VIÊN', 'THỰC HIỆN VIỆC', 'XÁC MINH', HEADER_GAP, '(Ghi rõ họ tên)'],
      },
      { from: 11, to: 11, zone: 'full', lines: ['GHI CHÚ'] },
    ],
  },
  'S-05': {
    xs: [
      19.6, 46.6, 118.6, 181.6, 249.0, 316.6, 379.6, 447.1, 519.1, 591.1, 654.1, 712.7, 775.7,
      811.7,
    ],
    top: 57.3,
    split: 85.8,
    headBottom: 126.1,
    numBottom: 142.9,
    bottom: 512.5,
    pitch: 29.15,
    leader: 20.2,
    // Cột mẫu 3 ("Quyết định về thi hành án") chưa có thuộc tính nguồn nên để trống.
    columnIndex: [0, 1, null, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    cells: [
      { from: 1, to: 1, zone: 'full', lines: ['STT'] },
      { from: 2, to: 2, zone: 'full', lines: ['HỢP ĐỒNG', 'DỊCH VỤ', '(Số, ngày, tháng,', 'năm)'] },
      {
        from: 3,
        to: 6,
        zone: 'group',
        lines: ['QUYẾT ĐỊNH VỀ THI HÀNH ÁN', '(Số, ngày, tháng, năm)'],
      },
      { from: 3, to: 3, zone: 'sub', lines: ['QUYẾT ĐỊNH', 'VỀ THI', 'HÀNH ÁN'] },
      {
        from: 4,
        to: 4,
        zone: 'sub',
        lines: ['SỐ, NGÀY', 'THÁNG, NĂM', 'QUYẾT ĐỊNH', 'THI HÀNH ÁN'],
      },
      { from: 5, to: 5, zone: 'sub', lines: ['SỬA ĐỔI, BỔ', 'SUNG QUYẾT', 'ĐỊNH THI', 'HÀNH ÁN'] },
      { from: 6, to: 6, zone: 'sub', lines: ['THU HỒI', 'QUYẾT ĐỊNH', 'THI HÀNH', 'ÁN'] },
      {
        from: 7,
        to: 7,
        zone: 'full',
        lines: ['BẢN ÁN,', 'QUYẾT ĐỊNH', 'CỦA TÒA ÁN', '(Số, ngày,', 'tháng, năm)'],
      },
      {
        from: 8,
        to: 8,
        zone: 'full',
        lines: ['BÊN PHẢI THI', 'HÀNH ÁN', '(Ghi rõ họ tên/tên', 'gọi, địa chỉ)'],
      },
      {
        from: 9,
        to: 9,
        zone: 'full',
        lines: ['BÊN ĐƯỢC THI', 'HÀNH ÁN', '(Ghi rõ họ tên/tên', 'gọi, địa chỉ)'],
      },
      {
        from: 10,
        to: 10,
        zone: 'full',
        lines: ['CÁC KHOẢN', 'PHẢI THI', 'HÀNH ÁN', '(Theo Hợp', 'đồng dịch vụ)'],
      },
      { from: 11, to: 11, zone: 'full', lines: ['KẾT QUẢ', 'THI HÀNH', 'ÁN'] },
      {
        from: 12,
        to: 12,
        zone: 'full',
        lines: ['THỪA HÀNH', 'VIÊN THỰC', 'HIỆN THI', 'HÀNH ÁN', '(Ghi rõ họ tên,', 'số Thẻ)'],
      },
      { from: 13, to: 13, zone: 'full', lines: ['GHI', 'CHÚ'] },
    ],
  },
};

/** Tên đầy đủ in ở bìa (hai dòng: "SỔ" rồi tên sổ), theo bìa của mẫu. */
export const COVER_TITLES: Readonly<Record<BookCode, string>> = {
  'S-01': 'THEO DÕI VIỆC TỐNG ĐẠT',
  'S-02': 'THEO DÕI VIỆC LẬP VI BẰNG',
  'S-04': 'THEO DÕI VIỆC XÁC MINH ĐIỀU KIỆN THI HÀNH ÁN',
  'S-05': 'THEO DÕI VIỆC THI HÀNH ÁN',
};

/** Tọa độ (đỉnh chữ, pt) của bìa; mỗi mẫu trong Phụ lục I đặt hơi khác nhau nên chép riêng từng sổ. */
export interface CoverGeom {
  /** Đỉnh khung ký hiệu mẫu (khung 222 × 36 pt ở góc phải). */
  readonly box: number;
  readonly office: number;
  readonly address: number;
  /** Đỉnh chữ "SỔ"; tên sổ nằm dưới 29 pt. */
  readonly so: number;
  /** Đỉnh dòng "Quyển số". */
  readonly block: number;
}

export const COVER_GEOM: Readonly<Record<BookCode, { c1: CoverGeom; c2: CoverGeom }>> = {
  'S-01': {
    c1: { box: 58.4, office: 80.7, address: 101.7, so: 224.0, block: 384.9 },
    c2: { box: 38.1, office: 60.9, address: 81.9, so: 204.2, block: 350.8 },
  },
  'S-02': {
    c1: { box: 65.6, office: 81.9, address: 102.9, so: 225.2, block: 386.1 },
    c2: { box: 59.1, office: 81.9, address: 102.9, so: 225.2, block: 371.8 },
  },
  'S-04': {
    c1: { box: 44.6, office: 60.9, address: 81.9, so: 204.2, block: 365.1 },
    c2: { box: 38.1, office: 60.9, address: 81.9, so: 201.9, block: 348.5 },
  },
  'S-05': {
    c1: { box: 44.6, office: 60.9, address: 81.9, so: 204.2, block: 365.1 },
    c2: { box: 59.1, office: 81.9, address: 102.9, so: 222.9, block: 369.5 },
  },
};

export interface VanThuLayout {
  /** Dòng tiêu đề trước phần ` - <tên văn phòng>` (theo Excel của bộ phận Văn thư). */
  readonly title: string;
  /** Độ rộng tương đối từng cột, đo từ ảnh sổ Excel. */
  readonly widths: readonly number[];
  /** Cột (từ 0) căn giữa; các cột còn lại căn trái. */
  readonly centered: readonly number[];
  /** Dòng phụ nhỏ dưới tên cột (chỉ "Số lượng bản" của sổ đi). */
  readonly subHeadings?: Readonly<Record<number, string>>;
}

export const VANTHU_LAYOUTS: Readonly<Record<VanThuCode, VanThuLayout>> = {
  'VT-DEN': {
    title: 'SỔ ĐĂNG KÝ VĂN BẢN ĐẾN',
    widths: [90, 73, 137, 178, 130, 210, 97, 60, 110],
    centered: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  },
  'VT-DI': {
    title: 'SỔ ĐĂNG KÝ VĂN BẢN ĐI',
    widths: [78, 231, 132, 269, 188, 270, 180, 174, 196],
    centered: [0, 2, 6, 7],
    subHeadings: { 6: '(Nơi nhận + lưu)' },
  },
  'VT-NB': {
    title: 'SỔ ĐĂNG KÝ VĂN BẢN NỘI BỘ',
    widths: [70, 173, 139, 211, 150, 124, 185, 147],
    centered: [0, 2, 6],
  },
};
