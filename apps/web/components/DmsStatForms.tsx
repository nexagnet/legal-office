import type { DmsReportRow } from '../lib/dms';

/**
 * Bố cục đúng Phụ lục III Thông tư 08/2026/TT-BTP: TP-THV-N-09 (15 cột) và TP-THV-N-10 (16 cột).
 * Chỉ điền ô mà hệ thống thật sự có số liệu (hồ sơ đã lưu chính thức trong năm mà người xem được đọc).
 * Doanh thu, tiền thi hành, "xong", chia theo cơ quan: hệ thống không giữ số tiền kế toán nên ô để trống cho văn phòng điền tay.
 */
export const N09_GROUPS = [
  { title: 'Tòa án nhân dân', span: 2 },
  { title: 'Viện kiểm sát nhân dân', span: 2 },
  { title: 'Cơ quan Thi hành án dân sự', span: 2 },
] as const;

const N10_HEAD = [
  'Tổng số việc thi hành án phải thi hành theo hợp đồng đã ký',
  'Số việc năm trước chưa thi hành xong chuyển sang',
  'Số việc theo hợp đồng mới ký trong năm',
  'Số việc thi hành xong',
  'Số việc đã chấm dứt thi hành án và chấm dứt việc thi hành án',
  'Số việc chưa thi hành xong chuyển năm sau',
  'Tổng số tiền phải thi hành theo hợp đồng đã ký (1.000 đồng)',
  'Số tiền năm trước chưa thi hành xong chuyển sang (1.000 đồng)',
  'Số tiền theo hợp đồng mới ký trong năm (1.000 đồng)',
  'Số tiền chấm dứt THA theo quy định tại điểm a khoản 5 Điều 31 Luật THADS (1.000 đồng)',
  'Số tiền chấm dứt THA theo quy định tại điểm b khoản 5 Điều 31 Luật THADS (1.000 đồng)',
  'Số tiền chấm dứt THA theo quy định tại điểm c khoản 5 Điều 31 Luật THADS (1.000 đồng)',
  'Số tiền chấm dứt THA theo quy định tại điểm d khoản 5 Điều 31 Luật THADS (1.000 đồng)',
  'Số tiền chấm dứt THA theo quy định tại điểm đ khoản 5 Điều 31 Luật THADS (1.000 đồng)',
  'Số tiền chưa thi hành xong chuyển năm sau (1.000 đồng)',
] as const;

const pick = (rows: readonly DmsReportRow[], domain: string): number | null =>
  rows.find((r) => r.domain === domain)?.recorded_cases ?? null;

const cell = (v: number | null) => (v === null ? '' : String(v));

function Signature() {
  return (
    <div className="stat-sign">
      <p>…..Ngày…tháng….năm…..</p>
      <p>
        <strong>GIÁM ĐỐC SỞ TƯ PHÁP/TRƯỞNG VĂN PHÒNG</strong>
      </p>
      <p>(Ghi rõ họ tên và đóng dấu)</p>
    </div>
  );
}

export function N09Form({
  unit,
  year,
  rows,
}: {
  readonly unit: string;
  readonly year: number;
  readonly rows: readonly DmsReportRow[];
}) {
  const served = pick(rows, 'tongdat');
  const row = [
    unit,
    '',
    cell(served),
    '',
    '',
    '',
    '',
    '',
    '',
    cell(pick(rows, 'vibang')),
    '',
    cell(pick(rows, 'xacminh')),
    '',
    '',
    '',
  ];
  return (
    <section aria-labelledby="n09" className="stat-form">
      <p className="stat-code">TP-THV-N-09</p>
      <p className="muted">(Ban hành kèm theo Thông tư số 08/2026/TT-BTP)</p>
      <p>ĐƠN VỊ BÁO CÁO (Sở Tư pháp/văn phòng THADS): {unit}</p>
      <h2 id="n09">KẾT QUẢ TỔ CHỨC VÀ HOẠT ĐỘNG CỦA VĂN PHÒNG THI HÀNH ÁN DÂN SỰ</h2>
      <p>
        Từ ngày 01 tháng 01 năm {year} đến ngày 31 tháng 12 năm {year}
      </p>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Mẫu TP-THV-N-09 năm {year}</caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={3}>
                STT
              </th>
              <th scope="col" rowSpan={3}>
                Tên đơn vị
              </th>
              <th scope="col" rowSpan={3}>
                Số lượng Thừa hành viên
              </th>
              <th scope="col" rowSpan={3}>
                Tổng số giấy tờ, hồ sơ, tài liệu tống đạt
              </th>
              <th scope="colgroup" colSpan={6}>
                Chia ra:
              </th>
              <th scope="colgroup" colSpan={2} rowSpan={2}>
                Lập vi bằng:
              </th>
              <th scope="colgroup" colSpan={2} rowSpan={2}>
                Xác minh điều kiện thi hành án
              </th>
              <th scope="colgroup" colSpan={2} rowSpan={2}>
                Tổ chức thi hành án
              </th>
            </tr>
            <tr>
              {N09_GROUPS.map((g) => (
                <th key={g.title} scope="colgroup" colSpan={g.span}>
                  {g.title}
                </th>
              ))}
            </tr>
            <tr>
              {N09_GROUPS.flatMap((g) => [
                <th key={`${g.title}-n`} scope="col">
                  Số lượng văn bản tống đạt xong
                </th>,
                <th key={`${g.title}-r`} scope="col">
                  Doanh thu (1.000 đồng)
                </th>,
              ])}
              <th scope="col">Số lượng vi bằng đã lập</th>
              <th scope="col">Doanh thu (1.000 đồng)</th>
              <th scope="col">Số lượng việc đã xác minh</th>
              <th scope="col">Doanh thu (1.000 đồng)</th>
              <th scope="col">Số lượng việc đã tổ chức thi hành xong</th>
              <th scope="col">Doanh thu (1.000 đồng)</th>
            </tr>
            <tr>
              <th scope="col">A</th>
              {Array.from({ length: 15 }, (_, i) => (
                <th key={i} scope="col">
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">1</th>
              {row.map((v, i) => (
                <td key={i}>{v}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">2</th>
              {Array.from({ length: 15 }, (_, i) => (
                <td key={i} />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <Signature />
    </section>
  );
}

export function N10Form({ unit, year }: { readonly unit: string; readonly year: number }) {
  return (
    <section aria-labelledby="n10" className="stat-form">
      <p className="stat-code">TP-THV-N-10</p>
      <p className="muted">(Ban hành kèm theo Thông tư số 08/2026/TT-BTP)</p>
      <p>ĐƠN VỊ BÁO CÁO (Sở Tư pháp/văn phòng THADS): {unit}</p>
      <h2 id="n10">THỐNG KÊ KẾT QUẢ TỔ CHỨC THI HÀNH ÁN CỦA VĂN PHÒNG THI HÀNH ÁN DÂN SỰ</h2>
      <p>
        Từ ngày 01 tháng 01 năm {year} đến ngày 31 tháng 12 năm {year}
      </p>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Mẫu TP-THV-N-10 năm {year}</caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={3}>
                STT
              </th>
              <th scope="col" rowSpan={3}>
                Tên đơn vị
              </th>
              <th scope="colgroup" colSpan={6}>
                Kết quả thực hiện hợp đồng thi hành án về việc
              </th>
              <th scope="colgroup" colSpan={9}>
                Kết quả thi hành về tiền
              </th>
            </tr>
            <tr>
              {N10_HEAD.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
            <tr>
              <th scope="col">A</th>
              {Array.from({ length: 16 }, (_, i) => (
                <th key={i} scope="col">
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">1</th>
              <td>{unit}</td>
              {Array.from({ length: 15 }, (_, i) => (
                <td key={i} />
              ))}
            </tr>
            <tr>
              <th scope="row">2</th>
              {Array.from({ length: 16 }, (_, i) => (
                <td key={i} />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <Signature />
    </section>
  );
}
