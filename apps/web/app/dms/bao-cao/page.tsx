import { DataTable } from '../../../components/ui/data-table';
import Link from 'next/link';
import { CopyValueButton } from '../../../components/CopyValueButton';
import { TabNav } from '../../../components/ui/tab-nav';
import { loadDmsReport, type DmsReportRow } from '../../../lib/dms';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

type Avail = 'ok' | 'partial' | 'none';
interface Indicator {
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
const AVAIL_TONE: Record<Avail, string> = {
  ok: 'bg-[#d9f1e2] text-[#1b6b3a]',
  partial: 'bg-[#fdf0d5] text-[#8a5a00]',
  none: 'bg-[#fdf0d5] text-[#8a5a00]',
};

const byDomain = (rows: readonly DmsReportRow[], code: string) =>
  rows.find((r) => r.domain === code);

/** Chỉ tiêu N-09 (kết quả tổ chức và hoạt động). Chỉ điền phần đếm được từ hồ sơ đã lưu chính thức; tiền và doanh thu thuộc kế toán (MISA). */
function n09(rows: readonly DmsReportRow[]): Indicator[] {
  return [
    {
      label:
        'Tống đạt: số văn bản tống đạt xong (chưa chia Tòa án / Cơ quan kiểm sát / Cơ quan THADS)',
      value: byDomain(rows, 'tongdat')?.documents ?? 0,
      avail: 'partial',
      source: 'Dòng Sổ S-01 đã ghi; hệ thống chưa chia theo cơ quan giao',
    },
    {
      label: 'Tống đạt: doanh thu (1.000 đồng)',
      value: null,
      avail: 'none',
      source: 'Doanh thu thuộc kế toán (MISA), DMS không giữ tiền',
    },
    {
      label: 'Lập vi bằng: số vi bằng đã lập',
      value: byDomain(rows, 'vibang')?.recorded_cases ?? 0,
      avail: 'ok',
      source: 'Dòng Sổ S-02',
    },
    {
      label: 'Lập vi bằng: doanh thu (1.000 đồng)',
      value: null,
      avail: 'none',
      source: 'Doanh thu thuộc MISA',
    },
    {
      label: 'Việc thi hành án đã tổ chức thi hành xong',
      value: byDomain(rows, 'tochuc')?.recorded_cases ?? 0,
      avail: 'partial',
      source: 'Số hồ sơ Tổ chức THA đã ghi sổ; cần trường kết quả để biết việc đã xong',
    },
    {
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
      label: 'Tổng số việc phải thi hành theo hợp đồng đã ký',
      value: tochuc,
      avail: 'ok',
      source: 'Hồ sơ Tổ chức THA đã ghi sổ trong năm',
    },
    {
      label: 'Tổng số tiền phải thi hành (1.000 đồng)',
      value: null,
      avail: 'none',
      source: 'Chưa có trường số tiền theo hợp đồng',
    },
    {
      label: 'Việc năm trước chuyển sang; mới ký trong năm',
      value: tochuc,
      avail: 'partial',
      source: 'Mới ký tính được; chuyển sang cần nhập đầu kỳ',
    },
    {
      label: 'Việc thi hành xong và chấm dứt theo điểm a/b/c/d/đ khoản 5 Điều 31 Luật THADS',
      value: null,
      avail: 'none',
      source: 'Chưa có trường tình trạng và lý do chấm dứt',
    },
    {
      label: 'Số tiền chuyển sang / chấm dứt / chưa xong chuyển năm sau (1.000 đồng)',
      value: null,
      avail: 'none',
      source: 'Chưa có trường số tiền trong hồ sơ',
    },
  ];
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
  const rows = await loadDmsReport(await requestCookie(), officeId, year);
  const indicators = rows === 'error' ? [] : bc === 'n10' ? n10(rows) : n09(rows);
  const q = (b: string, y: number) => `/dms/bao-cao?bc=${b}&year=${y}`;
  return (
    <section aria-labelledby="t">
      <h1 id="t">Báo cáo · Số liệu tổng hợp</h1>
      <p className="muted">
        Số liệu tổng hợp để tự điền báo cáo, không tự lập hay gửi báo cáo. Chỉ tính hồ sơ đã lưu
        chính thức mà bạn được quyền đọc; nháp và nháp đã hủy không tính.
      </p>
      <TabNav
        label="Chọn báo cáo"
        active={bc}
        tabs={[
          { key: 'n09', label: 'N-09 · Kết quả tổ chức và hoạt động', href: q('n09', year) },
          { key: 'n10', label: 'N-10 · Thống kê kết quả thi hành án', href: q('n10', year) },
        ]}
        action={
          <span className="flex items-center gap-3 text-sm">
            <Link href={q(bc, year - 1)}>← {year - 1}</Link>
            <strong>Năm {year}</strong>
            <Link href={q(bc, year + 1)}>{year + 1} →</Link>
            <Link href={`/dms/bao-cao/mau?year=${year}`}>Mẫu báo cáo (Phụ lục III)</Link>
          </span>
        }
      />
      <p className="rounded-xl bg-[#fdf0d5] px-4 py-2 text-sm text-[#5a3d00]">
        Chỉ là số tham khảo để bạn tự điền vào mẫu TP-THV-N-09/N-10 ngoài đời. Hệ thống không tự
        lập, điền, ký, phát hành hay gửi báo cáo. Kỳ báo cáo là 12 tháng (01/01–31/12); số liệu chốt
        hết ngày cuối kỳ (Điều 36 TT 08/2026/TT-BTP).
      </p>
      {rows === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được báo cáo</h2>
        </div>
      ) : (
        <DataTable tableKey="dms-bao-cao-page-1">
          <table>
            <caption className="sr-only">
              Chỉ tiêu {bc === 'n10' ? 'N-10' : 'N-09'} năm {year}
            </caption>
            <thead>
              <tr>
                <th scope="col">Chỉ tiêu {bc === 'n10' ? 'N-10' : 'N-09'}</th>
                <th scope="col">Số liệu</th>
                <th scope="col">Khả năng tính</th>
                <th scope="col">Sao chép</th>
                <th scope="col">Nguồn dữ liệu</th>
              </tr>
            </thead>
            <tbody>
              {indicators.map((i) => (
                <tr key={i.label}>
                  <th scope="row">{i.label}</th>
                  <td className="text-lg font-bold">{i.value === null ? '—' : i.value}</td>
                  <td>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${AVAIL_TONE[i.avail]}`}
                    >
                      {AVAIL_LABEL[i.avail]}
                    </span>
                  </td>
                  <td>
                    {i.value === null ? null : (
                      <CopyValueButton value={String(i.value)} label={i.label} />
                    )}
                  </td>
                  <td className="muted">{i.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}
      <p className="muted mt-3">
        Chỉ tiêu "Chưa đủ dữ liệu" sẽ tính được khi hồ sơ có đủ trường tương ứng. Báo cáo đã lập và
        gửi ngoài đời: đăng ký vào Sổ văn bản đi kèm bản scan.
      </p>
    </section>
  );
}
