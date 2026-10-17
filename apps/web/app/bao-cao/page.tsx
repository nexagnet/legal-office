import Link from 'next/link';
import { StatCard } from '../../components/StatCard';
import { ReportExport } from '../../components/ReportExport';
import { API_URL, currentSession, requestCookie } from '../../lib/server';
import { REPORT_DOMAIN_LABEL, REPORT_UNIT_LABEL, reportStatusLabel } from '../../lib/messages';

export const dynamic = 'force-dynamic';

interface Row {
  readonly domain: string;
  readonly unit: string;
  readonly status: string;
  readonly total: number;
  readonly groupLabel?: string;
}

type GroupBy = '' | 'thv' | 'branch';
const GROUP_LABEL: Record<Exclude<GroupBy, ''>, string> = {
  thv: 'Thừa hành viên',
  branch: 'Chi nhánh',
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Đầu tháng và hôm nay theo giờ Việt Nam, làm kỳ mặc định. */
function defaultPeriod(now = new Date()): { from: string; to: string } {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
  return { from: `${today.slice(0, 8)}01`, to: today };
}

async function load(
  cookie: string | null,
  officeId: string,
  from: string,
  to: string,
  branchId: string,
  groupBy: GroupBy,
): Promise<Row[] | 'error'> {
  const qs = new URLSearchParams({ officeId, from, to });
  if (groupBy) qs.set('groupBy', groupBy);
  if (branchId) qs.set('branchId', branchId);
  try {
    const res = await fetch(`${API_URL}/office/report${groupBy ? '/by' : ''}?${qs.toString()}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return (await res.json()) as Row[];
  } catch {
    return 'error';
  }
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; branchId?: string; groupBy?: string }>;
}) {
  const sp = await searchParams;
  const def = defaultPeriod();
  const from = sp.from && ISO.test(sp.from) ? sp.from : def.from;
  const to = sp.to && ISO.test(sp.to) ? sp.to : def.to;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Báo cáo</h1>
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
  const branchId = session.branches.some((b) => b.id === sp.branchId) ? (sp.branchId ?? '') : '';
  const groupBy: GroupBy = sp.groupBy === 'thv' || sp.groupBy === 'branch' ? sp.groupBy : '';
  const rows = officeId
    ? await load(await requestCookie(), officeId, from, to, branchId, groupBy)
    : [];
  const table: string[][] =
    rows === 'error'
      ? []
      : [
          [
            ...(groupBy ? [GROUP_LABEL[groupBy]] : []),
            'Nghiệp vụ',
            'Đơn vị đếm',
            'Trạng thái',
            'Số lượng',
          ],
          ...rows.map((r) => [
            ...(groupBy ? [r.groupLabel ?? 'Chưa phân công'] : []),
            REPORT_DOMAIN_LABEL[r.domain] ?? r.domain,
            REPORT_UNIT_LABEL[r.unit] ?? r.unit,
            reportStatusLabel(r.domain, r.unit, r.status),
            String(r.total),
          ]),
        ];
  const cases =
    rows === 'error' ? [] : rows.filter((r) => r.domain === 'VIBANG' && r.unit === 'CASE');
  const caseTotal = cases.reduce((n, r) => n + r.total, 0);
  const caseReturned = cases
    .filter((r) => r.status === 'RETURNED')
    .reduce((n, r) => n + r.total, 0);
  const caseCancelled = cases
    .filter((r) => r.status === 'CANCELLED')
    .reduce((n, r) => n + r.total, 0);
  const max = rows === 'error' ? 0 : Math.max(1, ...rows.map((r) => r.total));
  return (
    <section aria-labelledby="t">
      <div className="page-head">
        <div>
          <h1 id="t">Báo cáo hoạt động</h1>
          <p className="muted">
            Số liệu theo ngày tạo (giờ Việt Nam), trong phạm vi quyền của bạn. Mỗi dòng đếm một đơn
            vị riêng, không cộng chéo, không có số tiền.
          </p>
        </div>
        {rows !== 'error' && rows.length > 0 ? (
          <ReportExport
            rows={table}
            filename={`bao-cao-${from}-${to}.csv`}
            server={
              officeId && !groupBy
                ? {
                    path: '/office/report/export',
                    params: { officeId, from, to, ...(branchId ? { branchId } : {}) },
                  }
                : undefined
            }
          />
        ) : null}
      </div>
      {rows !== 'error' && cases.length > 0 ? (
        <div className="stats">
          <StatCard label="Vi bằng đã lập" value={caseTotal} note="Hồ sơ tạo trong kỳ đã chọn" />
          <StatCard
            label="Đã trả kết quả"
            value={caseReturned}
            note="Không tính đã thông báo"
            tone="green"
          />
          <StatCard
            label="Chưa hoàn tất"
            value={caseTotal - caseReturned - caseCancelled}
            note="Chờ ký, scan hoặc bàn giao"
            tone="amber"
          />
        </div>
      ) : null}
      <div className="panels report-grid">
        <div className="panel">
          <h2>Số lượng theo nghiệp vụ</h2>
          {rows === 'error' ? (
            <div className="state" role="alert">
              <h3>Không tải được báo cáo</h3>
              <p>Vui lòng kiểm tra kỳ báo cáo và thử lại.</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="state" role="status">
              <h3>Không có số liệu</h3>
              <p>Không có dữ liệu nào trong kỳ và phạm vi đã chọn.</p>
            </div>
          ) : (
            <>
              <ul className="bars" aria-hidden="true">
                {rows.map((r, i) => (
                  <li key={i} title={`${REPORT_DOMAIN_LABEL[r.domain] ?? r.domain}: ${r.total}`}>
                    <span className="bar-value">{r.total}</span>
                    <span
                      className="bar"
                      style={{ height: `${Math.round((r.total / max) * 100)}%` }}
                    />
                    <span className="bar-label">
                      {reportStatusLabel(r.domain, r.unit, r.status)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">
                    Báo cáo từ {from} đến {to}
                  </caption>
                  <thead>
                    <tr>
                      {table[0]!.map((h) => (
                        <th key={h} scope="col">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.slice(1).map((r, i) => (
                      <tr key={i}>
                        <th scope="row">{r[0]}</th>
                        {r.slice(1).map((c, j) => (
                          <td key={j}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <form className="panel form" method="get" role="search">
          <h2>Bộ lọc báo cáo</h2>
          <label>
            Từ ngày
            <input name="from" type="date" defaultValue={from} required />
          </label>
          <label>
            Đến ngày
            <input name="to" type="date" defaultValue={to} required />
          </label>
          <label>
            Chi nhánh
            <select name="branchId" defaultValue={branchId}>
              <option value="">Tất cả</option>
              {session.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Chia theo
            <select name="groupBy" defaultValue={groupBy}>
              <option value="">Không chia</option>
              <option value="thv">Thừa hành viên</option>
              <option value="branch">Chi nhánh</option>
            </select>
          </label>
          <button type="submit" className="primary">
            Xem
          </button>
        </form>
      </div>
    </section>
  );
}
