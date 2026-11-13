/**
 * Giá trị mặc định cho cột bắt buộc khi ghi sổ (migration 0132): để các bài kiểm thử HTTP tạo nháp rồi ghi sổ không phải
 * điền lại từng cột. Thuộc tính do bài kiểm thử truyền vào luôn thắng giá trị mặc định.
 */
const DEFAULTS: Record<string, Record<string, string>> = {
  vibang: {
    nguoi_yeu_cau: 'Người yêu cầu thử',
    noi_dung_yeu_cau: 'Nội dung thử',
    so_ngay_vi_bang: '01/11/2026',
    dia_chi_noi_lap: 'Phường thử, Hà Nội',
  },
  tongdat: {
    loai_van_ban: 'Giấy báo',
    so_ngay_van_ban: '12/2026 ngày 01/11/2026',
    co_quan_toa_an: '✓',
  },
  xacminh: {
    nguoi_yeu_cau_thi_hanh_an: 'A',
    nguoi_phai_thi_hanh_an: 'B',
    noi_dung_xac_minh: 'Xác minh thử',
  },
  tochuc: {
    quyet_dinh_thi_hanh_an: '01/QĐ-THA',
    ben_phai_thi_hanh_an: 'A',
    ben_duoc_thi_hanh_an: 'B',
    cac_khoan_phai_thi_hanh_an: '1.000.000 đồng',
  },
};

/** Thân yêu cầu POST /dms/cases có đủ cột bắt buộc của nghiệp vụ (các miền khác giữ nguyên). */
export function withRequiredColumns(method: string, path: string, body: unknown): unknown {
  if (method !== 'POST' || path !== '/dms/cases' || typeof body !== 'object' || body === null)
    return body;
  const b = body as { domain?: string; attributes?: Record<string, unknown> };
  const d = b.domain ? DEFAULTS[b.domain] : undefined;
  return d ? { ...b, attributes: { ...d, ...(b.attributes ?? {}) } } : body;
}
