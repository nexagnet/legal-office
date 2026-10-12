/** @type {import('next').NextConfig} */
const nextConfig = {
  // Linting runs through the workspace `lint` script (ESLint flat config).
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
