import { AdminBanner } from '../../../../components/admin-banner';
import { AddMemberForm } from '../../../../components/AddMemberForm';
import { loadDmsGroups, loadOfficeBranches } from '../../../../lib/dms-admin';
import { isGroupActive } from '../../../../lib/permission-model';
import { currentSession, requestCookie } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function AddMemberPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  const isAdmin = !!officeId && session.roles.includes('ADMIN');
  const cookie = await requestCookie();
  const [groups, branches] =
    officeId && isAdmin
      ? await Promise.all([loadDmsGroups(cookie, officeId), loadOfficeBranches(cookie, officeId)])
      : [[], []];
  return (
    <>
      <div>
        <AdminBanner
          crumb={[['Quản trị', '/quan-tri'], ['Nhân sự', '/quan-tri/nhan-su'], ['Thêm thành viên']]}
        />
      </div>
      {officeId && session.roles.includes('ADMIN') ? (
        <AddMemberForm
          officeId={officeId}
          groups={groups === 'error' ? [] : groups.filter(isGroupActive)}
          branches={branches}
        />
      ) : (
        <p className="muted">Chỉ Admin thêm được thành viên.</p>
      )}
    </>
  );
}
