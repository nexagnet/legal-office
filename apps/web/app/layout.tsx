import NextTopLoader from 'nextjs-toploader';
import type { ReactNode } from 'react';
import { AppShell } from '../components/AppShell';
import { AppToaster } from '../components/AppToaster';
import { ForcePasswordChange } from '../components/ForcePasswordChange';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource-variable/source-serif-4';
import './globals.css';
import './theme-v2.css';
import './tailwind.css';
import './admin-figma.css';
import { ROLE_LABEL, visibleNav } from './nav';
import { loadMyDmsPermissions } from '../lib/dms';
import { loadPendingSubmissionCount } from '../lib/dms-submissions';
import { currentSession, requestCookie } from '../lib/server';

export const metadata = {
  title: 'Quản lý văn phòng',
  description: 'Quản lý văn phòng thừa hành viên',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await currentSession();
  const allItems = session.status === 'authenticated' ? visibleNav(session.roles) : [];
  const officeId =
    session.status === 'authenticated'
      ? (session.branches[0]?.officeId ?? session.memberships[0]?.officeId)
      : undefined;
  // "Mọi hồ sơ của văn phòng" chỉ hiện với tài khoản có quyền xem toàn bộ (`*.read.all`); lỗi tải quyền thì ẩn mục này.
  const showOfficeCases =
    officeId && allItems.some((i) => i.slug === 'dms-van-phong')
      ? (await loadMyDmsPermissions(await requestCookie(), officeId)).some((p) =>
          p.endsWith('.read.all'),
        )
      : false;
  const items = allItems.filter((i) => i.slug !== 'dms-van-phong' || showOfficeCases);
  // Huy hiệu "Trình / Duyệt" chỉ có nghĩa với Admin (người duyệt); lỗi tải thì coi như 0, không làm hỏng khung trang.
  const pendingSubmissions =
    officeId && session.status === 'authenticated' && session.roles.includes('ADMIN')
      ? await loadPendingSubmissionCount(await requestCookie(), officeId)
      : 0;
  return (
    <html lang="vi">
      <body>
        {session.status === 'authenticated' && session.mustChangePassword ? (
          <ForcePasswordChange />
        ) : null}
        <NextTopLoader
          color="#c9a24a"
          height={2}
          showSpinner={false}
          shadow={false}
          crawlSpeed={300}
        />
        <AppShell
          items={items}
          tenantName={session.status === 'authenticated' ? session.tenantName : null}
          officeId={officeId ?? null}
          badges={pendingSubmissions ? { 'dms-trinh-duyet': pendingSubmissions } : undefined}
          signedIn={session.status === 'authenticated'}
          userName={session.status === 'authenticated' ? (session.displayName ?? null) : null}
          userId={session.status === 'authenticated' ? (session.userId ?? null) : null}
          roleLabel={
            session.status === 'authenticated' ? (ROLE_LABEL[session.roles[0]!] ?? null) : null
          }
        >
          {children}
        </AppShell>
        <AppToaster />
      </body>
    </html>
  );
}
