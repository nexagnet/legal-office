// Sinh hồ sơ giả TẤT ĐỊNH theo chỉ số (cùng chỉ số → cùng nội dung), để chạy lại không đổi và không nhân đôi.
import * as P from './pools.mjs';

export const SEED_TAG = 'seed-demo';
export const YEAR = 2026;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mk = (seed) => {
  const r = rng(seed * 7919 + 13);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  return { r, pick, int };
};
const pad = (n, w = 3) => String(n).padStart(w, '0');
const money = (n) => n.toLocaleString('vi-VN');
const date = (d, m) => `${pad(d, 2)}/${pad(m, 2)}/${YEAR}`;

function person(g, female = g.r() < 0.4) {
  const ho = g.pick(P.HO);
  return female
    ? `${ho} ${g.pick(P.DEM_NU)} ${g.pick(P.TEN_NU)}`
    : `${ho} ${g.pick(P.DEM_NAM)} ${g.pick(P.TEN_NAM)}`;
}
function address(g) {
  const [px, tinh] = g.pick(P.PHUONG_TINH);
  return `số ${g.int(1, 240)} ${g.pick(P.DUONG)}, ${px}, ${tinh}`;
}
const thvText = (g) => {
  const [n, c] = g.pick(P.THV);
  return `${n}, thẻ số ${c}`;
};

/** Mô tả kế hoạch của hồ sơ thứ i (0-based) của một nghiệp vụ: trạng thái, thiếu scan, chờ duyệt sửa đổi. */
function plan(i, n) {
  const status = i >= n - 3 ? 'CANCELLED' : i >= n - 6 ? 'DRAFT' : 'RECORDED';
  return {
    status,
    missingScan: status === 'RECORDED' && i % 11 === 5,
    pendingAmend: status === 'RECORDED' && i % 12 === 7,
    vectorScan: i % 3 === 0, // 1/3 bản scan không có lớp chữ → buộc OCR thật (Tesseract)
  };
}
const doc = (kind, title, isOfficial, attributes, lines) => ({
  kind,
  title,
  isOfficial,
  attributes,
  lines,
});
const month = (g, i, n) => 1 + Math.floor((i * 10) / n) + (g.r() < 0.2 ? 1 : 0);

function viBang(i, n) {
  const g = mk(1000 + i);
  const d = g.int(1, 27),
    m = Math.min(month(g, i, n), 10);
  const who = i % 5 === 0 ? g.pick(P.CONG_TY) : person(g);
  const so = `${pad(i + 1)}/${YEAR}/VB-TPL`;
  const noiDung = g.pick(P.NOI_DUNG_VI_BANG);
  const diaChi = address(g);
  const t = thvText(g);
  const yc = `${who}, địa chỉ: ${address(g)}`;
  const attrs = {
    nguoi_yeu_cau: yc,
    noi_dung_yeu_cau: noiDung,
    so_ngay_vi_bang: `${so} ngày ${date(d, m)}`,
    dia_chi_noi_lap: diaChi,
    thua_hanh_vien: t,
    ghi_chu: g.r() < 0.3 ? 'Có kèm ảnh chụp hiện trạng' : '',
  };
  const head = [
    `VI BẰNG số ${so}`,
    `Ngày lập: ${date(d, m)}`,
    `Người yêu cầu: ${who}`,
    `Địa chỉ người yêu cầu: ${yc.split(': ')[1]}`,
    `Nội dung: ${noiDung}`,
    `Nơi lập vi bằng: ${diaChi}`,
    `Thừa hành viên: ${t}`,
  ];
  return {
    title: `Vi bằng ${so} – ${who}`,
    attrs,
    ...plan(i, n),
    docs: [
      doc('Đơn yêu cầu lập vi bằng', `Đơn yêu cầu của ${who}`, false, {}, [
        'ĐƠN YÊU CẦU LẬP VI BẰNG',
        `Kính gửi: Văn phòng Thừa phát lại`,
        `Người yêu cầu: ${who}`,
        `Nội dung đề nghị: ${noiDung}`,
        `Địa điểm: ${diaChi}`,
      ]),
      doc('Vi bằng (N-04)', `Vi bằng ${so}`, true, {}, ['VI BẰNG', ...head]),
      doc('Giấy tờ kèm theo', `Giấy tờ chứng minh của ${who}`, false, {}, [
        'GIẤY TỜ KÈM THEO VI BẰNG ' + so,
        `Bản sao giấy tờ tùy thân của ${who}`,
        `Bản sao giấy tờ nhà đất tại ${diaChi}`,
      ]),
      ...(i % 4 === 0
        ? [
            doc('Phụ lục ảnh', `Ảnh hiện trạng vi bằng ${so}`, false, {}, [
              'PHỤ LỤC ẢNH',
              `Vi bằng ${so}`,
              `Chụp tại ${diaChi}`,
            ]),
          ]
        : []),
    ],
  };
}

function tongDat(i, n) {
  const g = mk(2000 + i);
  const nguoi = person(g);
  const nDocs = g.int(2, 4);
  const toa = g.pick(P.TOA_AN);
  const docs = [];
  for (let k = 0; k < nDocs; k++) {
    const loai = P.LOAI_VAN_BAN[(i + k * 3) % P.LOAI_VAN_BAN.length];
    const so = `${g.int(10, 899)}/${['QĐ-THA', 'GB-THA', 'TB-THA', 'QĐ-CCTHADS'][k % 4]}`;
    const nv = date(g.int(1, 27), g.int(1, 9));
    const nt = date(g.int(1, 27), g.int(10, 10));
    const kind = g.r();
    const attributes = {
      loai_van_ban: loai,
      so_ngay_van_ban: `${so} ngày ${nv}`,
      ...(kind < 0.4
        ? { co_quan_toa_an: '✓' }
        : kind < 0.8
          ? { co_quan_thads: '✓' }
          : { co_quan_kiem_sat: '✓' }),
      ngay_tong_dat: nt,
      hinh_thuc_tong_dat: g.pick(P.HINH_THUC_TONG_DAT),
      thua_hanh_vien: thvText(g),
      ghi_chu: g.r() < 0.25 ? 'Đã có người làm chứng ký xác nhận' : '',
    };
    docs.push(
      doc(loai, `${loai} số ${so} – ${nguoi}`, k === 0, attributes, [
        `BIÊN BẢN TỐNG ĐẠT ${loai.toUpperCase()}`,
        `Số văn bản: ${so}, ngày ${nv}`,
        `Người được tống đạt: ${nguoi}`,
        `Địa chỉ: ${address(g)}`,
        `Cơ quan giao: ${toa}`,
        `Ngày tống đạt: ${nt}`,
        `Hình thức: ${attributes.hinh_thuc_tong_dat}`,
        `Thừa hành viên: ${attributes.thua_hanh_vien}`,
      ]),
    );
  }
  return {
    title: `Tống đạt TĐ-${pad(i + 1)} cho ${nguoi} (${toa})`,
    attrs: { nguoi_nhan: nguoi, co_quan_giao: toa },
    ...plan(i, n),
    docs,
  };
}

function xacMinh(i, n) {
  const g = mk(3000 + i);
  const yc = i % 2 ? g.pick(P.CONG_TY) : person(g);
  const phai = person(g);
  const hd = `${pad(i + 1)}/${YEAR}/HĐDV-XM ngày ${date(g.int(1, 27), g.int(1, 6))}`;
  const qdtha = `${g.int(20, 700)}/QĐ-THA ngày ${date(g.int(1, 27), g.int(1, 6))}`;
  const banAn = `Bản án số ${g.int(10, 300)}/${YEAR - 1}/DS-ST ngày ${date(g.int(1, 27), 12).replace(String(YEAR), String(YEAR - 1))} của ${g.pick(P.TOA_AN)}`;
  const qdxm = `${pad(i + 1)}/QĐ-XM ngày ${date(g.int(1, 27), g.int(7, 9))}`;
  const noiDung = g.pick(P.NOI_DUNG_XAC_MINH);
  const ketQua = g.pick(P.KET_QUA_XAC_MINH);
  const t = thvText(g);
  const attrs = {
    hop_dong_dich_vu: hd,
    quyet_dinh_thi_hanh_an: qdtha,
    ban_an_quyet_dinh_toa_an: banAn,
    quyet_dinh_xac_minh: qdxm,
    nguoi_yeu_cau_thi_hanh_an: yc,
    nguoi_phai_thi_hanh_an: `${phai}, ${address(g)}`,
    noi_dung_xac_minh: noiDung,
    ket_qua_xac_minh: ketQua,
    thua_hanh_vien: t,
    ghi_chu: g.r() < 0.3 ? 'Đã gửi kết quả cho người yêu cầu' : '',
  };
  return {
    title: `Xác minh XM-${pad(i + 1)} – ${phai} (yêu cầu bởi ${yc})`,
    attrs,
    ...plan(i, n),
    docs: [
      doc('Hợp đồng dịch vụ', `Hợp đồng dịch vụ ${hd.split(' ngày')[0]}`, false, {}, [
        'HỢP ĐỒNG DỊCH VỤ XÁC MINH',
        `Số: ${hd}`,
        `Bên yêu cầu: ${yc}`,
        `Bên thực hiện: Văn phòng Thừa phát lại`,
        `Đối tượng xác minh: ${phai}`,
      ]),
      doc('Quyết định xác minh', `Quyết định xác minh số ${qdxm.split(' ngày')[0]}`, true, {}, [
        'QUYẾT ĐỊNH XÁC MINH ĐIỀU KIỆN THI HÀNH ÁN',
        `Số: ${qdxm}`,
        `Căn cứ: ${qdtha}`,
        `Căn cứ: ${banAn}`,
        `Người phải thi hành án: ${attrs.nguoi_phai_thi_hanh_an}`,
        `Nội dung: ${noiDung}`,
      ]),
      doc('Biên bản xác minh', `Biên bản xác minh – ${phai}`, true, {}, [
        'BIÊN BẢN XÁC MINH',
        `Người phải thi hành án: ${phai}`,
        `Kết quả: ${ketQua}`,
        `Thừa hành viên: ${t}`,
      ]),
      ...(i % 3 === 0
        ? [
            doc('Giấy tờ kèm theo', `Xác nhận của cơ quan quản lý – ${phai}`, false, {}, [
              'GIẤY XÁC NHẬN',
              `Về người phải thi hành án: ${phai}`,
              `Nội dung: ${noiDung}`,
            ]),
          ]
        : []),
    ],
  };
}

function toChuc(i, n) {
  const g = mk(4000 + i);
  const phai = i % 3 === 0 ? g.pick(P.CONG_TY) : person(g);
  const duoc = i % 3 === 1 ? person(g) : g.pick(P.CONG_TY);
  const hd = `${pad(i + 1)}/${YEAR}/HĐDV-THA ngày ${date(g.int(1, 27), g.int(1, 6))}`;
  const qd = `${g.int(30, 800)}/QĐ-THA ngày ${date(g.int(1, 27), g.int(1, 6))}`;
  const suaDoi = i % 7 === 3 ? `${g.int(900, 990)}/QĐ-SĐBS ngày ${date(g.int(1, 27), 8)}` : '';
  const thuHoi = i % 13 === 9 ? `${g.int(900, 990)}/QĐ-TH ngày ${date(g.int(1, 27), 9)}` : '';
  const banAn = `Bản án số ${g.int(10, 300)}/${YEAR - 1}/KDTM-ST của ${g.pick(P.TOA_AN)}`;
  const a = g.int(8, 480) * 1_000_000,
    b = g.int(5, 90) * 1_000_000;
  const khoan = g
    .pick(P.KHOAN_THA)
    .replace('{n}', `${g.int(100, 999)}/HĐTD`)
    .replace('{a}', money(a))
    .replace('{b}', money(b));
  const ketQua = g.pick(P.KET_QUA_THA);
  const t = thvText(g);
  const diaChiPhai = `${phai}, ${address(g)}`;
  const attrs = {
    hop_dong_dich_vu: hd,
    quyet_dinh_thi_hanh_an: qd,
    quyet_dinh_sua_doi_bo_sung: suaDoi,
    quyet_dinh_thu_hoi: thuHoi,
    ban_an_quyet_dinh_toa_an: banAn,
    ben_phai_thi_hanh_an: diaChiPhai,
    ben_duoc_thi_hanh_an: `${duoc}, ${address(g)}`,
    cac_khoan_phai_thi_hanh_an: khoan,
    ket_qua_thi_hanh_an: ketQua,
    thua_hanh_vien: t,
    ghi_chu: g.r() < 0.25 ? 'Đã thông báo cho các bên' : '',
  };
  return {
    title: `Tổ chức THA-${pad(i + 1)} – ${phai} phải thi hành cho ${duoc}`,
    attrs,
    ...plan(i, n),
    docs: [
      doc('Hợp đồng dịch vụ', `Hợp đồng dịch vụ ${hd.split(' ngày')[0]}`, false, {}, [
        'HỢP ĐỒNG DỊCH VỤ TỔ CHỨC THI HÀNH ÁN',
        `Số: ${hd}`,
        `Bên được thi hành án: ${duoc}`,
        `Bên phải thi hành án: ${phai}`,
      ]),
      doc('Quyết định thi hành án', `Quyết định thi hành án số ${qd.split(' ngày')[0]}`, true, {}, [
        'QUYẾT ĐỊNH THI HÀNH ÁN',
        `Số: ${qd}`,
        `Căn cứ: ${banAn}`,
        `Bên phải thi hành án: ${diaChiPhai}`,
        `Các khoản phải thi hành: ${khoan}`,
      ]),
      doc('Biên bản thi hành án', `Biên bản thi hành án – ${phai}`, true, {}, [
        'BIÊN BẢN TỔ CHỨC THI HÀNH ÁN',
        `Bên phải thi hành án: ${phai}`,
        `Kết quả: ${ketQua}`,
        `Thừa hành viên: ${t}`,
      ]),
      ...(suaDoi
        ? [
            doc(
              'Quyết định sửa đổi, bổ sung',
              `Quyết định sửa đổi bổ sung số ${suaDoi.split(' ngày')[0]}`,
              true,
              {},
              [
                'QUYẾT ĐỊNH SỬA ĐỔI, BỔ SUNG QUYẾT ĐỊNH THI HÀNH ÁN',
                `Số: ${suaDoi}`,
                `Sửa đổi quyết định: ${qd}`,
              ],
            ),
          ]
        : []),
    ],
  };
}

export const DOMAINS = {
  vibang: { gen: viBang, label: 'Vi bằng' },
  tongdat: { gen: tongDat, label: 'Tống đạt' },
  xacminh: { gen: xacMinh, label: 'Xác minh THA' },
  tochuc: { gen: toChuc, label: 'Tổ chức THA' },
};
export const AMEND_TEXT = {
  vibang: (c) => ({ ghi_chu: 'Đính chính lỗi chính tả tên đường trong địa chỉ nơi lập' }),
  tongdat: () => ({ ghi_chu: 'Bổ sung thông tin người làm chứng' }),
  xacminh: () => ({ ghi_chu: 'Cập nhật kết quả xác minh theo văn bản bổ sung' }),
  tochuc: () => ({ ghi_chu: 'Điều chỉnh khoản phải thi hành theo thỏa thuận mới' }),
};
