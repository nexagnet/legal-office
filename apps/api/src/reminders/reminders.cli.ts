import pg from 'pg';
import { runRemindersForTenants, tenantIdsFromEnv } from './run-all';

/**
 * Gửi email nhắc hạn một lần (dùng khi muốn lịch ngoài ứng dụng: cron của máy chủ, Kubernetes, CI).
 * Lịch trong ứng dụng thì bật `REMINDERS_SCHEDULE=on` cho lo-api, không cần lệnh này. Cấu hình ở biến môi trường:
 *   DATABASE_URL=... TENANT_IDS=<uuid>,<uuid> MAIL_SETTINGS_KEY=<base64 32 byte> node dist/reminders/reminders.cli.js
 * SMTP lấy từ cấu hình Admin lưu trong ứng dụng; chưa có thì dùng SMTP_URL + MAIL_FROM nếu đặt.
 * Chạy bằng vai ứng dụng (có RLS), mỗi tenant một ngữ cảnh riêng. Tenant chưa có SMTP thì bỏ qua, không gửi gì.
 */
async function main(): Promise<void> {
  const tenants = tenantIdsFromEnv(process.env);
  if (!process.env.DATABASE_URL || tenants.length === 0) {
    throw new Error('Thiếu DATABASE_URL hoặc TENANT_IDS');
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const failed = await runRemindersForTenants(pool, tenants, process.env, console);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
