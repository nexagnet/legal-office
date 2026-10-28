import NextTopLoader from 'nextjs-toploader';
import type { ReactNode } from 'react';
import { AppShell } from '../components/AppShell';
import { AppToaster } from '../components/AppToaster';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource-variable/source-serif-4';
import './globals.css';
import './theme-v2.css';
import './tailwind.css';
import { ROLE_LABEL, visibleNav } from './nav';
import { currentSession } from '../lib/server';

export const metadata = {
  title: 'Quản lý văn phòng',
  description: 'Quản lý văn phòng thừa hành viên',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await currentSession();
  const items = session.status === 'authenticated' ? visibleNav(session.roles) : [];
  const officeId =
    session.status === 'authenticated'
      ? (session.branches[0]?.officeId ?? session.memberships[0]?.officeId)
      : undefined;
  const badgeOfficeId =
    officeId && items.some((i) => i.slug === 'hop-duyet') ? officeId : undefined;
  return (
    <html lang="vi">
      <body>
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
          badgeOfficeId={badgeOfficeId}
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
