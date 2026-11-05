import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
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

import LegacyDocumentsPage from './dms/tai-lieu-cu/page';
import { LegacyOpenButton } from '../components/LegacyOpenButton';
import { legacyFolderOf, legacySizeLabel } from '../lib/dms-legacy';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const row = (over: Record<string, unknown>) => ({
  id: 'f1',
  batch_id: 'b1',
  rel_path: '2019/Hợp đồng/hd-001.pdf',
  file_name: 'hd-001.pdf',
  size_bytes: 2048,
  sha256: 'a'.repeat(64),
  mime: 'application/pdf',
  source_mtime: '2019-05-02T03:00:00Z',
  created_at: '2026-11-01T03:00:00Z',
  ...over,
});

function stubApi(permissions: string[], rows: unknown[]) {
  const urls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    urls.push(url);
    const json = (b: unknown) => ({ ok: true, json: async () => b }) as Response;
    if (url.includes('/dms/me/permissions')) return json({ permissions });
    if (url.includes('/dms/legacy/files')) return json({ rows, limit: 51, offset: 0 });
    return json({ rows: [] });
  });
  return urls;
}

const page = async (sp: { prefix?: string; p?: string } = {}) =>
  render(await LegacyDocumentsPage({ searchParams: Promise.resolve(sp) }));

describe('Tài liệu cũ: danh sách', () => {
  it('người có quyền xem thấy tệp, thư mục, dung lượng và nút Mở', async () => {
    const urls = stubApi(
      ['dms.legacy.read'],
      [row({}), row({ id: 'f2', rel_path: 'ghi-chu.txt', file_name: 'ghi-chu.txt' })],
    );
    await page({ prefix: '2019/' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tài liệu cũ');
    expect(screen.getByText('hd-001.pdf')).toBeTruthy();
    expect(screen.getByRole('link', { name: '2019/Hợp đồng' }).getAttribute('href')).toBe(
      '/dms/tai-lieu-cu?prefix=2019%2FH%E1%BB%A3p+%C4%91%E1%BB%93ng%2F',
    );
    expect(screen.getByText('Gốc')).toBeTruthy();
    expect(screen.getAllByText('2 KB')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Mở / })).toHaveLength(2);
    const call = urls.find((u) => u.includes('/dms/legacy/files')) ?? '';
    expect(call).toContain('officeId=o1');
    expect(call).toContain('prefix=2019%2F');
    expect(call).toContain('limit=51');
  });

  it('không có tệp thì báo trống', async () => {
    stubApi(['dms.legacy.read'], []);
    await page();
    expect(screen.getByText('Chưa có tài liệu cũ nào')).toBeTruthy();
  });

  it('có lọc mà không khớp thì gợi ý bỏ lọc', async () => {
    stubApi(['dms.legacy.read'], []);
    await page({ prefix: 'khong-co/' });
    expect(screen.getByText('Không có tệp nào khớp thư mục này')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Bỏ lọc' }).getAttribute('href')).toBe(
      '/dms/tai-lieu-cu',
    );
  });

  it('thiếu quyền chỉ thấy thông báo và không gọi danh sách', async () => {
    const urls = stubApi([], [row({})]);
    await page();
    expect(screen.getByText('Bạn chưa có quyền xem tài liệu cũ')).toBeTruthy();
    expect(urls.some((u) => u.includes('/dms/legacy/files'))).toBe(false);
  });

  it('còn trang sau thì có liên kết sang trang 2 và chỉ hiện 50 tệp', async () => {
    const rows = Array.from({ length: 51 }, (_, i) =>
      row({ id: `f${i}`, file_name: `t${i}.pdf`, rel_path: `t${i}.pdf` }),
    );
    stubApi(['dms.legacy.read'], rows);
    await page();
    expect(screen.getAllByRole('button', { name: /^Mở / })).toHaveLength(50);
    expect(screen.getByRole('link', { name: 'Trang sau' }).getAttribute('href')).toBe(
      '/dms/tai-lieu-cu?p=2',
    );
  });
});

describe('Tài liệu cũ: tiện ích', () => {
  it('tách thư mục và định dạng dung lượng', () => {
    expect(legacyFolderOf('a/b/c.pdf')).toBe('a/b');
    expect(legacyFolderOf('c.pdf')).toBe('');
    expect(legacySizeLabel(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(legacySizeLabel(3 * 1024 ** 3)).toBe('3.0 GB');
  });
});

describe('Tài liệu cũ: nút Mở', () => {
  it('kho R2 trả liên kết thì mở liên kết đó ở tab mới', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ url: 'https://r2.example/x' }),
    } as Response);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<LegacyOpenButton id="f1" name="hd-001.pdf" />);
    fireEvent.click(screen.getByRole('button', { name: 'Mở hd-001.pdf' }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('https://r2.example/x', '_blank', 'noopener,noreferrer'),
    );
  });

  it('lỗi 404 thì báo không tìm thấy tệp', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response);
    render(<LegacyOpenButton id="f1" name="hd-001.pdf" />);
    fireEvent.click(screen.getByRole('button', { name: 'Mở hd-001.pdf' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Không tìm thấy'));
  });
});
