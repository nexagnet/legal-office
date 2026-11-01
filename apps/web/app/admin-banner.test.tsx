import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminBanner } from '../components/admin-banner';
import { AppShell } from '../components/AppShell';
import { NAV, OVERVIEW } from './nav';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));
const path = vi.hoisted(() => ({ current: '/quan-tri/nhan-su' }));
vi.mock('next/navigation', () => ({
  usePathname: () => path.current,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  path.current = '/quan-tri/nhan-su';
});

const items = [OVERVIEW, ...NAV];

describe('banner Quản trị (Figma N11)', () => {
  it('đánh dấu vùng Quản trị để banner dùng số đo riêng, vùng khác thì không', () => {
    const { container, rerender } = render(
      <AppShell items={items} tenantName={null}>
        <p>x</p>
      </AppShell>,
    );
    expect(container.querySelector('.shell')?.getAttribute('data-area')).toBe('admin');
    path.current = '/vi-bang';
    rerender(
      <AppShell items={items} tenantName={null}>
        <p>x</p>
      </AppShell>,
    );
    expect(container.querySelector('.shell')?.getAttribute('data-area')).toBeNull();
  });

  it('trang đưa đường dẫn, tên và mô tả riêng lên banner; rời trang thì trả về mặc định', () => {
    path.current = '/quan-tri/phan-quyen';
    const { rerender } = render(
      <AppShell items={items} tenantName={null}>
        <AdminBanner
          crumb={[['Quản trị', '/quan-tri'], ['Phân quyền', '/quan-tri/phan-quyen'], ['PQ-0042']]}
          title="Duyệt thay đổi quyền"
          sub="Đọc tác động"
        />
      </AppShell>,
    );
    const crumb = screen.getByRole('navigation', { name: 'Đường dẫn' });
    expect(crumb.textContent).toBe('Quản trị › Phân quyền › PQ-0042');
    expect(crumb.querySelectorAll('a')).toHaveLength(2);
    expect(document.querySelector('.topbar-h')?.textContent).toBe('Duyệt thay đổi quyền');
    expect(document.querySelector('.topbar-sub')?.textContent).toBe('Đọc tác động');
    rerender(
      <AppShell items={items} tenantName={null}>
        <p>không còn banner riêng</p>
      </AppShell>,
    );
    expect(screen.queryByRole('navigation', { name: 'Đường dẫn' })).toBeNull();
    expect(document.querySelector('.topbar-h')?.textContent).toBe('Phân quyền');
  });
});
