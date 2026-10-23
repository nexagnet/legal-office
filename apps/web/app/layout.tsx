import type { ReactNode } from 'react';
import { AppShell } from '../components/AppShell';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource-variable/source-serif-4';
import './globals.css';
import './theme-v2.css';
import './tailwind.css';
import { ROLE_LABEL, visibleNav } from './nav';
import { loadPendingApprovalCount } from '../lib/pending-approvals';
import { currentSession, requestCookie } from '../lib/server';

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
  const pending =
    officeId && items.some((i) => i.slug === 'hop-duyet')
      ? await loadPendingApprovalCount(await requestCookie(), officeId)
      : null;
  const badges: Record<string, number> = pending ? { 'hop-duyet': pending } : {};
  return (
    <html lang="vi">
      <body>
        <AppShell
          items={items}
          tenantName={session.status === 'authenticated' ? session.tenantName : null}
          badges={badges}
          signedIn={session.status === 'authenticated'}
          roleLabel={
            session.status === 'authenticated' ? (ROLE_LABEL[session.roles[0]!] ?? null) : null
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
