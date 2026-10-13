import Link from 'next/link';
import { ReportExport } from '../../components/ReportExport';
import { API_URL, currentSession, requestCookie } from '../../lib/server';
import { REPORT_DOMAIN_LABEL, REPORT_UNIT_LABEL, reportStatusLabel } from '../../lib/messages';

export const dynamic = 'force-dynamic';

interface Row {
  readonly domain: string;
  readonly unit: string;
  readonly status: string;
  readonly total: number;
}

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
): Promise<Row[] | 'error'> {
  const qs = new URLSearchParams({ officeId, from, to });
  if (branchId) qs.set('branchId', branchId);
  try {
    const res = await fetch(`${API_URL}/office/report?${qs.toString()}`, {
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
  searchParams: Promise<{ from?: string; to?: string; branchId?: string }>;
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
  const rows = officeId ? await load(await requestCookie(), officeId, from, to, branchId) : [];
  const table: string[][] =
    rows === 'error'
      ? []
      : [
          ['Nghiệp vụ', 'Đơn vị đếm', 'Trạng thái', 'Số lượng'],
          ...rows.map((r) => [
            REPORT_DOMAIN_LABEL[r.domain] ?? r.domain,
            REPORT_UNIT_LABEL[r.unit] ?? r.unit,
            reportStatusLabel(r.domain, r.unit, r.status),
            String(r.total),
          ]),
        ];
  return (
    <section aria-labelledby="t">
      <h1 id="t">Báo cáo</h1>
      <p className="muted">
        Số liệu theo ngày tạo (giờ Việt Nam), trong phạm vi quyền của bạn. Mỗi dòng đếm một đơn vị
        riêng, không cộng chéo, không có số tiền.
      </p>
      <form className="form" method="get" role="search">
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
        <button type="submit">Xem</button>
      </form>
      {rows === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được báo cáo</h2>
          <p>Vui lòng kiểm tra kỳ báo cáo và thử lại.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="state" role="status">
          <h2>Không có số liệu</h2>
          <p>Không có dữ liệu nào trong kỳ và phạm vi đã chọn.</p>
        </div>
      ) : (
        <>
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
                    <td>{r[1]}</td>
                    <td>{r[2]}</td>
                    <td>{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ReportExport rows={table} filename={`bao-cao-${from}-${to}.csv`} />
        </>
      )}
    </section>
  );
}
