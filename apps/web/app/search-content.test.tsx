import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/',
}));
vi.mock('../lib/server', () => ({
  API_URL: 'http://api',
  requestCookie: async () => 'sid=1',
  currentSession: async () => ({ status: 'unauthenticated' }),
}));

import { SearchPalette } from '../components/SearchPalette';
import { DMS_DOMAINS, VAN_THU_DOMAINS } from '../lib/dms';
import { DMS_DOMAIN_SLUG, dmsCaseDocsHref } from '../lib/dms-domain-slugs';
import { highlightParts, highlightTerms } from '../lib/highlight';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  push.mockReset();
});

describe('tô sáng từ khóa', () => {
  const hits = (text: string, q: string) =>
    highlightParts(text, q)
      .filter((p) => p.hit)
      .map((p) => p.text);

  it('gõ không dấu vẫn tô chữ có dấu, không phân biệt hoa thường', () => {
    expect(hits('Hợp đồng thuê nhà số 12', 'hop dong')).toEqual(['Hợp đồng']);
    expect(hits('HỢP ĐỒNG', 'hợp đồng')).toEqual(['HỢP ĐỒNG']);
    expect(hits('Đường Lê Lợi', 'duong')).toEqual(['Đường']);
  });

  it('tô mọi lần xuất hiện và ghép đúng văn bản gốc', () => {
    const parts = highlightParts('nhà A, nhà B', 'nha');
    expect(parts.map((p) => p.text).join('')).toBe('nhà A, nhà B');
    expect(parts.filter((p) => p.hit)).toHaveLength(2);
  });

  it('bỏ từ một chữ cái và từ khóa rỗng thì không tô gì', () => {
    expect(highlightTerms('a  bc  BC')).toEqual(['bc']);
    expect(hits('abc', '')).toEqual([]);
    expect(highlightParts('', 'abc')).toEqual([]);
  });
});

describe('bảng mã nghiệp vụ cho hộp tìm kiếm', () => {
  it('khớp với danh sách nghiệp vụ của lib/dms', () => {
    const expected = Object.fromEntries(
      [...DMS_DOMAINS, ...VAN_THU_DOMAINS].map((d) => [d.code, d.slug]),
    );
    expect(DMS_DOMAIN_SLUG).toEqual(expected);
  });

  it('dựng đường mở hồ sơ ở tab Tài liệu, mã lạ thì null', () => {
    expect(dmsCaseDocsHref('vibang', 'c1')).toBe('/dms/vi-bang/c1?tab=tai-lieu');
    expect(dmsCaseDocsHref('khong-co', 'c1')).toBeNull();
  });
});

describe('hộp tìm kiếm: nhóm "Trong nội dung tài liệu"', () => {
  let searchCalls: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    searchCalls = [];
  });

  function stubFetch(rows: unknown[] | 'error') {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/dms/search')) {
        searchCalls.push(url);
        if (rows === 'error') return { ok: false, status: 500 } as Response;
        return { ok: true, json: async () => ({ rows }) } as Response;
      }
      return { ok: true, json: async () => ({ items: [] }) } as Response;
    });
  }

  const hit = {
    case_id: 'c1',
    case_title: 'Vi bằng 012/2026',
    domain: 'vibang',
    document_title: 'Hợp đồng thuê nhà',
    file_id: 'f1',
    file_label: 'hd.pdf',
    snippet: 'bên A cho thuê nhà theo hợp đồng này',
  };

  async function openAndType(text: string, officeId: string | null = 'o1') {
    render(<SearchPalette items={[]} officeId={officeId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    fireEvent.change(screen.getByLabelText('Từ khóa tìm kiếm'), { target: { value: text } });
  }
  const wait = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  it('chờ 300 ms mới gọi máy chủ và chỉ gọi một lần khi gõ liên tục', async () => {
    stubFetch([hit]);
    await openAndType('ho');
    await wait(200);
    fireEvent.change(screen.getByLabelText('Từ khóa tìm kiếm'), { target: { value: 'hop dong' } });
    await wait(299);
    expect(searchCalls).toHaveLength(0);
    await wait(2);
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0]).toContain('officeId=o1');
    expect(searchCalls[0]).toContain('q=hop+dong');
    expect(searchCalls[0]).toContain('limit=5');
  });

  it('hiện tên hồ sơ, tên tài liệu, đoạn trích có tô sáng; bấm mở hồ sơ', async () => {
    stubFetch([hit]);
    await openAndType('hop dong');
    await wait(400);
    expect(screen.getByText('Trong nội dung tài liệu')).toBeTruthy();
    expect(screen.getByText('Vi bằng 012/2026')).toBeTruthy();
    expect(screen.getByText('Hợp đồng thuê nhà · hd.pdf')).toBeTruthy();
    const marks = document.querySelectorAll('.search-snippet mark');
    expect([...marks].map((m) => m.textContent)).toEqual(['hợp đồng']);
    fireEvent.click(screen.getByRole('button', { name: /Vi bằng 012\/2026/ }));
    expect(push).toHaveBeenCalledWith('/dms/vi-bang/c1?tab=tai-lieu');
  });

  it('"Xem tất cả kết quả" và Enter khi không có trang khớp đều sang trang kết quả đầy đủ', async () => {
    stubFetch([hit]);
    await openAndType('hop dong');
    await wait(400);
    fireEvent.click(screen.getByRole('button', { name: 'Xem tất cả kết quả' }));
    expect(push).toHaveBeenCalledWith('/dms/tim-kiem?q=hop%20dong');
    push.mockReset();
    cleanup();
    stubFetch([]);
    await openAndType('zzz khong co');
    fireEvent.keyDown(screen.getByLabelText('Từ khóa tìm kiếm'), { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/dms/tim-kiem?q=zzz%20khong%20co');
  });

  it('không có kết quả thì báo rõ; lỗi máy chủ thì báo lỗi', async () => {
    stubFetch([]);
    await openAndType('khong co');
    await wait(400);
    expect(screen.getByText(/Không có tài liệu nào có chữ/)).toBeTruthy();
    cleanup();
    vi.restoreAllMocks();
    stubFetch('error');
    await openAndType('loi may chu');
    await wait(400);
    expect(screen.getByRole('alert').textContent).toContain('Không tìm được trong nội dung');
  });

  it('gõ dưới 2 ký tự hoặc không có văn phòng thì không tìm trong nội dung', async () => {
    stubFetch([hit]);
    await openAndType('h');
    await wait(500);
    expect(searchCalls).toHaveLength(0);
    cleanup();
    await openAndType('hop dong', null);
    await wait(500);
    expect(searchCalls).toHaveLength(0);
    expect(screen.queryByText('Trong nội dung tài liệu')).toBeNull();
  });
});
