import Link from 'next/link';
import { AccessRequestForm } from '../../../../components/AccessRequestForm';
import { loadMembers } from '../../../../lib/admin-api';
import { currentSession, requestCookie } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function ProposePage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  const members = officeId ? await loadMembers(await requestCookie(), officeId) : [];
  const people =
    members === 'error'
      ? []
      : [...new Map(members.map((m) => [m.userId, { userId: m.userId, label: m.label }])).values()];
  return (
    <>
      <div>
        <p className="admin-crumb">
          <Link href="/quan-tri">Quản trị</Link> ›{' '}
          <Link href="/quan-tri/phan-quyen">Phân quyền</Link> › Đề xuất đổi quyền
        </p>
        <h1>Đề xuất đổi quyền</h1>
        <p className="muted">
          Chọn một thành viên và một thay đổi. Đề xuất có hiệu lực sau khi Trưởng văn phòng duyệt.
        </p>
      </div>
      {officeId && session.roles.includes('ADMIN') ? (
        <AccessRequestForm officeId={officeId} people={people} branches={session.branches} />
      ) : (
        <p className="muted">Chỉ Admin lập được đề xuất.</p>
      )}
    </>
  );
}
