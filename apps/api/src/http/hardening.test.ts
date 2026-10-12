import { describe, expect, it, vi } from 'vitest';
import { rateLimit, securityHeaders } from './hardening';

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
const req = (path: string, ip = '1.1.1.1') => ({ path, ip }) as never;

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
