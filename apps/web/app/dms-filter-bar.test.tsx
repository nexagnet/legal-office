import { cleanup, render, screen, within } from '@testing-library/react';
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
import { dmsDateRange, periodRange } from '../lib/dms-date-range';
import {
  parseExtraView,
  savedParamsToHref,
  viewHref,
  viewToQuery,
  viewToSavedParams,
} from '../lib/dms-filter-params';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('mốc nhanh của ô Thời gian (giờ Việt Nam)', () => {
  // 05/11/2026 (thứ Năm) 10:00 giờ VN = 03:00 UTC
  const now = new Date('2026-11-05T03:00:00Z');
  it('hôm nay, tuần này (từ thứ Hai), tháng này, tháng trước, quý này, năm nay', () => {
    expect(periodRange('hom-nay', now)).toEqual({
      tu: '2026-11-05T00:00',
      den: '2026-11-05T23:59',
    });
    expect(periodRange('tuan-nay', now)).toEqual({
      tu: '2026-11-02T00:00',
      den: '2026-11-08T23:59',
    });
    expect(periodRange('thang-nay', now)).toEqual({
      tu: '2026-11-01T00:00',
      den: '2026-11-30T23:59',
    });
    expect(periodRange('thang-truoc', now)).toEqual({
      tu: '2026-10-01T00:00',
      den: '2026-10-31T23:59',
    });
    expect(periodRange('quy-nay', now)).toEqual({
      tu: '2026-10-01T00:00',
      den: '2026-12-31T23:59',
    });
    expect(periodRange('nam-nay', now)).toEqual({
      tu: '2026-01-01T00:00',
      den: '2026-12-31T23:59',
    });
  });
  it('qua đêm UTC vẫn đúng ngày Việt Nam; đầu năm tháng trước là tháng 12', () => {
    // 31/12/2026 20:00 UTC = 01/01/2027 03:00 giờ VN
    const t = new Date('2026-12-31T20:00:00Z');
    expect(periodRange('hom-nay', t).tu).toBe('2027-01-01T00:00');
    expect(periodRange('thang-truoc', t)).toEqual({
      tu: '2026-12-01T00:00',
      den: '2026-12-31T23:59',
    });
    // Chủ nhật vẫn thuộc tuần bắt đầu từ thứ Hai trước đó
    expect(periodRange('tuan-nay', new Date('2026-11-08T03:00:00Z')).tu).toBe('2026-11-02T00:00');
  });
  it('mốc nhanh thay cho Từ/Đến và đổi ra from/to UTC; mốc lạ bị bỏ', () => {
    const r = dmsDateRange('2020-01-01T00:00', '2020-01-02T00:00', 'thang-nay', now);
    expect(r.ky).toBe('thang-nay');
    expect(r.from).toBe('2026-10-31T17:00:00.000Z');
    expect(r.to).toBe('2026-11-30T17:00:00.000Z');
    expect(dmsDateRange('2026-11-05T08:00', undefined, 'xyz', now).ky).toBeUndefined();
    expect(dmsDateRange('2026-11-05T08:00', undefined, 'xyz', now).tu).toBe('2026-11-05T08:00');
  });
});

describe('cách nhìn là nguồn sự thật: đọc và ghi thanh địa chỉ', () => {
  it('đọc thv lặp lại hoặc cách nhau dấu phẩy, bỏ giá trị không phải uuid, ba trạng thái mo/tra', () => {
    expect(parseExtraView({ thv: [A, 'x', B, A] }).thv).toEqual([A, B]);
    expect(parseExtraView({ thv: `${A},${B}` }).thv).toEqual([A, B]);
    expect(parseExtraView({ mo: '1', tra: '0' })).toMatchObject({ open: true, returned: false });
    expect(parseExtraView({ mo: '', tra: 'x' })).toMatchObject({
      open: undefined,
      returned: undefined,
    });
  });

  it('ghi ra đúng chuỗi truy vấn, mốc nhanh thay Từ/Đến, thv lặp lại', () => {
    const qs = viewToQuery(
      {
        filter: 'chinh-thuc',
        thv: [A, B],
        open: true,
        returned: false,
        ky: 'thang-nay',
        tu: '2026-11-01T00:00',
      },
      { page: 3 },
    );
    expect(qs.getAll('thv')).toEqual([A, B]);
    expect(qs.get('mo')).toBe('1');
    expect(qs.get('tra')).toBe('0');
    expect(qs.get('ky')).toBe('thang-nay');
    expect(qs.has('tu')).toBe(false);
    expect(qs.get('p')).toBe('3');
    expect(viewHref('/dms/x', { filter: 'chinh-thuc' })).toBe('/dms/x');
  });

  it('bộ lọc đã lưu giữ cả Từ/Đến, thv, việc còn dở, đã trả và mốc nhanh; mở lại ra đúng cách nhìn', () => {
    const view = {
      filter: 'chinh-thuc' as const,
      thv: [A, B],
      open: true,
      returned: false,
      tu: '2026-11-01T00:00',
      den: '2026-11-05T17:30',
    };
    const saved = viewToSavedParams(view);
    expect(saved).toMatchObject({
      status: 'RECORDED',
      thv: `${A},${B}`,
      open: 'true',
      returned: 'false',
      tu: '2026-11-01T00:00',
      den: '2026-11-05T17:30',
    });
    const back = new URLSearchParams(savedParamsToHref('/dms/x', saved).split('?')[1]);
    expect(back.getAll('thv')).toEqual([A, B]);
    expect(back.get('mo')).toBe('1');
    expect(back.get('tra')).toBe('0');
    expect(back.get('tu')).toBe('2026-11-01T00:00');
    expect(back.get('den')).toBe('2026-11-05T17:30');
    // API lưu lại thv thành mảng và boolean thật: vẫn mở đúng
    const stored = {
      status: 'RECORDED',
      thv: [A, B],
      open: true,
      returned: false,
      ky: 'thang-nay',
    };
    const href2 = new URLSearchParams(savedParamsToHref('/dms/x', stored).split('?')[1]);
    expect(href2.getAll('thv')).toEqual([A, B]);
    expect(href2.get('mo')).toBe('1');
    expect(href2.get('ky')).toBe('thang-nay');
    expect(href2.has('tu')).toBe(false);
  });

  it('mốc nhanh lưu dạng tương đối, không ghim năm', () => {
    const saved = viewToSavedParams({ filter: 'chinh-thuc', year: 2026, ky: 'thang-nay' });
    expect(saved).toEqual({ status: 'RECORDED', ky: 'thang-nay' });
  });
});

function stubApi() {
  const urls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    urls.push(url);
    const json = (b: unknown) => ({ ok: true, json: async () => b }) as Response;
    if (url.includes('/dms/case-search')) return json({ rows: [], total: 2, totalCapped: false });
    if (url.includes('/dms/case-facet-counts'))
      return json({
        creator: [],
        branch: [{ value: 'b1', label: 'Hà Nội', n: 5 }],
        kind: [],
        thv: [
          { value: A, label: 'Nguyễn Minh', n: 4 },
          { value: B, label: 'Trần Hoa', n: 3 },
          { value: '', label: '(chưa chọn)', n: 9 },
        ],
      });
    if (url.includes('/dms/me/permissions')) return json({ permissions: [] });
    if (url.includes('/dms/report'))
      return json({
        rows: [{ domain: 'tongdat', documents: 10, recorded_cases: 4 }],
        pending: [{ domain: 'tongdat', pending: 3 }],
        returned: [],
      });
    return json({ rows: [] });
  });
  return urls;
}

describe('hàng lọc mới trên trang danh sách', () => {
  it('gửi thv, việc còn dở và đã trả cho API (mốc nhanh đổi ra from/to, bỏ năm)', async () => {
    const urls = stubApi();
    render(
      await DmsDomainPage({
        params: Promise.resolve({ domain: 'tong-dat' }),
        searchParams: Promise.resolve({ thv: [A, B], mo: '1', tra: '0', ky: 'hom-nay' }),
      }),
    );
    const page = urls.find((u) => u.includes('case-search') && u.includes('limit=10'))!;
    const qs = new URL(page).searchParams;
    expect(qs.get('thv')).toBe(`${A},${B}`);
    expect(qs.get('open')).toBe('true');
    expect(qs.get('returned')).toBe('false');
    expect(qs.has('from')).toBe(true);
    expect(qs.has('year')).toBe(false);
    // facet cũng nhận cùng bộ lọc (kết quả lọc = số đếm = dữ liệu xuất sau này)
    const facet = urls.find((u) => u.includes('case-facet-counts'))!;
    expect(new URL(facet).searchParams.get('thv')).toBe(`${A},${B}`);
  });

  it('hiện chip Đang lọc có ×, Xóa tất cả và số hồ sơ khớp; bỏ chip THV chỉ bỏ đúng người đó', async () => {
    stubApi();
    render(
      await DmsDomainPage({
        params: Promise.resolve({ domain: 'tong-dat' }),
        searchParams: Promise.resolve({ thv: [A, B], mo: '1', ky: 'thang-nay' }),
      }),
    );
    const chips = screen.getByRole('group', { name: 'Đang lọc' });
    expect(within(chips).getByText(/Ghi sổ: Tháng này/)).toBeTruthy();
    expect(within(chips).getByText('Việc còn dở: Chưa tống đạt')).toBeTruthy();
    const thvA = within(chips).getByRole('link', { name: 'Bỏ bộ lọc THV: Nguyễn Minh' });
    const href = new URLSearchParams(thvA.getAttribute('href')!.split('?')[1]);
    expect(href.getAll('thv')).toEqual([B]);
    expect(href.get('mo')).toBe('1');
    expect(within(chips).getByRole('link', { name: 'Xóa tất cả' }).getAttribute('href')).toBe(
      '/dms/tong-dat',
    );
    expect(within(chips).getByText('2')).toBeTruthy();
  });

  it('không có bộ lọc thì không có hàng chip; chỉ còn ba chip trạng thái, scan nằm trong Bộ lọc khác', async () => {
    stubApi();
    render(
      await DmsDomainPage({
        params: Promise.resolve({ domain: 'vi-bang' }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(screen.queryByRole('group', { name: 'Đang lọc' })).toBeNull();
    const tabs = screen.getByRole('navigation', { name: 'Bộ lọc hồ sơ Vi bằng' });
    expect(within(tabs).queryByText('Thiếu scan')).toBeNull();
    expect(within(tabs).getByText('Chính thức')).toBeTruthy();
    const other = screen.getByRole('group', { name: 'Bộ lọc khác', hidden: true });
    expect(within(other).getByLabelText('Tình trạng scan')).toBeTruthy();
    expect(within(other).getByLabelText('Đã trả kết quả')).toBeTruthy(); // chỉ Vi bằng
    expect(within(other).queryByLabelText('Việc còn dở')).toBeNull(); // Vi bằng không có
  });

  it('thẻ số bấm được: Chưa tống đạt bật đúng bộ lọc việc còn dở', async () => {
    stubApi();
    render(
      await DmsDomainPage({
        params: Promise.resolve({ domain: 'tong-dat' }),
        searchParams: Promise.resolve({}),
      }),
    );
    const link = screen.getByRole('link', { name: 'Lọc theo Chưa tống đạt' });
    expect(link.getAttribute('href')).toBe('/dms/tong-dat?mo=1');
  });
});
