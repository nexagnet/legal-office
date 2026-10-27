import Link from 'next/link';
import { AddMemberForm } from '../../../../components/AddMemberForm';
import { currentSession } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function AddMemberPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  return (
    <>
      <div>
        <p className="admin-crumb">
          <Link href="/quan-tri">Quản trị</Link> › <Link href="/quan-tri/nhan-su">Nhân sự</Link> ›
          Thêm thành viên
        </p>
        <h1>Thêm thành viên</h1>
        <p className="muted">
          Tạo tài khoản và gửi đề xuất cấp vai. Người mới chỉ vào được hệ thống sau khi Trưởng văn
          phòng duyệt.
        </p>
      </div>
      {officeId && session.roles.includes('ADMIN') ? (
        <AddMemberForm officeId={officeId} branches={session.branches} />
      ) : (
        <p className="muted">Chỉ Admin thêm được thành viên.</p>
      )}
    </>
  );
}
