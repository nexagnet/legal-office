import Link from 'next/link';
import { CorrespondenceActions } from '../../components/CorrespondenceActions';
import { NewCorrespondenceForm } from '../../components/NewCorrespondenceForm';
import { API_URL, currentSession, requestCookie } from '../../lib/server';
import { CORRESPONDENCE_DIRECTION_LABEL, CORRESPONDENCE_STATUS_LABEL } from '../../lib/messages';

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
  const items = officeId
    ? await load(await requestCookie(), officeId, q.slice(0, 200), direction)
    : ([] as Row[]);
  return (
    <section aria-labelledby="t">
      <h1 id="t">Công văn</h1>
      <p className="muted">Công văn đến và đi trong phạm vi quyền của bạn.</p>
      <form className="form" method="get" role="search">
        <label>
          Tìm theo trích yếu, số hoặc nơi gửi/nhận
          <input name="q" defaultValue={q} maxLength={200} />
        </label>
        <label>
          Loại
          <select name="direction" defaultValue={direction}>
            <option value="">Tất cả</option>
            {Object.entries(CORRESPONDENCE_DIRECTION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Tìm</button>
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
      <NewCorrespondenceForm branches={session.branches} />
    </section>
  );
}
