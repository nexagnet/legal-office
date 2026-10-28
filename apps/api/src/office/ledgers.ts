/**
 * Sổ theo dõi của Phụ lục I TT 08/2026/TT-BTP (bản điện tử hỗ trợ theo dõi, KHÔNG phải biểu mẫu chính thức).
 * Mỗi sổ: hàm DB `of_ledger_sNN`, danh sách cột đúng thứ tự và tên như mẫu. Cột chưa có nguồn dữ liệu trả `null`.
 * S-03 là sổ của Sở Tư pháp; S-06 đọc qua `GET personnel`.
 */
export interface LedgerColumn {
  readonly no: number;
  /** Tên cột trong kết quả SQL. */
  readonly sql: string;
  /** Khoá trong JSON trả về. */
  readonly key: string;
  readonly label: string;
}

const col = (no: number, sql: string, key: string, label: string): LedgerColumn => ({
  no,
  sql,
  key,
  label,
});

export interface LedgerDef {
  readonly code: 'S-01' | 'S-02' | 'S-04' | 'S-05';
  readonly fn: string;
  readonly title: string;
  readonly columns: readonly LedgerColumn[];
  /** Cột truy vết (không thuộc mẫu), để lần về hồ sơ gốc. */
  readonly trace: readonly { readonly sql: string; readonly key: string }[];
}

const trace = (...pairs: [string, string][]) => pairs.map(([sql, key]) => ({ sql, key }));

export const LEDGERS: readonly LedgerDef[] = [
  {
    code: 'S-01',
    fn: 'of_ledger_s01',
    title: 'Sổ theo dõi việc tống đạt',
    columns: [
      col(1, 'stt', 'stt', 'STT'),
      col(2, 'loai_van_ban', 'loaiVanBan', 'Loại văn bản'),
      col(3, 'so_ngay_van_ban', 'soNgayVanBan', 'Số, ngày, tháng, năm văn bản cần tống đạt'),
      col(4, 'co_quan_toa_an', 'coQuanToaAn', 'Tên cơ quan giao văn bản tống đạt: Cơ quan Tòa án'),
      col(
        5,
        'co_quan_thi_hanh_an',
        'coQuanThiHanhAn',
        'Tên cơ quan giao văn bản tống đạt: Cơ quan thi hành án dân sự',
      ),
      col(
        6,
        'co_quan_kiem_sat',
        'coQuanKiemSat',
        'Tên cơ quan giao văn bản tống đạt: Cơ quan kiểm sát',
      ),
      col(7, 'ngay_tong_dat', 'ngayTongDat', 'Ngày, tháng, năm tống đạt'),
      col(8, 'hinh_thuc_tong_dat', 'hinhThucTongDat', 'Hình thức tống đạt đã thực hiện'),
      col(
        9,
        'thua_hanh_vien_thuc_hien',
        'thuaHanhVienThucHien',
        'Thừa hành viên thực hiện tống đạt (ghi rõ họ tên, số Thẻ)',
      ),
      col(10, 'ghi_chu', 'ghiChu', 'Ghi chú'),
    ],
    trace: trace(
      ['document_id', 'documentId'],
      ['request_id', 'requestId'],
      ['request_ref', 'requestRef'],
      ['branch_id', 'branchId'],
      ['thv_user_id', 'thvUserId'],
      ['status', 'status'],
    ),
  },
  {
    code: 'S-02',
    fn: 'of_ledger_s02',
    title: 'Sổ theo dõi việc lập vi bằng',
    columns: [
      col(1, 'stt', 'stt', 'STT'),
      col(2, 'nguoi_yeu_cau', 'nguoiYeuCau', 'Người yêu cầu lập vi bằng (ghi rõ họ tên, địa chỉ)'),
      col(3, 'noi_dung_yeu_cau', 'noiDungYeuCau', 'Nội dung yêu cầu lập vi bằng'),
      col(4, 'so_ngay_vi_bang', 'soNgayViBang', 'Số, ngày, tháng, năm của vi bằng'),
      col(
        5,
        'dia_chi_noi_lap',
        'diaChiNoiLap',
        'Địa chỉ nơi lập vi bằng (xã/phường/đặc khu, tỉnh/thành phố)',
      ),
      col(
        6,
        'thua_hanh_vien_lap',
        'thuaHanhVienLap',
        'Thừa hành viên lập vi bằng (ghi rõ họ tên, số Thẻ)',
      ),
      col(7, 'ghi_chu', 'ghiChu', 'Ghi chú'),
    ],
    trace: trace(
      ['case_id', 'caseId'],
      ['vibang_label', 'vibangLabel'],
      ['branch_id', 'branchId'],
      ['thv_user_id', 'thvUserId'],
      ['status', 'status'],
    ),
  },
  {
    code: 'S-04',
    fn: 'of_ledger_s04',
    title: 'Sổ theo dõi việc xác minh điều kiện thi hành án',
    columns: [
      col(1, 'stt', 'stt', 'STT'),
      col(2, 'hop_dong_dich_vu', 'hopDongDichVu', 'Hợp đồng dịch vụ (số, ngày, tháng, năm)'),
      col(
        3,
        'quyet_dinh_thi_hanh_an',
        'quyetDinhThiHanhAn',
        'Quyết định về thi hành án (quyết định thi hành án; sửa đổi, bổ sung, thu hồi, hủy bỏ quyết định thi hành án) (số, ngày, tháng, năm)',
      ),
      col(
        4,
        'ban_an_quyet_dinh_toa_an',
        'banAnQuyetDinhToaAn',
        'Bản án, quyết định của Tòa án (số, ngày, tháng, năm)',
      ),
      col(
        5,
        'quyet_dinh_xac_minh',
        'quyetDinhXacMinh',
        'Quyết định xác minh điều kiện thi hành án (số, ngày, tháng, năm)',
      ),
      col(
        6,
        'nguoi_yeu_cau_thi_hanh_an',
        'nguoiYeuCauThiHanhAn',
        'Người yêu cầu thi hành án (ghi rõ họ tên, địa chỉ)',
      ),
      col(
        7,
        'nguoi_phai_thi_hanh_an',
        'nguoiPhaiThiHanhAn',
        'Người phải thi hành án (ghi rõ họ tên, địa chỉ)',
      ),
      col(8, 'noi_dung_xac_minh', 'noiDungXacMinh', 'Nội dung xác minh điều kiện thi hành án'),
      col(9, 'ket_qua_xac_minh', 'ketQuaXacMinh', 'Kết quả xác minh điều kiện thi hành án'),
      col(
        10,
        'thua_hanh_vien_thuc_hien',
        'thuaHanhVienThucHien',
        'Thừa hành viên thực hiện việc xác minh (ghi rõ họ tên)',
      ),
      col(11, 'ghi_chu', 'ghiChu', 'Ghi chú'),
    ],
    trace: trace(
      ['case_id', 'caseId'],
      ['case_ref', 'caseRef'],
      ['branch_id', 'branchId'],
      ['thv_user_id', 'thvUserId'],
      ['status', 'status'],
      ['rounds', 'rounds'],
    ),
  },
  {
    code: 'S-05',
    fn: 'of_ledger_s05',
    title: 'Sổ theo dõi việc thi hành án',
    columns: [
      col(1, 'stt', 'stt', 'STT'),
      col(2, 'hop_dong_dich_vu', 'hopDongDichVu', 'Hợp đồng dịch vụ (số, ngày, tháng, năm)'),
      col(
        3,
        'quyet_dinh_ve_thi_hanh_an',
        'quyetDinhVeThiHanhAn',
        'Quyết định về thi hành án: Quyết định về thi hành án',
      ),
      col(
        4,
        'so_ngay_quyet_dinh_thi_hanh_an',
        'soNgayQuyetDinhThiHanhAn',
        'Quyết định về thi hành án: Số, ngày, tháng, năm quyết định thi hành án',
      ),
      col(
        5,
        'sua_doi_bo_sung_quyet_dinh',
        'suaDoiBoSungQuyetDinh',
        'Quyết định về thi hành án: Sửa đổi, bổ sung quyết định thi hành án',
      ),
      col(
        6,
        'thu_hoi_quyet_dinh',
        'thuHoiQuyetDinh',
        'Quyết định về thi hành án: Thu hồi quyết định thi hành án',
      ),
      col(
        7,
        'ban_an_quyet_dinh_toa_an',
        'banAnQuyetDinhToaAn',
        'Bản án, quyết định của Tòa án (số, ngày, tháng, năm)',
      ),
      col(
        8,
        'ben_phai_thi_hanh_an',
        'benPhaiThiHanhAn',
        'Bên phải thi hành án (ghi rõ họ tên/tên gọi, địa chỉ)',
      ),
      col(
        9,
        'ben_duoc_thi_hanh_an',
        'benDuocThiHanhAn',
        'Bên được thi hành án (ghi rõ họ tên/tên gọi, địa chỉ)',
      ),
      col(
        10,
        'cac_khoan_phai_thi_hanh_an',
        'cacKhoanPhaiThiHanhAn',
        'Các khoản phải thi hành án (theo hợp đồng dịch vụ)',
      ),
      col(11, 'ket_qua_thi_hanh_an', 'ketQuaThiHanhAn', 'Kết quả thi hành án'),
      col(
        12,
        'thua_hanh_vien_thuc_hien',
        'thuaHanhVienThucHien',
        'Thừa hành viên thực hiện thi hành án (ghi rõ họ tên, số Thẻ)',
      ),
      col(13, 'ghi_chu', 'ghiChu', 'Ghi chú'),
    ],
    trace: trace(
      ['case_id', 'caseId'],
      ['case_ref', 'caseRef'],
      ['branch_id', 'branchId'],
      ['thv_user_id', 'thvUserId'],
      ['status', 'status'],
    ),
  },
];

export const LEDGER_BY_CODE: ReadonlyMap<string, LedgerDef> = new Map(
  LEDGERS.map((l) => [l.code.toLowerCase(), l]),
);

/**
 * S-06 Sổ theo dõi sử dụng lao động: dựng từ hồ sơ lao động (`of_s06_read`, bản mới nhất mỗi người), không theo năm.
 * Giả định: các cột theo thông tin hồ sơ lao động (họ tên, quyết định bổ nhiệm, hợp đồng, tình trạng bảo hiểm);
 * bảo hiểm chỉ ghi tình trạng và ghi chú, không có số tiền. Chỉ Admin và Trưởng văn phòng xem được.
 */
export const S06_LEDGER = {
  code: 'S-06',
  fn: 'of_s06_read',
  title: 'Sổ theo dõi việc sử dụng lao động',
  columns: [
    { no: 1, key: 'stt', label: 'STT' },
    { no: 2, key: 'hoTen', label: 'Họ và tên' },
    { no: 3, key: 'gioiTinh', label: 'Giới tính' },
    { no: 4, key: 'chuyenMon', label: 'Chuyên môn' },
    { no: 5, key: 'quyetDinhThuaPhatLai', label: 'Quyết định bổ nhiệm Thừa phát lại (số, ngày)' },
    { no: 6, key: 'quyetDinhThuaHanhVien', label: 'Quyết định bổ nhiệm Thừa hành viên (số, ngày)' },
    { no: 7, key: 'chucVu', label: 'Chức vụ' },
    { no: 8, key: 'hopDongLaoDong', label: 'Hợp đồng lao động (số, ngày)' },
    { no: 9, key: 'baoHiem', label: 'Tình trạng bảo hiểm' },
    { no: 10, key: 'trangThai', label: 'Tình trạng làm việc' },
    { no: 11, key: 'ghiChu', label: 'Ghi chú' },
  ],
} as const;

export function shapeS06Rows(rows: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const text = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
  return rows.map((r, i) => {
    const roles = [
      r.is_office_head ? 'Trưởng văn phòng' : null,
      r.is_partner ? 'Thành viên góp vốn' : null,
    ]
      .filter((x) => x !== null)
      .join(', ');
    const ins =
      r.insurance_purchased === null ? 'Chưa ghi' : r.insurance_purchased ? 'Đã mua' : 'Chưa mua';
    const insNote = text(r.insurance_note);
    return {
      stt: i + 1,
      hoTen: text(r.full_name),
      gioiTinh: r.gender === 'M' ? 'Nam' : r.gender === 'F' ? 'Nữ' : null,
      chuyenMon: text(r.specialty),
      quyetDinhThuaPhatLai: text(r.bailiff_decision_ref),
      quyetDinhThuaHanhVien: text(r.executor_decision_ref),
      chucVu: roles === '' ? null : roles,
      hopDongLaoDong: text(r.labor_contract_ref),
      baoHiem: insNote ? `${ins} (${insNote})` : ins,
      trangThai: r.work_status === 'LEFT' ? 'Đã nghỉ' : 'Đang làm việc',
      ghiChu: text(r.note),
      personId: r.person_id ?? null,
      version: r.version ?? null,
      branchId: r.branch_id ?? null,
    };
  });
}

/** Chuyển một dòng SQL thành đối tượng JSON: cột mẫu theo thứ tự trước, rồi cột truy vết (kiểu bigint → số). */
export function shapeLedgerRow(
  def: LedgerDef,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of def.columns) {
    const v = row[c.sql] ?? null;
    out[c.key] = c.sql === 'stt' ? Number(v) : v;
  }
  for (const t of def.trace) out[t.key] = row[t.sql] ?? null;
  return out;
}

/** Điền cột "Thừa hành viên" khi nguồn SQL để trống nhưng người THV đã có họ tên + số Thẻ (Admin nhập). Không ghi đè giá trị có sẵn. */
export function withThvLabel(
  def: LedgerDef,
  row: Record<string, unknown>,
  labels: ReadonlyMap<string, string>,
): Record<string, unknown> {
  const thvCol = def.columns.find((c) => /^thuaHanhVien/.test(c.key));
  const uid = row.thvUserId;
  if (!thvCol || row[thvCol.key] != null || typeof uid !== 'string') return row;
  const text = labels.get(uid);
  return text === undefined ? row : { ...row, [thvCol.key]: text };
}
