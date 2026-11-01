import type { ReactNode } from 'react';
import Link from 'next/link';
import { AdminNav, type AdminSection } from '../../components/AdminNav';
import { loadRequests } from '../../lib/admin-api';
import { loadMyDmsPermissions } from '../../lib/dms';
import { loadPermissionRequests } from '../../lib/dms-admin';
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
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  const cookie = await requestCookie();
  // Phân quyền theo nhóm quyền DMS: người có quyền đề xuất/duyệt thay đổi quyền cũng vào được mục Phân quyền.
  const perms = officeId ? await loadMyDmsPermissions(cookie, officeId) : [];
  const canPermissions =
    perms.includes('dms.permission.propose') || perms.includes('dms.permission.approve');
  if (!isAdmin && !isHead && !canPermissions) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Quản trị</h1>
        <div className="state" role="alert">
          <h2>Không có quyền</h2>
          <p>
            Mục Quản trị chỉ dành cho Admin và người được cấp quyền đề xuất hoặc duyệt thay đổi
            quyền.
          </p>
        </div>
      </section>
    );
  }
  const [groupRequests, legacyRequests] = await Promise.all([
    officeId && canPermissions
      ? loadPermissionRequests(cookie, officeId)
      : Promise.resolve('error' as const),
    officeId && (isAdmin || isHead)
      ? loadRequests(cookie, officeId)
      : Promise.resolve('error' as const),
  ]);
  const pending =
    (groupRequests === 'error' ? 0 : groupRequests.filter((r) => r.status === 'PENDING').length) +
    (legacyRequests === 'error' ? 0 : legacyRequests.filter((r) => r.status === 'PENDING').length);
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
    { href: '/quan-tri/ho-so-lao-dong', label: 'Hồ sơ lao động' },
  ];
  return (
    <div className="admin-layout">
      <AdminNav sections={sections} />
      <div className="admin-main">{children}</div>
    </div>
  );
}
