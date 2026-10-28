import { loadMembers, loadRequests } from '../../../lib/admin-api';
import { AddMemberLink, MemberTable } from '../../../components/MemberTable';
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
  const rows =
    members === 'error'
      ? []
      : members.map((m) => ({ ...m, pending: !m.role && pendingAdds.has(m.userId) }));
  return (
    <>
      {members === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được danh bạ</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : members.length === 0 ? (
        <p className="muted">Chỉ Admin của văn phòng xem được danh bạ thành viên.</p>
      ) : (
        <MemberTable
          members={rows}
          officeId={session.roles.includes('ADMIN') ? officeId : undefined}
          action={session.roles.includes('ADMIN') ? <AddMemberLink /> : undefined}
        />
      )}
    </>
  );
}
