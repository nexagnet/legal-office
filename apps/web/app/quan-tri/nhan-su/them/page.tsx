import Link from 'next/link';
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
        <p className="admin-crumb">
          <Link href="/quan-tri">Quản trị</Link> › <Link href="/quan-tri/nhan-su">Nhân sự</Link> ›
          Thêm thành viên
        </p>
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
