/* global process, console, fetch, performance */
// Đo độ trễ trang và API trên một bản triển khai (docs/ui/motion-and-loading-plan.md, PR 0).
//
//   BASE_URL=https://<lo-web> node scripts/measure-latency.mjs
//   BASE_URL=... COOKIE='<cookie phiên>' RUNS=10 node scripts/measure-latency.mjs
//
// COOKIE (tuỳ chọn) lấy từ trình duyệt đã đăng nhập; không có thì chỉ đo được các đường công khai.
// Kết quả là bảng Markdown (p50/p95 của TTFB và tổng) để dán vào tài liệu kế hoạch. Không in cookie ra.

const base = (process.env.BASE_URL ?? '').replace(/\/$/, '');
const runs = Number(process.env.RUNS ?? 8);
const cookie = process.env.COOKIE;

if (!base) {
  console.error(
    'Thiếu BASE_URL, ví dụ: BASE_URL=https://lo-web.example node scripts/measure-latency.mjs',
  );
  process.exit(1);
}

const PATHS = [
  ['Trang đăng nhập', '/login'],
  ['Tổng quan', '/'],
  ['Danh sách Vi bằng', '/vi-bang'],
  ['Việc của tôi', '/viec-cua-toi'],
  ['Hộp duyệt', '/hop-duyet'],
  ['API phiên', '/api/auth/me'],
  ['API hồ sơ Vi bằng', '/api/vibang/cases?limit=100'],
];

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
const ms = (n) => `${Math.round(n)} ms`;

async function once(path) {
  const t0 = performance.now();
  const res = await fetch(base + path, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
    cache: 'no-store',
  });
  const ttfb = performance.now() - t0;
  await res.arrayBuffer();
  return { status: res.status, ttfb, total: performance.now() - t0 };
}

const rows = [];
for (const [label, path] of PATHS) {
  const samples = [];
  let status = '-';
  for (let i = 0; i < runs; i++) {
    try {
      const r = await once(path);
      status = r.status;
      samples.push(r);
    } catch (e) {
      status = `lỗi: ${e instanceof Error ? e.message : String(e)}`;
      break;
    }
  }
  const ttfb = samples.map((s) => s.ttfb).sort((a, b) => a - b);
  const total = samples.map((s) => s.total).sort((a, b) => a - b);
  rows.push(
    ttfb.length === 0
      ? `| ${label} | ${path} | ${status} | - | - | - |`
      : `| ${label} | ${path} | ${status} | ${ms(quantile(ttfb, 0.5))} | ${ms(quantile(ttfb, 0.95))} | ${ms(quantile(total, 0.5))} |`,
  );
}

console.log(
  `Đo ${runs} lần mỗi đường, ${new Date().toISOString()}, ${base}${cookie ? ' (có phiên)' : ' (không đăng nhập)'}\n`,
);
console.log('| Mục | Đường | Mã | TTFB p50 | TTFB p95 | Tổng p50 |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) console.log(r);
console.log('\nLần đầu có thể chậm do khởi động nguội: chạy lại để so sánh.');
