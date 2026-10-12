/** Phần tối thiểu của Express mà các middleware này dùng (tránh phụ thuộc kiểu của Express). */
interface Req {
  readonly path: string;
  readonly ip?: string;
}
interface Res {
  setHeader(name: string, value: string): unknown;
  removeHeader(name: string): unknown;
  status(code: number): Res;
  json(body: unknown): unknown;
}
type Next = () => void;

/** Header an toàn cho một API chỉ trả JSON: không đoán kiểu, không nhúng khung, không lưu đệm, không lộ referrer. */
export function securityHeaders(): (req: Req, res: Res, next: Next) => void {
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.removeHeader('X-Powered-By');
    next();
  };
}

export interface RateLimitRule {
  /** Áp cho đường dẫn bắt đầu bằng tiền tố này. */
  readonly prefix: string;
  readonly limit: number;
  readonly windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Giới hạn tần suất theo (địa chỉ, quy tắc) trong cửa sổ cố định. Bộ đếm nằm trong bộ nhớ của MỘT tiến trình:
 * đủ chống dò mật khẩu/spam đơn giản; chạy nhiều bản cần thay bằng kho dùng chung (xem docs/architecture/http-hardening.md).
 * Quy tắc đầu tiên khớp tiền tố được dùng; quy tắc cuối thường là tiền tố rỗng (mặc định).
 */
export function rateLimit(
  rules: readonly RateLimitRule[],
  now: () => number = Date.now,
): (req: Req, res: Res, next: Next) => void {
  const buckets = new Map<string, Bucket>();
  return (req, res, next) => {
    const rule = rules.find((r) => req.path.startsWith(r.prefix));
    if (!rule) return next();
    const t = now();
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
    }
    const key = `${rule.prefix}|${req.ip ?? 'unknown'}`;
    let b = buckets.get(key);
    if (!b || b.resetAt <= t) {
      b = { count: 0, resetAt: t + rule.windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > rule.limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((b.resetAt - t) / 1000))));
      res.status(429).json({ code: 'RATE_LIMITED', label: null });
      return;
    }
    next();
  };
}

export const DEFAULT_RATE_RULES: readonly RateLimitRule[] = [
  { prefix: '/auth/login', limit: 20, windowMs: 60_000 },
  { prefix: '', limit: 600, windowMs: 60_000 },
];
