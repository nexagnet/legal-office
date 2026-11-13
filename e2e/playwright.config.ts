import { defineConfig } from '@playwright/test';

/** Smoke E2E chạy trên stack thật do `e2e/start-stack.sh` dựng (web 3100, API 3001). Không tự khởi động máy chủ ở đây. */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'off',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  },
});
