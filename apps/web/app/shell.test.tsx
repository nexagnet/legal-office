import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../components/AppShell';
import { ModuleState } from '../components/ModuleState';
import { NAV, OVERVIEW, findNav, hrefOf, visibleNav } from './nav';
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

// Menu bên không còn mục quy trình cũ (đã ẩn), nhưng vỏ trang vẫn phải xử lý đúng các đường dẫn đó.
// Bốn mục nghiệp vụ DMS trùng nhãn với mục cũ cùng tên nên bị loại khỏi bộ mẫu này; chúng có ca kiểm riêng ở "menu DMS".
const DMS_DOMAIN_SLUGS = ['dms-vi-bang', 'dms-tong-dat', 'dms-xac-minh', 'dms-to-chuc-tha'];
const ALL_ITEMS = [OVERVIEW, ...NAV.filter((n) => !DMS_DOMAIN_SLUGS.includes(n.slug))];

describe('navigation', () => {
  it('hides the legacy workflow items from every role (owner 2026-10-31) but keeps the pages defined', () => {
    const legacy = [
      'vi-bang',
      'tong-dat',
      'xac-minh',
      'to-chuc-tha',
      'viec-cua-toi',
      'hop-duyet',
      'hop-dong',
      'so-sach',
      'cong-van',
      'bao-cao',
    ];
    for (const role of ['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV', 'VAN_THU', 'KE_TOAN'] as const) {
      const slugs = visibleNav([role]).map((n) => n.slug);
      for (const l of legacy) expect(slugs).not.toContain(l);
    }
    for (const l of legacy) expect(findNav(l)?.hidden).toBe(true);
    expect(visibleNav(['THV']).map((n) => n.label)).not.toContain('Người dùng');
    expect(visibleNav(['ADMIN']).map((n) => n.label)).toContain('Người dùng');
    expect(visibleNav([])).toEqual([]);
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
      <AppShell items={ALL_ITEMS} tenantName={null}>
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
      <AppShell items={ALL_ITEMS} tenantName={null}>
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
      <AppShell items={ALL_ITEMS} tenantName={null}>
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
      <AppShell items={ALL_ITEMS} tenantName={null}>
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
  const items = ALL_ITEMS;

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
    const items = ALL_ITEMS;
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

describe('menu DMS', () => {
  it('đưa Văn thư, xuất sổ, sửa đổi, chờ xác nhận và báo cáo tổng hợp vào menu với đường dẫn /dms', () => {
    const items = ALL_ITEMS;
    const hrefs = Object.fromEntries(items.map((n) => [n.slug, hrefOf(n)]));
    expect(hrefs['dms-van-thu']).toBe('/dms/van-ban-den');
    expect(hrefs['dms-xuat-so']).toBe('/dms/so');
    expect(hrefs['dms-sua-doi']).toBe('/dms/sua-doi');
    expect(hrefs['dms-thv']).toBe('/dms/thv');
    expect(hrefs['dms-bao-cao']).toBe('/dms/bao-cao');
    expect(hrefs['vi-bang']).toBe('/vi-bang');
  });

  it('đưa bốn nghiệp vụ vào nhóm "Nghiệp vụ" của menu, trỏ tới /dms/<nghiệp vụ>', () => {
    const shown = visibleNav(['THV']).filter((n) => n.group === 'domain');
    expect(shown.map((n) => [n.label, hrefOf(n)])).toEqual([
      ['Vi bằng', '/dms/vi-bang'],
      ['Tống đạt', '/dms/tong-dat'],
      ['Xác minh điều kiện THA', '/dms/xac-minh'],
      ['Tổ chức thi hành án', '/dms/to-chuc-tha'],
    ]);
  });

  it('đánh dấu mục nghiệp vụ đang mở và đặt màu miền khi ở /dms/vi-bang', () => {
    path.current = '/dms/vi-bang';
    const { container } = render(
      <AppShell items={visibleNav(['ADMIN'])} tenantName={null}>
        <p>nội dung</p>
      </AppShell>,
    );
    const nav = within(screen.getByRole('navigation', { name: 'Điều hướng chính' }));
    expect(nav.getByRole('link', { name: 'Vi bằng' }).getAttribute('aria-current')).toBe('page');
    expect(
      nav.getByRole('link', { name: 'Hồ sơ lưu trữ' }).getAttribute('aria-current'),
    ).toBeNull();
    expect(container.querySelector('.shell')?.getAttribute('data-domain')).toBe('vi-bang');
  });
});
