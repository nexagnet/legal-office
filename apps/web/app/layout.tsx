import type { ReactNode } from 'react';

export const metadata = {
  title: 'Legal Office',
  description: 'Legal office management',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
