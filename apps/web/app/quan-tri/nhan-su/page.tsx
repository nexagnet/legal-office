import { AddMemberLink, MemberTable } from '../../../components/MemberTable';
import { loadMembers } from '../../../lib/admin-api';
import { loadDmsGroups, loadPermissionRequests } from '../../../lib/dms-admin';
import { buildPersonRows, toMemberRow } from '../../../lib/permission-model';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  const cookie = await requestCookie();
  const [members, groups, requests] = officeId
    ? await Promise.all([
        loadMembers(cookie, officeId),
        loadDmsGroups(cookie, officeId),
        loadPermissionRequests(cookie, officeId),
      ])
    : ([[], [], []] as const);
  // Nhóm hoặc yêu cầu không tải được thì vẫn hiện danh bạ, chỉ thiếu cột nhóm quyền.
  const rows =
    members === 'error'
      ? []
      : buildPersonRows(
          members,
          groups === 'error' ? [] : groups,
          requests === 'error' ? [] : requests,
        ).map(toMemberRow);
  const isAdmin = session.roles.includes('ADMIN');
  return members === 'error' ? (
    <div className="state" role="alert">
      <h2>Không tải được danh bạ</h2>
      <p>Vui lòng thử lại sau.</p>
    </div>
  ) : members.length === 0 ? (
    <p className="muted">Chỉ Admin của văn phòng xem được danh bạ thành viên.</p>
  ) : (
    <MemberTable
      members={rows}
      officeId={isAdmin ? officeId : undefined}
      action={isAdmin ? <AddMemberLink /> : undefined}
    />
  );
}
