/* global process */
const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Trình duyệt chỉ nói chuyện với web (cùng origin) nên cookie phiên SameSite=Strict hoạt động.
  poweredByHeader: false,
  // Bản lưu tệp trên ổ đĩa: trình duyệt PUT tệp (tới 200MB) qua /api; mặc định Next cắt yêu cầu proxy sau 30 giây.
  // Trên production, Caddy đưa đường tải tệp thẳng tới API nên không đi qua đây.
  experimental: { proxyTimeout: 15 * 60 * 1000 },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
