import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
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

import { DmsCaseSuggest } from '../components/DmsCaseSuggest';
import { DmsSavedFilters } from '../components/DmsSavedFilters';
import DmsSearchPage from './dms/tim-kiem/page';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  push.mockReset();
});

const json = (b: unknown, ok = true) => ({ ok, json: async () => b }) as Response;

describe('gợi ý khi gõ', () => {
  it('gõ đủ 2 ký tự thì hỏi 8 dòng không đếm tổng; chọn gợi ý mở thẳng hồ sơ', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({
        rows: [
          {
            id: 'c1',
            title: 'Vi bằng Nguyễn Văn A',
            creator_name: 'Lan',
            branch_name: 'Hà Nội',
            document_count: 2,
            scan_count: 1,
          },
        ],
      }),
    );
    render(
      <DmsCaseSuggest
        officeId="o1"
        domain="vibang"
        basePath="/dms/vi-bang"
        status="RECORDED"
        year={2026}
        defaultValue=""
      />,
    );
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'n' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(fetchMock).not.toHaveBeenCalled(); // 1 ký tự: chưa hỏi
    fireEvent.change(box, { target: { value: 'nguyen' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('/api/dms/case-search?');
    expect(url).toContain('limit=8');
    expect(url).toContain('total=false');
    expect(url).toContain('year=2026');
    const option = await screen.findByRole('option', { name: /Vi bằng Nguyễn Văn A/ });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/dms/vi-bang/c1');
    expect(option).toBeTruthy();
  });

  it('API lỗi thì không gợi ý, ô tìm vẫn dùng được', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('x'));
    render(
      <DmsCaseSuggest
        officeId="o1"
        domain="vibang"
        basePath="/dms/vi-bang"
        status="RECORDED"
        defaultValue=""
      />,
    );
    const box = screen.getByRole('combobox');
    fireEvent.change(box, { target: { value: 'nguyen' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect((box as HTMLInputElement).value).toBe('nguyen');
  });
});

describe('bộ lọc đã lưu', () => {
  it('liệt kê, mở lại đúng đường dẫn, lưu cách lọc hiện tại và xóa', async () => {
    let rows: { id: string; name: string; params: Record<string, unknown> }[] = [
      {
        id: 's1',
        name: 'Thiếu scan 2025',
        params: { status: 'RECORDED', scan: 'missing', year: 2025 },
      },
    ];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const method = init?.method ?? 'GET';
      if (method === 'POST') {
        rows = [...rows, { id: 's2', name: 'Mới', params: { status: 'DRAFT' } }];
        return json({ code: 'SAVED' });
      }
      if (method === 'DELETE') {
        rows = rows.filter((r) => !String(input).endsWith(r.id));
        return json({ code: 'REMOVED' });
      }
      return json({ rows });
    });
    render(
      <DmsSavedFilters
        officeId="o1"
        domain="vibang"
        basePath="/dms/vi-bang"
        current={{ status: 'DRAFT' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Bộ lọc đã lưu/ }));
    const link = await screen.findByRole('link', { name: 'Thiếu scan 2025' });
    expect(link.getAttribute('href')).toBe('/dms/vi-bang?loc=thieu-scan&year=2025');
    fireEvent.change(screen.getByLabelText('Tên bộ lọc'), { target: { value: 'Mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await screen.findByRole('link', { name: 'Mới' });
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({
      officeId: 'o1',
      domain: 'vibang',
      name: 'Mới',
      params: { status: 'DRAFT' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc Thiếu scan 2025' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Thiếu scan 2025' })).toBeNull());
  });

  it('báo lỗi dễ hiểu khi đã đủ 30 bộ lọc', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_i, init) =>
      init?.method === 'POST' ? json({ code: 'INVALID_ITEM' }, false) : json({ rows: [] }),
    );
    render(<DmsSavedFilters officeId="o1" domain="vibang" basePath="/dms/vi-bang" current={{}} />);
    fireEvent.click(screen.getByRole('button', { name: /Bộ lọc đã lưu/ }));
    await screen.findByText('Chưa có bộ lọc nào được lưu.');
    fireEvent.change(screen.getByLabelText('Tên bộ lọc'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect((await screen.findByRole('alert')).textContent).toContain('tối đa 30');
  });
});

describe('trang tìm trong nội dung scan', () => {
  it('chuyển bộ lọc năm/người tạo/đơn vị/loại và trang sang API, có phân trang', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('/dms/case-facet-counts'))
        return json({
          creator: [{ value: 'u1', label: 'Lan', n: 3 }],
          branch: [],
          kind: [],
          year: [{ value: '2026', label: '2026', n: 9 }],
        });
      const rows = Array.from({ length: 21 }, (_, i) => ({
        case_id: `c${i}`,
        case_title: `Hồ sơ ${i}`,
        domain: 'vibang',
        document_title: 'BB',
        file_id: `f${i}`,
        file_label: 'a.pdf',
        snippet: 'đoạn trích',
      }));
      return json({ rows });
    });
    render(
      await DmsSearchPage({
        searchParams: Promise.resolve({ q: 'trần', year: '2026', nt: 'u1', p: '2' }),
      }),
    );
    const search = urls.find((u) => u.includes('/dms/search'))!;
    expect(search).toContain('year=2026');
    expect(search).toContain('creator=u1');
    expect(search).toContain('offset=20');
    expect(screen.getAllByRole('listitem')).toHaveLength(20); // dòng thứ 21 chỉ để biết còn trang sau
    expect(screen.getByRole('link', { name: 'Sau ›' }).getAttribute('href')).toContain('p=3');
    expect(screen.getByRole('option', { name: 'Lan (3)' })).toBeTruthy();
  });
});
