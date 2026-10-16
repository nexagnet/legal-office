import Link from 'next/link';
import { CorrespondenceActions } from '../../components/CorrespondenceActions';
import { NewCorrespondenceForm } from '../../components/NewCorrespondenceForm';
import { StatCard } from '../../components/StatCard';
import { NewDecisionForm } from '../../components/NewDecisionForm';
import { API_URL, currentSession, loadSignerOptions, requestCookie } from '../../lib/server';
import { CORRESPONDENCE_DIRECTION_LABEL, CORRESPONDENCE_STATUS_LABEL } from '../../lib/messages';

/** Trạng thái đã khép lại: công văn đến đã xử lý, công văn đi đã ban hành. */
const PROCESSED = new Set(['HANDLED', 'ISSUED']);

export const dynamic = 'force-dynamic';

interface Row {
  readonly id: string;
  readonly direction: string;
  readonly status: string;
  readonly ref_no: string | null;
  readonly doc_type: string;
  readonly counterparty: string;
  readonly subject: string;
}

interface Decision {
  readonly id: string;
  readonly decision_no: string;
  readonly doc_type: string;
  readonly title: string;
  readonly signed_on: string;
}

async function loadDecisions(
  cookie: string | null,
  officeId: string,
): Promise<Decision[] | 'error'> {
  try {
    const res = await fetch(
      `${API_URL}/office/decisions?officeId=${encodeURIComponent(officeId)}`,
      {
        headers: cookie ? { cookie } : {},
        cache: 'no-store',
      },
    );
    if (!res.ok) return 'error';
    return (await res.json()) as Decision[];
  } catch {
    return 'error';
  }
}

const day = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

async function load(
  cookie: string | null,
  officeId: string,
  q: string,
  direction: string,
): Promise<Row[] | 'error'> {
  const qs = new URLSearchParams({ officeId });
  if (q) qs.set('q', q);
  if (direction) qs.set('direction', direction);
  try {
    const res = await fetch(`${API_URL}/office/correspondence?${qs.toString()}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return (await res.json()) as Row[];
  } catch {
    return 'error';
  }
}

export default async function CorrespondencePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; direction?: string }>;
}) {
  const { q = '', direction = '' } = await searchParams;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Công văn</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem công văn.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  const cookie = await requestCookie();
  const items = officeId ? await load(cookie, officeId, q.slice(0, 200), direction) : ([] as Row[]);
  const decisions = officeId ? await loadDecisions(cookie, officeId) : ([] as Decision[]);
  const signers = officeId ? await loadSignerOptions(cookie, officeId) : [];
  return (
    <section aria-labelledby="t">
      <div className="page-head">
        <div>
          <h1 id="t">Công văn đi / đến</h1>
        </div>
        <a className="primary btn-link" href="#tao-van-ban">
          + Tạo văn bản
        </a>
      </div>
      {items !== 'error' ? (
        <div className="stats">
          <StatCard
            label="Văn bản đến"
            value={items.filter((c) => c.direction === 'INBOUND').length}
            note="Trong danh sách đang xem"
          />
          <StatCard
            label="Văn bản đi"
            value={items.filter((c) => c.direction === 'OUTBOUND').length}
            note="Trong danh sách đang xem"
            tone="green"
          />
          <StatCard
            label="Chờ xử lý"
            value={items.filter((c) => !PROCESSED.has(c.status)).length}
            note="Chưa xử lý xong hoặc chưa ban hành"
            tone="amber"
          />
        </div>
      ) : null}
      <form className="filters" method="get" role="search">
        <label className="filter-search">
          <span className="sr-only">Tìm theo trích yếu, số hoặc nơi gửi/nhận</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={200}
            placeholder="Tìm theo trích yếu, số hoặc nơi gửi/nhận..."
          />
        </label>
        <label>
          <span className="sr-only">Loại</span>
          <select name="direction" defaultValue={direction}>
            <option value="">Tất cả</option>
            {Object.entries(CORRESPONDENCE_DIRECTION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="primary">
          Tìm
        </button>
      </form>
      {items === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được danh sách</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="state" role="status">
          <h2>Chưa có công văn</h2>
          <p>Không có công văn nào khớp trong phạm vi quyền của bạn.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Công văn</caption>
            <thead>
              <tr>
                <th scope="col">Số, ký hiệu</th>
                <th scope="col">Loại</th>
                <th scope="col">Trích yếu</th>
                <th scope="col">Nơi gửi/nhận</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.ref_no ?? <span className="muted">Chưa có số</span>}</th>
                  <td>{CORRESPONDENCE_DIRECTION_LABEL[c.direction] ?? c.direction}</td>
                  <td>
                    {c.subject} <span className="muted">· {c.doc_type}</span>
                  </td>
                  <td>{c.counterparty}</td>
                  <td>{CORRESPONDENCE_STATUS_LABEL[c.status] ?? c.status}</td>
                  <td>
                    <CorrespondenceActions id={c.id} direction={c.direction} status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div id="tao-van-ban">
        <NewCorrespondenceForm branches={session.branches} />
      </div>
      <h2 id="dec-t">Sổ quyết định</h2>
      {decisions === 'error' ? (
        <div className="state" role="alert">
          <h3>Không tải được sổ quyết định</h3>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : decisions.length === 0 ? (
        <div className="state" role="status">
          <h3>Chưa có quyết định</h3>
          <p>Chưa có quyết định nào trong phạm vi quyền của bạn.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table aria-labelledby="dec-t">
            <thead>
              <tr>
                <th scope="col">Số</th>
                <th scope="col">Loại</th>
                <th scope="col">Trích yếu</th>
                <th scope="col">Ngày ký</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((d) => (
                <tr key={d.id}>
                  <th scope="row">{d.decision_no}</th>
                  <td>{d.doc_type}</td>
                  <td>{d.title}</td>
                  <td>{day.format(new Date(d.signed_on))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewDecisionForm branches={session.branches} signers={signers} />
    </section>
  );
}
