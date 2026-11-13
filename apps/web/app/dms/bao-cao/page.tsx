import { DataTable } from '../../../components/ui/data-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { ErrorRetry } from '../../../components/ErrorRetry';
import { CopyValueButton } from '../../../components/CopyValueButton';
import { TabNav } from '../../../components/ui/tab-nav';
import { loadDmsReport, type DmsReportRow } from '../../../lib/dms';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

type Avail = 'ok' | 'partial' | 'none';
interface Indicator {
  /** Nhóm hiển thị (dòng tiêu đề nhóm trong bảng). */
  readonly group: string;
  readonly label: string;
  /** null = chưa tính được, hiện "—". */
  readonly value: number | null;
  readonly avail: Avail;
  readonly source: string;
}

const AVAIL_LABEL: Record<Avail, string> = {
  ok: 'Tính được',
  partial: 'Một phần',
  none: 'Chưa đủ dữ liệu',
};

const byDomain = (rows: readonly DmsReportRow[], code: string) =>
  rows.find((r) => r.domain === code);

/** Chỉ tiêu N-09 (kết quả tổ chức và hoạt động). Chỉ điền phần đếm được từ hồ sơ đã lưu chính thức; tiền và doanh thu thuộc kế toán (MISA). */
function n09(rows: readonly DmsReportRow[]): Indicator[] {
  return [
    {
      group: 'Tống đạt',
      label: 'Số văn bản tống đạt xong',
      value: byDomain(rows, 'tongdat')?.documents ?? 0,
      avail: 'partial',
      source: 'Dòng Sổ S-01 đã ghi; chưa chia theo Tòa án / Cơ quan kiểm sát / Cơ quan THADS',
    },
    {
      group: 'Tống đạt',
      label: 'Doanh thu (1.000 đồng)',
      value: null,
      avail: 'none',
      source: 'Thuộc kế toán (MISA), DMS không giữ tiền',
    },
    {
      group: 'Lập vi bằng',
      label: 'Số vi bằng đã lập',
      value: byDomain(rows, 'vibang')?.recorded_cases ?? 0,
      avail: 'ok',
      source: 'Dòng Sổ S-02',
    },
    {
      group: 'Lập vi bằng',
      label: 'Doanh thu (1.000 đồng)',
      value: null,
      avail: 'none',
      source: 'Thuộc MISA',
    },
    {
      group: 'Thi hành án',
      label: 'Việc đã tổ chức thi hành xong',
      value: byDomain(rows, 'tochuc')?.recorded_cases ?? 0,
      avail: 'partial',
      source: 'Số hồ sơ Tổ chức THA đã ghi sổ; cần trường kết quả để biết việc đã xong',
    },
    {
      group: 'Nhân sự',
      label: 'Số lượng Thừa hành viên',
      value: null,
      avail: 'partial',
      source: 'Từ danh sách Thừa hành viên trong Quản trị',
    },
  ];
}

/** Chỉ tiêu N-10 (thống kê kết quả thi hành án). */
function n10(rows: readonly DmsReportRow[]): Indicator[] {
  const tochuc = byDomain(rows, 'tochuc')?.recorded_cases ?? 0;
  return [
    {
      group: 'Việc phải thi hành',
      label: 'Tổng số việc phải thi hành theo hợp đồng đã ký',
      value: tochuc,
      avail: 'ok',
      source: 'Hồ sơ Tổ chức THA đã ghi sổ trong năm',
    },
    {
      group: 'Việc phải thi hành',
      label: 'Việc năm trước chuyển sang; mới ký trong năm',
      value: tochuc,
      avail: 'partial',
      source: 'Mới ký tính được; chuyển sang cần nhập đầu kỳ',
    },
    {
      group: 'Kết quả',
      label: 'Việc thi hành xong và chấm dứt (điểm a/b/c/d/đ khoản 5 Điều 31 Luật THADS)',
      value: null,
      avail: 'none',
      source: 'Chưa có trường tình trạng và lý do chấm dứt',
    },
    {
      group: 'Số tiền (1.000 đồng)',
      label: 'Tổng số tiền phải thi hành',
      value: null,
      avail: 'none',
      source: 'Chưa có trường số tiền theo hợp đồng',
    },
    {
      group: 'Số tiền (1.000 đồng)',
      label: 'Chuyển sang / chấm dứt / chưa xong chuyển năm sau',
      value: null,
      avail: 'none',
      source: 'Chưa có trường số tiền trong hồ sơ',
    },
  ];
}

/** So với năm trước: null nếu một trong hai chưa tính được. */
function delta(now: number | null, prev: number | null): number | null {
  return now === null || prev === null ? null : now - prev;
}

export default async function DmsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; bc?: string }>;
}) {
  const sp = await searchParams;
  const rawYear = Number(sp.year);
  const year =
    Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100
      ? rawYear
      : new Date().getFullYear();
  const bc = sp.bc === 'n10' ? 'n10' : 'n09';
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Báo cáo tổng hợp</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem báo cáo.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  if (!officeId) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Báo cáo tổng hợp</h1>
        <div className="state" role="status">
          <h2>Chưa gắn văn phòng</h2>
        </div>
      </section>
    );
  }
  const cookie = await requestCookie();
  const [rows, prevRows] = await Promise.all([
    loadDmsReport(cookie, officeId, year),
    loadDmsReport(cookie, officeId, year - 1),
  ]);
  const list = (r: DmsReportRow[] | 'error') =>
    r === 'error' ? [] : bc === 'n10' ? n10(r) : n09(r);
  const indicators = list(rows);
  const prevIndicators = list(prevRows);
  const code = bc === 'n10' ? 'N-10' : 'N-09';
  const q = (b: string, y: number) => `/dms/bao-cao?bc=${b}&year=${y}`;
  const groups = [...new Set(indicators.map((i) => i.group))];
  return (
    <section aria-labelledby="t" className="bao-cao">
      <h1 id="t">Báo cáo · Số liệu tổng hợp</h1>
      <TabNav
        soft
        label="Chọn báo cáo"
        active={bc}
        tabs={[
          { key: 'n09', label: 'N-09 · Kết quả tổ chức và hoạt động', href: q('n09', year) },
          { key: 'n10', label: 'N-10 · Thống kê kết quả thi hành án', href: q('n10', year) },
        ]}
        action={
          <div className="bao-cao-tools">
            <nav className="year-stepper" aria-label="Chọn năm báo cáo">
              <Link href={q(bc, year - 1)} aria-label={`Năm ${year - 1}`}>
                <ChevronLeft size={16} aria-hidden="true" />
              </Link>
              <strong>Năm {year}</strong>
              <Link href={q(bc, year + 1)} aria-label={`Năm ${year + 1}`}>
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </nav>
            <Link className="bao-cao-mau" href={`/dms/bao-cao/mau?year=${year}`}>
              Mẫu Phụ lục III
            </Link>
          </div>
        }
      />
      {rows === 'error' ? (
        <ErrorRetry
          title="Lỗi tải dữ liệu"
          message="Không tải được báo cáo. Kiểm tra kết nối và thử lại."
        />
      ) : (
        <DataTable tableKey="dms-bao-cao-page-2">
          <table>
            <caption className="sr-only">
              Chỉ tiêu {code} năm {year}
            </caption>
            <thead>
              <tr>
                <th scope="col">Chỉ tiêu {code}</th>
                <th scope="col" className="num">
                  Năm {year}
                </th>
                <th scope="col" className="num">
                  Năm {year - 1}
                </th>
                <th scope="col" className="num">
                  Chênh lệch
                </th>
                <th scope="col">Khả năng tính</th>
                <th scope="col">Nguồn dữ liệu</th>
                <th scope="col">Sao chép</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g}>
                <tr className="bao-cao-group">
                  <th scope="colgroup" colSpan={7}>
                    {g}
                  </th>
                </tr>
                {indicators
                  .map((i, idx) => ({ i, idx }))
                  .filter(({ i }) => i.group === g)
                  .map(({ i, idx }) => {
                    const prev = prevIndicators[idx]?.value ?? null;
                    const d = delta(i.value, prev);
                    return (
                      <tr key={i.label}>
                        <th scope="row">{i.label}</th>
                        <td className="num bao-cao-value">{i.value === null ? '—' : i.value}</td>
                        <td className="num muted">
                          {prevRows === 'error' || prev === null ? '—' : prev}
                        </td>
                        <td className="num" data-trend={d === null ? undefined : Math.sign(d)}>
                          {d === null ? '' : d > 0 ? `+${d}` : d}
                        </td>
                        <td>
                          <span className="avail" data-avail={i.avail}>
                            {AVAIL_LABEL[i.avail]}
                          </span>
                        </td>
                        <td className="muted">{i.source}</td>
                        <td>
                          {i.value === null ? null : (
                            <CopyValueButton value={String(i.value)} label={i.label} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            ))}
          </table>
        </DataTable>
      )}
      <p className="muted bao-cao-note">
        Số tham khảo để tự điền mẫu TP-THV-{code}; kỳ 01/01–31/12 (Điều 36 TT 08/2026/TT-BTP). Hệ
        thống không lập hay gửi báo cáo; báo cáo đã gửi đăng ký vào Sổ văn bản đi kèm bản scan.
      </p>
    </section>
  );
}
