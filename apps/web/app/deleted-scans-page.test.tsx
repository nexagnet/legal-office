import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error('notFound');
  },
}));
vi.mock('../lib/server', () => ({
  API_URL: 'http://api',
  requestCookie: async () => 'sid=1',
  currentSession: async () => ({
    status: 'authenticated',
    roles: ['ADMIN'],
    tenantName: 'T',
    memberships: [{ officeId: 'o1' }],
    branches: [],
  }),
}));

import DeletedScansPage from './dms/scan-da-xoa/page';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const row = (over: Record<string, unknown>) => ({
  kind: 'document',
  file_id: 'f1',
  label: 'scan-mo.pdf',
  mime: 'application/pdf',
  size_bytes: 20480,
  deleted_at: '2026-11-01T03:00:00Z',
  deleted_by: 'u1',
  delete_reason: 'Scan mờ, tải lại',
  purge_after: '2026-12-01T03:00:00Z',
  days_left: 28,
  case_id: 'c1',
  case_number: '030/2026/VB-THV',
  case_title: 'Hồ sơ A',
  domain: 'vibang',
  submission_id: null,
  submission_title: null,
  ...over,
});

function stubApi(permissions: string[], rows: unknown[]) {
  const urls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    urls.push(url);
    const json = (b: unknown) => ({ ok: true, json: async () => b }) as Response;
    if (url.includes('/dms/me/permissions')) return json({ permissions });
    if (url.includes('/dms/deleted-scans')) return json({ rows, total: rows.length });
    if (url.includes('/people/names'))
      return json({ items: [{ userId: 'u1', displayName: 'Nguyễn Admin' }] });
    return json({ rows: [] });
  });
  return urls;
}

const page = async () => render(await DeletedScansPage({ searchParams: Promise.resolve({}) }));

describe('Scan đã xóa 30 ngày (N6)', () => {
  it('Admin thấy file, lý do, người xóa, số ngày còn lại, liên kết hồ sơ/bản trình và nút tải về', async () => {
    stubApi(
      ['dms.permission.approve'],
      [
        row({}),
        row({
          kind: 'submission',
          file_id: 'f2',
          label: 'tuy-chinh.pdf',
          case_id: null,
          case_number: null,
          domain: null,
          submission_id: 's1',
          submission_title: 'Bổ sung ủy quyền',
          days_left: 2,
        }),
      ],
    );
    await page();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Scan đã xóa 30 ngày');
    expect(screen.getByText('scan-mo.pdf')).toBeTruthy();
    expect(screen.getAllByText('Nguyễn Admin')).toHaveLength(2);
    expect(screen.getAllByText('Scan mờ, tải lại')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Hồ sơ · 030/2026/VB-THV' }).getAttribute('href')).toBe(
      '/dms/vi-bang/c1',
    );
    expect(
      screen.getByRole('link', { name: 'Bản trình · Bổ sung ủy quyền' }).getAttribute('href'),
    ).toBe('/dms/trinh-duyet/s1');
    const downloads = screen.getAllByRole('link', { name: 'Tải' });
    expect(downloads.map((a) => a.getAttribute('href'))).toEqual([
      '/api/dms/deleted-scans/document/f1/download',
      '/api/dms/deleted-scans/submission/f2/download',
    ]);
    expect(screen.getByText('2 ngày')).toBeTruthy();
    // Không có đường khôi phục.
    expect(screen.queryByRole('button', { name: /khôi phục/i })).toBeNull();
    expect(screen.getByText(/Không khôi phục được/)).toBeTruthy();
  });

  it('không có file nào thì báo trống', async () => {
    stubApi(['dms.permission.approve'], []);
    await page();
    expect(screen.getByText('Không có scan nào đang chờ xóa hẳn')).toBeTruthy();
  });

  it('người không phải Admin chỉ thấy thông báo, không gọi danh sách', async () => {
    const urls = stubApi([], [row({})]);
    await page();
    expect(screen.getByText('Chỉ Admin được xem mục này')).toBeTruthy();
    expect(screen.queryByText('scan-mo.pdf')).toBeNull();
    expect(urls.some((u) => u.includes('/dms/deleted-scans'))).toBe(false);
  });
});
