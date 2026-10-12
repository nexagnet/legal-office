import Link from 'next/link';
import { NewCaseForm } from '../../components/NewCaseForm';
import { API_URL, currentSession, requestCookie } from '../../lib/server';
import { CASE_STATUS_LABEL } from '../../lib/messages';

export const dynamic = 'force-dynamic';

interface CaseItem {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly createdAt: string;
  readonly responsibleThvUserId: string | null;
}

const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

async function loadCases(cookie: string | null): Promise<CaseItem[] | 'error'> {
  try {
    const res = await fetch(`${API_URL}/vibang/cases?limit=100`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return ((await res.json()) as { items: CaseItem[] }).items;
  } catch {
    return 'error';
  }
}

export default async function ViBangPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Vi bằng</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            Phiên làm việc chưa được xác thực. <Link href="/login">Đăng nhập</Link> để xem hồ sơ.
          </p>
        </div>
      </section>
    );
  }
  const cases = await loadCases(await requestCookie());
  return (
    <section aria-labelledby="t">
      <h1 id="t">Vi bằng</h1>
      <p className="muted">
        Hồ sơ bạn được phép xem. Chưa ghi nhận số tiền; thanh toán do kế toán xác nhận từ MISA.
      </p>
      {cases === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
          <p>Máy chủ chưa trả về danh sách. Vui lòng thử lại sau.</p>
        </div>
      ) : cases.length === 0 ? (
        <div className="state" role="status">
          <h2>Chưa có hồ sơ</h2>
          <p>Chưa có hồ sơ Vi bằng nào trong phạm vi quyền của bạn.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Danh sách hồ sơ Vi bằng</caption>
            <thead>
              <tr>
                <th scope="col">Tiêu đề</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">THV phụ trách</th>
                <th scope="col">Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <th scope="row">
                    <Link href={`/vi-bang/${c.id}`}>{c.title}</Link>
                  </th>
                  <td>
                    <span className="badge" data-status={c.status}>
                      {CASE_STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td>{c.responsibleThvUserId ? 'Đã phân công' : 'Chưa phân công'}</td>
                  <td>{fmt.format(new Date(c.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewCaseForm branches={session.branches} />
    </section>
  );
}
