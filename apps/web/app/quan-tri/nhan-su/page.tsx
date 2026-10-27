import Link from 'next/link';
import { loadMembers, loadRequests } from '../../../lib/admin-api';
import { ROLE_LABEL } from '../../../lib/messages';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  const cookie = await requestCookie();
  const members = officeId ? await loadMembers(cookie, officeId) : [];
  const requests = officeId ? await loadRequests(cookie, officeId) : [];
  const pendingAdds = new Set(
    requests === 'error'
      ? []
      : requests
          .filter((r) => r.kind === 'ADD_MEMBER' && r.status === 'PENDING')
          .map((r) => r.targetUserId),
  );
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Nhân sự</h1>
          <p className="muted">
            Danh bạ thành viên văn phòng: vai trò, địa điểm được cấp và quyền ký pháp lý.
          </p>
        </div>
        {session.roles.includes('ADMIN') ? (
          <Link className="primary btn-link" href="/quan-tri/nhan-su/them">
            + Thêm thành viên
          </Link>
        ) : null}
      </div>
      {members === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được danh bạ</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : members.length === 0 ? (
        <p className="muted">Chỉ Admin của văn phòng xem được danh bạ thành viên.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Thành viên văn phòng</caption>
            <thead>
              <tr>
                <th scope="col">Thành viên</th>
                <th scope="col">Vai trò</th>
                <th scope="col">Địa điểm</th>
                <th scope="col">Quyền ký</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={`${m.userId}-${m.role ?? 'none'}`}>
                  <th scope="row">{m.label}</th>
                  <td>
                    {m.role ? (
                      (ROLE_LABEL[m.role] ?? m.role)
                    ) : (
                      <span className="muted">Chưa có vai</span>
                    )}
                  </td>
                  <td>
                    {m.branches.length > 0 ? (
                      m.branches.join(', ')
                    ) : (
                      <span className="muted">Không</span>
                    )}
                  </td>
                  <td>{m.legalSigner ? 'Có' : '—'}</td>
                  <td>
                    {!m.role && pendingAdds.has(m.userId)
                      ? 'Chờ duyệt'
                      : m.role
                        ? m.hasLogin
                          ? 'Hoạt động'
                          : 'Chưa có tài khoản'
                        : 'Chưa có vai'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
