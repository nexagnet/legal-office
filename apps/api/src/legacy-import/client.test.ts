import { describe, expect, it } from 'vitest';
import { ApiError, ImportApi, normalizeCookie } from './client';
import { toLongPath } from './scan';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('cookie dán từ trình duyệt', () => {
  it('chấp nhận nhiều dạng dán', () => {
    expect(normalizeCookie('abc')).toBe('lo_session=abc');
    expect(normalizeCookie('  lo_session=abc ')).toBe('lo_session=abc');
    expect(normalizeCookie('Cookie: lo_session=abc')).toBe('lo_session=abc');
    expect(normalizeCookie('"abc"')).toBe('lo_session=abc');
  });
});

describe('phiên đăng nhập hết hạn giữa chừng', () => {
  it('hỏi cookie mới đúng MỘT lần dù nhiều yêu cầu cùng gặp 401, rồi thử lại bằng cookie mới', async () => {
    const seen: (string | null)[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const cookie = new Headers(init.headers).get('cookie');
      seen.push(cookie);
      return cookie === 'lo_session=moi'
        ? json(200, { status: 'OPEN', fileCount: 1 })
        : json(401, { code: 'UNAUTHORIZED' });
    }) as unknown as typeof fetch;
    let asked = 0;
    const api = new ImportApi({
      baseUrl: 'http://x',
      headers: { cookie: 'lo_session=cu' },
      fetchImpl,
      sleep: () => Promise.resolve(),
      onUnauthorized: () => {
        asked++;
        return Promise.resolve('moi');
      },
    });
    const [a, b, c] = await Promise.all([api.report('1'), api.report('2'), api.report('3')]);
    expect([a.fileCount, b.fileCount, c.fileCount]).toEqual([1, 1, 1]);
    expect(asked).toBe(1);
    expect(seen.filter((x) => x === 'lo_session=cu')).toHaveLength(3);
  });

  it('không có cookie mới thì báo 401, không thử lại vô hạn', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return json(401, { code: 'UNAUTHORIZED' });
    }) as unknown as typeof fetch;
    const api = new ImportApi({
      baseUrl: 'http://x',
      headers: { cookie: 'lo_session=cu' },
      fetchImpl,
      sleep: () => Promise.resolve(),
      onUnauthorized: () => Promise.resolve(null),
    });
    await expect(api.report('1')).rejects.toMatchObject({ status: 401 });
    expect(calls).toBe(1);
  });

  it('cookie mới vẫn bị từ chối thì dừng sau vài lần hỏi', async () => {
    const fetchImpl = (async () => json(401, { code: 'UNAUTHORIZED' })) as unknown as typeof fetch;
    let asked = 0;
    const api = new ImportApi({
      baseUrl: 'http://x',
      headers: {},
      fetchImpl,
      sleep: () => Promise.resolve(),
      onUnauthorized: () => {
        asked++;
        return Promise.resolve('van-sai');
      },
    });
    await expect(api.report('1')).rejects.toBeInstanceOf(ApiError);
    expect(asked).toBe(3);
  });
});

describe('đường dẫn dài trên Windows', () => {
  it('thêm tiền tố \\\\?\\ cho ổ đĩa và UNC, giữ nguyên nơi khác', () => {
    expect(toLongPath('D:\\Kho', 'win32')).toBe('\\\\?\\D:\\Kho');
    expect(toLongPath('\\\\may\\chia-se\\Kho', 'win32')).toBe('\\\\?\\UNC\\may\\chia-se\\Kho');
    expect(toLongPath('\\\\?\\D:\\Kho', 'win32')).toBe('\\\\?\\D:\\Kho');
    expect(toLongPath('/home/x', 'linux')).toBe('/home/x');
  });
});
