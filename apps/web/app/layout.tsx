import type { ReactNode } from 'react';
import { AppShell } from '../components/AppShell';
import './globals.css';
import { visibleNav } from './nav';
import { getSession } from './session';

export const metadata = {
  title: 'Quản lý văn phòng',
  description: 'Quản lý văn phòng thừa hành viên',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  const session = getSession();
  const items = session.status === 'authenticated' ? visibleNav(session.roles) : [];
  return (
    <html lang="vi">
      <body>
        <AppShell
          items={items}
          tenantName={session.status === 'authenticated' ? session.tenantName : null}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
