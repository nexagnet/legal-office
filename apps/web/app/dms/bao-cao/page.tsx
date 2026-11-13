import { DataTable } from '../../../components/ui/data-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { ErrorRetry } from '../../../components/ErrorRetry';
import { CopyValueButton } from '../../../components/CopyValueButton';
import { ReportExport } from '../../../components/ReportExport';
import { TabNav } from '../../../components/ui/tab-nav';
import { loadDmsReport, loadThvOptions, type DmsReportRow } from '../../../lib/dms';
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
function n09(rows: readonly DmsReportRow[], thvCount: number): Indicator[] {
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
      group: 'Xác minh điều kiện THA',
      label: 'Số việc đã xác minh',
      value: byDomain(rows, 'xacminh')?.recorded_cases ?? 0,
      avail: 'partial',
      source: 'Số hồ sơ Xác minh đã ghi sổ (S-04); doanh thu thuộc MISA',
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
      value: thvCount > 0 ? thvCount : null,
      avail: 'partial',
      source: 'Người có vai THV hoặc Thẻ THV còn hiệu lực trong Quản trị, tại thời điểm xem',
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
  searchParams: Promise<{ year?: string; bc?: string; branch?: string; half?: string }>;
}) {
  const sp = await searchParams;
  const rawYear = Number(sp.year);
  const year =
    Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100
      ? rawYear
      : new Date().getFullYear();
  const bc = sp.bc === 'n10' ? 'n10' : 'n09';
  // Kỳ 6 tháng (01/01–30/06) chỉ có ở N-09; N-10 chỉ có kỳ 12 tháng (TT 08 Điều 36).
  const firstHalf = bc === 'n09' && sp.half === '1';
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
  const officeBranches = session.branches.filter((b) => b.officeId === officeId);
  const branch = officeBranches.find((b) => b.id === sp.branch)?.id;
  const [thv] = await Promise.all([loadThvOptions(cookie)]);
  const thvCount = thv.filter((t) => !t.officeId || t.officeId === officeId).length;
  const [rows, prevRows] = await Promise.all([
    loadDmsReport(cookie, officeId, year, branch, firstHalf),
    loadDmsReport(cookie, officeId, year - 1, branch, firstHalf),
  ]);
  const list = (r: DmsReportRow[] | 'error') =>
    r === 'error' ? [] : bc === 'n10' ? n10(r) : n09(r, thvCount);
  const indicators = list(rows);
  const prevIndicators = list(prevRows);
  const code = bc === 'n10' ? 'N-10' : 'N-09';
  const q = (b: string, y: number, o: { branch?: string; half?: boolean } = {}) => {
    const br = 'branch' in o ? o.branch : branch;
    const h = 'half' in o ? o.half : firstHalf;
    return `/dms/bao-cao?bc=${b}&year=${y}${br ? `&branch=${br}` : ''}${h && b === 'n09' ? '&half=1' : ''}`;
  };
  const periodLabel = firstHalf ? `6 tháng đầu năm ${year}` : `Năm ${year}`;
  const prevLabel = firstHalf ? `6 tháng đầu ${year - 1}` : `Năm ${year - 1}`;
  const exportRows = indicators.map((i, idx) => ({
    group: i.group,
    label: i.label,
    value: i.value,
    prev: prevIndicators[idx]?.value ?? null,
    status: AVAIL_LABEL[i.avail],
    source: i.source,
  }));
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
              <strong>{year}</strong>
              <Link href={q(bc, year + 1)} aria-label={`Năm ${year + 1}`}>
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </nav>
            {bc === 'n09' ? (
              <nav className="year-stepper" aria-label="Chọn kỳ báo cáo">
                <Link
                  href={q(bc, year, { half: false })}
                  aria-current={firstHalf ? undefined : 'page'}
                >
                  12 tháng
                </Link>
                <Link
                  href={q(bc, year, { half: true })}
                  aria-current={firstHalf ? 'page' : undefined}
                >
                  6 tháng
                </Link>
              </nav>
            ) : null}
            <Link
              className="bao-cao-mau"
              href={`/dms/bao-cao/mau?year=${year}${branch ? `&branch=${branch}` : ''}${firstHalf ? '&half=1' : ''}`}
            >
              Mẫu Phụ lục III
            </Link>
          </div>
        }
      />
      {officeBranches.length > 1 ? (
        <nav className="tabs-soft bao-cao-branches" aria-label="Lọc theo chi nhánh">
          <Link
            href={q(bc, year, { branch: undefined })}
            aria-current={branch ? undefined : 'page'}
          >
            Tất cả chi nhánh
          </Link>
          {officeBranches.map((b) => (
            <Link
              key={b.id}
              href={q(bc, year, { branch: b.id })}
              aria-current={branch === b.id ? 'page' : undefined}
            >
              {b.name}
            </Link>
          ))}
        </nav>
      ) : null}
      {rows === 'error' ? (
        <ErrorRetry
          title="Lỗi tải dữ liệu"
          message="Không tải được báo cáo. Kiểm tra kết nối và thử lại."
        />
      ) : (
        <DataTable tableKey="dms-bao-cao-page-2">
          <table>
            <caption className="sr-only">
              Chỉ tiêu {code} {periodLabel}
            </caption>
            <thead>
              <tr>
                <th scope="col">Chỉ tiêu {code}</th>
                <th scope="col" className="num">
                  {periodLabel}
                </th>
                <th scope="col" className="num">
                  {prevLabel}
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
      {rows === 'error' ? null : (
        <ReportExport
          rows={exportRows}
          fileName={`bao-cao-${code}-${year}${firstHalf ? '-6thang' : ''}.csv`}
        />
      )}
      <p className="muted bao-cao-note">
        Số tham khảo để tự điền mẫu TP-THV-{code}; kỳ 6 tháng 01/01–30/06 hoặc 12 tháng 01/01–31/12
        (Điều 36 TT 08/2026/TT-BTP). Hệ thống không lập hay gửi báo cáo; báo cáo đã gửi thì{' '}
        <Link href="/dms/van-ban-di/tao-moi">đăng ký vào Sổ văn bản đi</Link> kèm bản scan.
      </p>
    </section>
  );
}
