import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.itest.ts'],
    testTimeout: 30_000,
    // Các file itest cùng tạo role legal_app (CREATE ROLE không an toàn khi chạy song song).
    fileParallelism: false,
  },
});
