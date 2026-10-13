import Link from 'next/link';
import { API_URL, currentSession, requestCookie } from '../../lib/server';
import { ROLE_LABEL } from '../../lib/messages';

export const dynamic = 'force-dynamic';

interface Member {
  readonly userId: string;
  readonly label: string;
  readonly role: string;
  readonly legalSigner: boolean;
  readonly hasLogin: boolean;
  readonly branches: readonly string[];
}

async function load(cookie: string | null, officeId: string): Promise<Member[] | 'error'> {
  try {
    const res = await fetch(`${API_URL}/office/members?officeId=${encodeURIComponent(officeId)}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return (await res.json()) as Member[];
  } catch {
    return 'error';
  }
}

export default async function AdminPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Quản trị</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem quản trị.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  const members = officeId ? await load(await requestCookie(), officeId) : [];
  return (
    <section aria-labelledby="t">
      <h1 id="t">Quản trị</h1>
      <p className="muted">
        Danh bạ thành viên, vai trò, chi nhánh được cấp và quyền ký pháp lý. Chỉ xem: việc cấp hoặc
        đổi vai và quyền ký chưa mở trên giao diện vì là quyết định mở rộng quyền, cần chủ xác nhận
        cách làm.
      </p>
      {members === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được danh bạ</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : members.length === 0 ? (
        <div className="state" role="status">
          <h2>Không có dữ liệu</h2>
          <p>Chỉ Admin của văn phòng xem được danh bạ thành viên.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Thành viên văn phòng</caption>
            <thead>
              <tr>
                <th scope="col">Thành viên</th>
                <th scope="col">Vai trò</th>
                <th scope="col">Quyền ký pháp lý</th>
                <th scope="col">Chi nhánh được cấp</th>
                <th scope="col">Đăng nhập</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={`${m.userId}-${m.role}`}>
                  <th scope="row">{m.label}</th>
                  <td>{ROLE_LABEL[m.role] ?? m.role}</td>
                  <td>{m.legalSigner ? 'Có' : 'Không'}</td>
                  <td>
                    {m.branches.length > 0 ? (
                      m.branches.join(', ')
                    ) : (
                      <span className="muted">Không</span>
                    )}
                  </td>
                  <td>{m.hasLogin ? 'Đã có tài khoản' : <span className="muted">Chưa có</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
