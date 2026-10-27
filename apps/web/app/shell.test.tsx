import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../components/AppShell';
import { ModuleState } from '../components/ModuleState';
import { NAV, OVERVIEW, findNav, visibleNav } from './nav';
import { loadSession } from './session';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));
const path = vi.hoisted(() => ({ current: '/vi-bang' }));
vi.mock('next/navigation', () => ({
  usePathname: () => path.current,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  path.current = '/vi-bang';
});

describe('navigation', () => {
  it('shows all four domains to every role and hides admin from non-admins', () => {
    for (const role of ['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV', 'VAN_THU'] as const) {
      const labels = visibleNav([role]).map((n) => n.label);
      for (const d of ['Vi bằng', 'Tống đạt', 'Xác minh điều kiện THA', 'Tổ chức thi hành án'])
        expect(labels).toContain(d);
    }
    expect(visibleNav(['THV']).map((n) => n.label)).not.toContain('Quản trị');
    expect(visibleNav(['ADMIN']).map((n) => n.label)).toContain('Quản trị');
    expect(visibleNav([])).toEqual([]);
  });

  it('gives the accountant only the overview and Vi bằng, where MISA is confirmed', () => {
    expect(visibleNav(['KE_TOAN']).map((n) => n.label)).toEqual(['Tổng quan', 'Vi bằng']);
  });

  it('puts My work and the approval inbox in the sidebar for the roles that may use them', () => {
    expect(visibleNav(['ADMIN']).map((n) => n.slug)).toEqual(
      expect.arrayContaining(['viec-cua-toi', 'hop-duyet']),
    );
    expect(visibleNav(['VAN_THU']).map((n) => n.slug)).toContain('viec-cua-toi');
    expect(visibleNav(['VAN_THU']).map((n) => n.slug)).not.toContain('hop-duyet');
  });

  it('has no accounting menu and unique slugs', () => {
    expect(NAV.map((n) => n.label.toLowerCase()).join('|')).not.toMatch(/kế toán|thanh toán|misa/);
    expect(new Set(NAV.map((n) => n.slug)).size).toBe(NAV.length);
    expect(findNav('khong-co')).toBeUndefined();
  });
});

describe('session', () => {
  const me =
    (body: unknown, ok = true) =>
    async () =>
      ({ ok, json: async () => body }) as Response;
  const prod = { NODE_ENV: 'production', PREVIEW_SYNTHETIC_ROLES: 'ADMIN' };

  it('fails closed without a cookie, on API errors and on network failures', async () => {
    expect((await loadSession(null, prod, me({}))).status).toBe('unauthenticated');
    expect((await loadSession('lo_session=x', prod, me({}, false))).status).toBe('unauthenticated');
    const boom = async () => {
      throw new Error('down');
    };
    expect((await loadSession('lo_session=x', prod, boom)).status).toBe('unauthenticated');
    expect((await loadSession('lo_session=x', prod, me({ memberships: [] }))).status).toBe(
      'unauthenticated',
    );
  });
  it('takes roles and branches from the API, ignores unknown roles and never trusts the preview env in production', async () => {
    const body = {
      memberships: [
        { officeId: 'o1', role: 'THV', legalSigner: false },
        { officeId: 'o1', role: 'HACKER', legalSigner: true },
      ],
      branches: [{ id: 'b1', officeId: 'o1', name: 'CN1' }],
    };
    const s = await loadSession('lo_session=x', prod, me(body));
    expect(s).toMatchObject({ status: 'authenticated', roles: ['THV'] });
    expect(s.status === 'authenticated' && s.branches).toHaveLength(1);
    expect((await loadSession(null, prod, me(body))).status).toBe('unauthenticated');
  });
  it('allows synthetic preview roles only outside production', async () => {
    const s = await loadSession(null, {
      NODE_ENV: 'development',
      PREVIEW_SYNTHETIC_ROLES: 'THV, ADMIN',
    });
    expect(s).toMatchObject({ status: 'authenticated', roles: ['THV', 'ADMIN'] });
    expect((await loadSession(null, { NODE_ENV: 'development' })).status).toBe('unauthenticated');
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
    expect(
      within(screen.getByRole('navigation', { name: 'Điều hướng chính' }))
        .getByRole('link', { name: 'Vi bằng' })
        .getAttribute('aria-current'),
    ).toBe('page');
    const btn = screen.getByRole('button', { name: 'Menu' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(screen.getByRole('button', { name: 'Đóng menu' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });
});

describe('AppShell subpage head', () => {
  it('shows the intake header from Figma 3:54 while keeping Vi bằng as the current menu item', () => {
    path.current = '/vi-bang/tao-moi';
    render(
      <AppShell items={visibleNav(['ADMIN'])} tenantName={null}>
        <p>nội dung</p>
      </AppShell>,
    );
    expect(document.querySelector('.topbar-h')?.textContent).toBe('Tạo hồ sơ Vi bằng');
    expect(document.querySelector('.topbar-sub')?.textContent).toBe(
      'Tiếp nhận yêu cầu lập Vi bằng',
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Điều hướng chính' }))
        .getByRole('link', { name: 'Vi bằng' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });
});

describe('AppShell case detail head', () => {
  it('shows the detail header from Figma 3:80 for a case page', () => {
    path.current = '/vi-bang/00000000-0000-4000-8000-000000000000';
    render(
      <AppShell items={visibleNav(['ADMIN'])} tenantName={null}>
        <p>nội dung</p>
      </AppShell>,
    );
    expect(document.querySelector('#case-banner')).not.toBeNull();
    expect(
      within(screen.getByRole('navigation', { name: 'Điều hướng chính' }))
        .getByRole('link', { name: 'Vi bằng' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });
});

describe('AppShell stage heads', () => {
  it.each([
    ['cap-so', 'Xác nhận MISA và cấp số'],
    ['ky-dong-dau', 'Ký, đóng dấu và bản scan'],
    ['tra-ket-qua', 'Trả kết quả và liên hệ khách'],
    ['thu-hoi-misa', 'Thu hồi xác nhận thanh toán trên MISA'],
    ['sua-loi-n11', 'Sửa lỗi kỹ thuật Vi bằng · N-11'],
    ['tai-lieu', 'Kho hồ sơ, chứng cứ và bản scan cuối'],
    ['kiem-tra-ban-giao', 'Kiểm tra bàn giao & kết quả liên hệ khách'],
    ['cap-ban-sao', 'Tiếp nhận yêu cầu cấp bản sao Vi bằng'],
    ['phap-ly', 'Thông tin pháp lý của hồ sơ'],
    ['lich-su', 'Lịch sử xử lý hồ sơ'],
  ])('shows the Figma header for /vi-bang/<id>/%s', (stage, title) => {
    path.current = `/vi-bang/abc/${stage}`;
    render(
      <AppShell items={visibleNav(['ADMIN'])} tenantName={null}>
        <p>nội dung</p>
      </AppShell>,
    );
    expect(document.querySelector('.topbar-h')?.textContent).toBe(title);
    expect(
      within(screen.getByRole('navigation', { name: 'Điều hướng chính' }))
        .getByRole('link', { name: 'Vi bằng' })
        .getAttribute('aria-current'),
    ).toBe('page');
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
        session={{
          status: 'authenticated',
          roles: ['THV'],
          tenantName: 'x',
          memberships: [],
          branches: [],
        }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Không có quyền truy cập');
  });
  it('shows an honest empty state for permitted roles', () => {
    render(
      <ModuleState
        item={OVERVIEW}
        session={{
          status: 'authenticated',
          roles: ['THV'],
          tenantName: 'x',
          memberships: [],
          branches: [],
        }}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('Chưa có dữ liệu');
  });
});

describe('AppShell v2', () => {
  const items = visibleNav(['ADMIN']);

  it('có thanh điều hướng dưới với việc của tôi, hộp duyệt và nút Thêm', () => {
    render(
      <AppShell items={items} tenantName={null} signedIn>
        <p>nội dung</p>
      </AppShell>,
    );
    const quick = within(screen.getByRole('navigation', { name: 'Truy cập nhanh' }));
    for (const name of ['Việc của tôi', 'Hộp duyệt', 'Vi bằng', 'Tống đạt', 'Thêm'])
      expect(quick.getByRole(name === 'Thêm' ? 'button' : 'link', { name })).toBeTruthy();
  });

  it('màn đăng nhập không có thanh bên, chỉ panel thương hiệu và nội dung', () => {
    path.current = '/login';
    render(
      <AppShell items={[]} tenantName={null}>
        <p>form đăng nhập</p>
      </AppShell>,
    );
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByText('form đăng nhập')).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
  });
  it('hiện huy hiệu số chờ duyệt cạnh Hộp duyệt, ẩn khi bằng 0', () => {
    const items = visibleNav(['ADMIN']);
    const { rerender } = render(
      <AppShell items={items} tenantName={null} badges={{ 'hop-duyet': 12 }}>
        <p>nội dung</p>
      </AppShell>,
    );
    const nav = within(screen.getByRole('navigation', { name: 'Điều hướng chính' }));
    expect(nav.getByRole('link', { name: /Hộp duyệt/ }).textContent).toContain('12');
    rerender(
      <AppShell items={items} tenantName={null} badges={{ 'hop-duyet': 0 }}>
        <p>nội dung</p>
      </AppShell>,
    );
    expect(nav.getByRole('link', { name: 'Hộp duyệt' }).textContent).toBe('Hộp duyệt');
  });
});
