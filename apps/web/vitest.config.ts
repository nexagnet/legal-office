import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['app/**/*.test.tsx'],
    // Lần dựng đầu tiên của AppShell (nhiều biểu tượng, menu) có lúc quá 5 giây khi cả bộ test chạy song song.
    testTimeout: 15_000,
  },
});
