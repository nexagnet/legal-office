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
  currentSession: async () => ({ status: 'authenticated', roles: ['THV'], memberships: [] }),
}));

import DmsThvReviewPage from './dms/thv/[id]/page';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const json = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as Response;

describe('Chờ tôi xác nhận: trang xem và xác nhận nội dung', () => {
  it('gắn nhãn tiếng Việt cho SĐT và ghi chú, không lộ tên khóa kỹ thuật', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/dms/books'))
        return json({
          books: [
            {
              domain: 'vibang',
              columns: [{ key: 'nguoi_yeu_cau', heading: 'NGƯỜI YÊU CẦU LẬP VI BẰNG' }],
            },
          ],
          vanthu: [],
        });
      return json({
        case_id: 'c1',
        domain: 'vibang',
        title: 'Hồ sơ thử',
        confirmed: false,
        attributes: { nguoi_yeu_cau: 'Trần Thị Bình', so_dien_thoai: '0900 000 456', note: 'Gấp' },
        documents: [],
      });
    });
    render(await DmsThvReviewPage({ params: Promise.resolve({ id: 'c1' }) }));
    expect(screen.getByText('NGƯỜI YÊU CẦU LẬP VI BẰNG')).toBeTruthy();
    expect(screen.getByText('SĐT khách hàng')).toBeTruthy();
    expect(screen.getByText('0900 000 456')).toBeTruthy();
    expect(screen.getByText('Ghi chú')).toBeTruthy();
    expect(screen.queryByText('so_dien_thoai')).toBeNull();
  });
});
