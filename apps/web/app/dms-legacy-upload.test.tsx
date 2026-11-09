import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../lib/server', () => ({
  API_URL: 'http://api',
  requestCookie: async () => 'sid=1',
  currentSession: async () => ({
    status: 'authenticated',
    roles: [],
    tenantName: 'T',
    memberships: [{ officeId: 'o1' }],
    branches: [],
  }),
}));

import LegacyDocumentsPage from './dms/tai-lieu-cu/page';
import {
  legacyMimeOf,
  legacyRelPath,
  uploadLegacyFile,
  type LegacyUploadDeps,
} from '../lib/legacy-upload';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const file = (name = 'a.pdf', body = 'noi dung') =>
  new File([body], name, { type: 'application/pdf' });
const hooks = { onStep: () => undefined, onProgress: () => undefined };
const deps = (over: Partial<LegacyUploadDeps> = {}): LegacyUploadDeps => ({
  hash: async () => 'a'.repeat(64),
  put: async () => true,
  fetchJson: async (path) =>
    path.endsWith('/prepare')
      ? {
          status: 201,
          json: {
            status: 'UPLOAD',
            url: 'https://r2/x',
            headers: { 'x-amz-checksum-sha256': 'zz' },
          },
        }
      : { status: 201, json: { status: 'REGISTERED', fileId: 'f1' } },
  ...over,
});

describe('tải tài liệu cũ: từng tệp', () => {
  it('đường dẫn và loại tệp', () => {
    expect(legacyRelPath('2019/../Hợp đồng\\', 'a/b.pdf')).toBe('2019/Hợp đồng/a_b.pdf');
    expect(legacyRelPath('', 'x.pdf')).toBe('x.pdf');
    expect(legacyMimeOf('Scan.JPG', '')).toBe('image/jpeg');
    expect(legacyMimeOf('x.bin', '')).toBe('application/octet-stream');
  });

  it('chuẩn bị, PUT rồi đăng ký', async () => {
    const put = vi.fn(async () => true);
    const r = await uploadLegacyFile('b1', file(), 'a.pdf', hooks, deps({ put }));
    expect(r).toMatchObject({ ok: true, deduplicated: false, fileId: 'f1' });
    expect(put).toHaveBeenCalledWith(
      'https://r2/x',
      { 'x-amz-checksum-sha256': 'zz' },
      expect.anything(),
      expect.anything(),
    );
  });

  it('nội dung đã có thì không PUT', async () => {
    const put = vi.fn(async () => true);
    const r = await uploadLegacyFile(
      'b1',
      file(),
      'a.pdf',
      hooks,
      deps({
        put,
        fetchJson: async () => ({
          status: 201,
          json: { status: 'REGISTERED', deduplicated: true, fileId: 'f9' },
        }),
      }),
    );
    expect(r).toMatchObject({ ok: true, deduplicated: true, fileId: 'f9' });
    expect(put).not.toHaveBeenCalled();
  });

  it('lỗi mạng, PUT hỏng, API từ chối, tệp rỗng đều báo mã rõ ràng', async () => {
    expect(
      (await uploadLegacyFile('b', file(), 'a', hooks, deps({ put: async () => false }))).code,
    ).toBe('PUT_FAILED');
    expect(
      (
        await uploadLegacyFile(
          'b',
          file(),
          'a',
          hooks,
          deps({
            hash: async () => {
              throw new Error('x');
            },
          }),
        )
      ).code,
    ).toBe('NETWORK');
    expect(
      (
        await uploadLegacyFile(
          'b',
          file(),
          'a',
          hooks,
          deps({ fetchJson: async () => ({ status: 409, json: { code: 'BATCH_CLOSED' } }) }),
        )
      ).code,
    ).toBe('BATCH_CLOSED');
    expect((await uploadLegacyFile('b', file('e.pdf', ''), 'e.pdf', hooks, deps())).code).toBe(
      'EMPTY_FILE',
    );
  });
});

function stub(features: { ocr: boolean; search: boolean }, perms: string[]) {
  const urls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    urls.push(url);
    const json = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as Response;
    if (url.includes('/me/permissions')) return json({ permissions: perms });
    if (url.includes('/legacy/features')) return json(features);
    if (url.includes('/legacy/files')) return json({ rows: [], limit: 51, offset: 0 });
    return json({ rows: [] });
  });
  return urls;
}
const page = async (sp = {}) =>
  render(await LegacyDocumentsPage({ searchParams: Promise.resolve(sp) }));

describe('công tắc OCR và tìm kiếm tài liệu cũ (độc lập)', () => {
  it('cả hai tắt: không có ô tìm nội dung, không gọi API tìm kiếm', async () => {
    const urls = stub({ ocr: false, search: false }, ['dms.legacy.read']);
    await page({ q: 'hop dong' });
    expect(screen.queryByRole('search', { name: 'Tìm theo nội dung' })).toBeNull();
    expect(urls.some((u) => u.includes('/legacy/search'))).toBe(false);
  });

  it('chỉ bật tìm kiếm: có ô tìm, không gọi trạng thái OCR', async () => {
    const urls = stub({ ocr: false, search: true }, ['dms.legacy.read']);
    await page({ q: 'hop dong' });
    expect(screen.getByRole('search', { name: 'Tìm theo nội dung' })).toBeTruthy();
    expect(urls.some((u) => u.includes('/legacy/search'))).toBe(true);
    expect(urls.some((u) => u.includes('/legacy/ocr-status'))).toBe(false);
  });

  it('chỉ có quyền xem thì không thấy nút tải lên; có quyền nhập thì thấy', async () => {
    stub({ ocr: true, search: false }, ['dms.legacy.read']);
    await page();
    expect(screen.queryByRole('link', { name: 'Tải tài liệu cũ lên' })).toBeNull();
    cleanup();
    stub({ ocr: true, search: false }, ['dms.legacy.read', 'dms.legacy.import']);
    await page();
    expect(screen.getByRole('link', { name: 'Tải tài liệu cũ lên' }).getAttribute('href')).toBe(
      '/dms/tai-lieu-cu/tai-len',
    );
  });
});
