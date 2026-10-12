import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../components/AppShell';
import { ModuleState } from '../components/ModuleState';
import { NAV, OVERVIEW, findNav, visibleNav } from './nav';
import { getSession } from './session';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/vi-bang' }));

afterEach(cleanup);

describe('navigation', () => {
  it('shows all four domains to every role and hides admin from non-admins', () => {
    for (const role of ['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV', 'VAN_THU'] as const) {
      const labels = visibleNav([role]).map((n) => n.label);
      for (const d of ['Vi bằng', 'Tống đạt', 'Xác minh', 'Tổ chức THA'])
        expect(labels).toContain(d);
    }
    expect(visibleNav(['THV']).map((n) => n.label)).not.toContain('Quản trị');
    expect(visibleNav(['ADMIN']).map((n) => n.label)).toContain('Quản trị');
    expect(visibleNav([])).toEqual([]);
  });

  it('has no accounting menu and unique slugs', () => {
    expect(NAV.map((n) => n.label.toLowerCase()).join('|')).not.toMatch(/kế toán|thanh toán|misa/);
    expect(new Set(NAV.map((n) => n.slug)).size).toBe(NAV.length);
    expect(findNav('khong-co')).toBeUndefined();
  });
});

describe('session', () => {
  it('fails closed in production and without roles', () => {
    expect(getSession({ NODE_ENV: 'production', PREVIEW_SYNTHETIC_ROLES: 'ADMIN' }).status).toBe(
      'unauthenticated',
    );
    expect(getSession({ NODE_ENV: 'development' }).status).toBe('unauthenticated');
    expect(getSession({ NODE_ENV: 'development', PREVIEW_SYNTHETIC_ROLES: 'HACKER' }).status).toBe(
      'unauthenticated',
    );
  });
  it('accepts synthetic roles outside production', () => {
    expect(
      getSession({ NODE_ENV: 'development', PREVIEW_SYNTHETIC_ROLES: 'THV, ADMIN' }),
    ).toMatchObject({
      status: 'authenticated',
      roles: ['THV', 'ADMIN'],
    });
  });
});

describe('AppShell', () => {
  it('renders landmarks, a neutral logo slot and a toggleable menu with the current page', () => {
    render(
      <AppShell items={visibleNav(['ADMIN'])} tenantName={null}>
        <p>nội dung</p>
      </AppShell>,
    );
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByTestId('tenant-logo-slot')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('link', { name: 'Vi bằng' }).getAttribute('aria-current')).toBe('page');
    const btn = screen.getByRole('button', { name: 'Menu' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(screen.getByRole('button', { name: 'Đóng menu' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });
});

describe('ModuleState', () => {
  const item = findNav('quan-tri')!;
  it('asks to sign in when unauthenticated and never offers actions', () => {
    render(<ModuleState item={item} session={{ status: 'unauthenticated' }} />);
    expect(screen.getByRole('alert').textContent).toContain('Cần đăng nhập');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
  it('denies a role without access', () => {
    render(
      <ModuleState
        item={item}
        session={{ status: 'authenticated', roles: ['THV'], tenantName: 'x' }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Không có quyền truy cập');
  });
  it('shows an honest empty state for permitted roles', () => {
    render(
      <ModuleState
        item={OVERVIEW}
        session={{ status: 'authenticated', roles: ['THV'], tenantName: 'x' }}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('Chưa có dữ liệu');
  });
});
