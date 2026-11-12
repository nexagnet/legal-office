import { describe, expect, it, vi } from 'vitest';
import { rateLimit, rateRulesFromEnv, securityHeaders } from './hardening';

const res = () => {
  const headers: Record<string, string> = {};
  const r = {
    headers,
    statusCode: 200,
    body: undefined as unknown,
    setHeader: (k: string, v: string) => (headers[k] = v),
    removeHeader: vi.fn(),
    status(c: number) {
      r.statusCode = c;
      return r;
    },
    json(b: unknown) {
      r.body = b;
      return r;
    },
  };
  return r;
};
const req = (path: string, ip = '1.1.1.1', method = 'GET') => ({ path, ip, method }) as never;

describe('securityHeaders', () => {
  it('sets restrictive headers and continues', () => {
    const r = res();
    const next = vi.fn();
    securityHeaders()(req('/x'), r as never, next as never);
    expect(r.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(r.headers['X-Frame-Options']).toBe('DENY');
    expect(r.headers['Cache-Control']).toBe('no-store');
    expect(r.removeHeader).toHaveBeenCalledWith('X-Powered-By');
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('rateLimit', () => {
  const rules = [
    { prefix: '/auth/login', limit: 2, windowMs: 1000 },
    { prefix: '', limit: 5, windowMs: 1000 },
  ];

  it('blocks after the limit with Retry-After and resets after the window', () => {
    let t = 0;
    const mw = rateLimit(rules, () => t);
    const next = vi.fn();
    for (let i = 0; i < 2; i++) mw(req('/auth/login'), res() as never, next);
    expect(next).toHaveBeenCalledTimes(2);
    const blocked = res();
    mw(req('/auth/login'), blocked as never, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['Retry-After']).toBe('1');
    expect(blocked.body).toEqual({ code: 'RATE_LIMITED', label: null });
    t = 1001;
    mw(req('/auth/login'), res() as never, next);
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('counts per address and per rule', () => {
    const mw = rateLimit(rules, () => 0);
    const next = vi.fn();
    for (let i = 0; i < 2; i++) mw(req('/auth/login', 'a'), res() as never, next);
    mw(req('/auth/login', 'b'), res() as never, next);
    mw(req('/vibang/cases', 'a'), res() as never, next);
    expect(next).toHaveBeenCalledTimes(4);
  });
});

describe('rateRulesFromEnv', () => {
  it('uses higher default for reads than writes and keeps auth strict', () => {
    const rules = rateRulesFromEnv({});
    const read = rules.find((r) => r.methods?.includes('GET'));
    const write = rules.find((r) => r.prefix === '' && !r.methods);
    expect(read?.limit).toBe(3000);
    expect(write?.limit).toBe(600);
    expect(rules.find((r) => r.prefix === '/auth/login')?.limit).toBe(20);
  });

  it('reads overrides from env and ignores invalid values', () => {
    const rules = rateRulesFromEnv({
      RATE_LIMIT_READ_PER_MIN: '5000',
      RATE_LIMIT_WRITE_PER_MIN: 'abc',
      RATE_LIMIT_AUTH_PER_MIN: '-1',
    });
    expect(rules.find((r) => r.methods?.includes('GET'))?.limit).toBe(5000);
    expect(rules.find((r) => r.prefix === '' && !r.methods)?.limit).toBe(600);
    expect(rules.find((r) => r.prefix === '/auth/login')?.limit).toBe(20);
  });

  it('counts reads and writes in separate buckets per address', () => {
    const mw = rateLimit(
      rateRulesFromEnv({ RATE_LIMIT_READ_PER_MIN: '3', RATE_LIMIT_WRITE_PER_MIN: '1' }),
      () => 0,
    );
    const next = vi.fn();
    for (let i = 0; i < 3; i++) mw(req('/dms/cases', '2.2.2.2', 'GET'), res() as never, next);
    mw(req('/dms/cases', '2.2.2.2', 'POST'), res() as never, next);
    expect(next).toHaveBeenCalledTimes(4);
    const blockedRead = res();
    mw(req('/dms/cases', '2.2.2.2', 'GET'), blockedRead as never, next);
    expect(blockedRead.statusCode).toBe(429);
    const blockedWrite = res();
    mw(req('/dms/cases', '2.2.2.2', 'POST'), blockedWrite as never, next);
    expect(blockedWrite.statusCode).toBe(429);
  });
});
