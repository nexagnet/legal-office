/* global process */
const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Trình duyệt chỉ nói chuyện với web (cùng origin) nên cookie phiên SameSite=Strict hoạt động.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
