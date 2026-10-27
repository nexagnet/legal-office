import type { ReactNode } from 'react';
import Link from 'next/link';
import { AdminNav, type AdminSection } from '../../components/AdminNav';
import { loadRequests } from '../../lib/admin-api';
import { currentSession, requestCookie } from '../../lib/server';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { readonly children: ReactNode }) {
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
  const isAdmin = session.roles.includes('ADMIN');
  const isHead = session.roles.includes('TRUONG_VP');
  if (!isAdmin && !isHead) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Quản trị</h1>
        <div className="state" role="alert">
          <h2>Không có quyền</h2>
          <p>Chỉ Admin và Trưởng văn phòng vào được mục Quản trị.</p>
        </div>
      </section>
    );
  }
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  const requests = officeId ? await loadRequests(await requestCookie(), officeId) : [];
  const pending = requests === 'error' ? 0 : requests.filter((r) => r.status === 'PENDING').length;
  const sections: AdminSection[] = [
    ...(isAdmin
      ? [
          { href: '/quan-tri/nhan-su', label: 'Nhân sự' },
          { href: '/quan-tri/chi-nhanh', label: 'Chi nhánh' },
        ]
      : []),
    { href: '/quan-tri/phan-quyen', label: 'Phân quyền', badge: pending },
    ...(isAdmin
      ? [
          { href: '/quan-tri/the-thv', label: 'Thẻ THV' },
          { href: '/quan-tri/email', label: 'Email gửi thư' },
          { href: '/quan-tri/lich', label: 'Lịch làm việc' },
        ]
      : []),
  ];
  return (
    <div className="admin-layout">
      <AdminNav sections={sections} />
      <div className="admin-main">{children}</div>
    </div>
  );
}
