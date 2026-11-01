import Link from 'next/link';
import { AddMemberForm } from '../../../../components/AddMemberForm';
import { loadDmsGroups } from '../../../../lib/dms-admin';
import { isGroupActive } from '../../../../lib/permission-model';
import { currentSession, requestCookie } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function AddMemberPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  const groups =
    officeId && session.roles.includes('ADMIN')
      ? await loadDmsGroups(await requestCookie(), officeId)
      : [];
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
        />
      ) : (
        <p className="muted">Chỉ Admin thêm được thành viên.</p>
      )}
    </>
  );
}
