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

import DmsDomainPage from './dms/[domain]/page';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const caseRow = (n: number) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  domain: 'vibang',
  title: `Vi bằng số ${n}`,
  status: 'RECORDED',
  created_by: 'u1',
  created_at: '2026-01-01T00:00:00Z',
  recorded_at: '2026-01-02T00:00:00Z',
  document_count: 2,
  scan_count: 1,
});

/** Giả lập API: ghi lại mọi URL gọi để kiểm tra trang dùng đúng endpoint lọc ở DB. */
function stubApi(total: number, capped = false) {
  const urls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    urls.push(url);
    const json = (b: unknown) => ({ ok: true, json: async () => b }) as Response;
    if (url.includes('/dms/case-search'))
      return json({
        rows: /limit=1&/.test(url) ? [] : [caseRow(1), caseRow(2)],
        total,
        totalCapped: capped,
      });
    if (url.includes('/dms/case-facet-counts'))
      return json({
        creator: [{ value: 'u1', label: 'Nguyễn Văn A', n: 7 }],
        branch: [{ value: 'b1', label: 'Hà Nội', n: 5 }],
        kind: [{ value: 'Biên bản', label: 'Biên bản', n: 9 }],
      });
    if (url.includes('/dms/book-rows-for-cases'))
      return json({ book: { code: 'S-02', columns: [], source: 'case' }, rows: [] });
    if (url.includes('/dms/me/permissions')) return json({ permissions: [] });
    if (url.includes('/dms/report'))
      return json({ rows: [{ domain: 'vibang', documents: 4321, recorded_cases: 1 }] });
    return json({ rows: [] });
  });
  return urls;
}

describe('trang danh sách hồ sơ DMS dùng lọc và phân trang ở cơ sở dữ liệu', () => {
  it('gọi case-search/facet có đếm, chỉ lấy dòng sổ của trang, hiện tổng và chọn lọc', async () => {
    const urls = stubApi(35);
    render(
      await DmsDomainPage({
        params: Promise.resolve({ domain: 'vi-bang' }),
        searchParams: Promise.resolve({ q: 'trần', nt: 'u1', p: '2' }),
      }),
    );
    const page = urls.find((u) => u.includes('case-search') && u.includes('limit=10'));
    expect(page).toContain('offset=10');
    expect(page).toContain('creator=u1');
    expect(page).toContain('q=');
    expect(urls.some((u) => u.includes('/dms/cases?'))).toBe(false); // không còn tải 200 dòng rồi lọc
    expect(urls.some((u) => u.includes('book-rows-for-cases'))).toBe(true);
    expect(urls.some((u) => u.includes('/dms/books/'))).toBe(false); // không tải cả sổ cả năm
    expect(screen.getByText('Vi bằng số 1')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Nguyễn Văn A (7)' })).toBeTruthy();
    expect(screen.getByText(/Hiển thị 2 \/ 35 hồ sơ/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Trang trước' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Trang sau' })).toBeTruthy(); // trang 2/4
    expect(screen.getByText('4.321')).toBeTruthy(); // tài liệu hiện hành từ báo cáo
  });

  it('tổng vượt trần hiện 10.000+ và không dựng hàng nghìn liên kết trang', async () => {
    stubApi(10001, true);
    render(
      await DmsDomainPage({
        params: Promise.resolve({ domain: 'vi-bang' }),
        searchParams: Promise.resolve({ p: '300' }),
      }),
    );
    expect(screen.getByText(/10\.000\+ hồ sơ/)).toBeTruthy();
    expect(document.querySelectorAll('nav[aria-label="Phân trang"] a').length).toBeLessThan(12);
  });
});
