import pg from 'pg';
import { resolveTenantMailer } from './resolve-mailer';
import { runRemindersForTenant } from './run-reminders';

/**
 * Gửi email nhắc hạn (chạy theo lịch, ví dụ mỗi giờ hoặc mỗi sáng). Cấu hình ở biến môi trường:
 *   DATABASE_URL=... TENANT_IDS=<uuid>,<uuid> MAIL_SETTINGS_KEY=<base64 32 byte> node dist/reminders/reminders.cli.js
 * SMTP lấy từ cấu hình Admin lưu trong ứng dụng; chưa có thì dùng SMTP_URL + MAIL_FROM nếu đặt.
 * Chạy bằng vai ứng dụng (có RLS), mỗi tenant một ngữ cảnh riêng. Tenant chưa có SMTP thì bỏ qua, không gửi gì.
 */
async function main(): Promise<void> {
  const { DATABASE_URL, TENANT_IDS } = process.env;
  if (!DATABASE_URL || !TENANT_IDS) throw new Error('Thiếu DATABASE_URL hoặc TENANT_IDS');
  const tenants = TENANT_IDS.split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '');
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  let failed = 0;
  try {
    for (const tenantId of tenants) {
      try {
        const mailer = await resolveTenantMailer(pool, tenantId, process.env);
        if (!mailer) {
          console.log(`tenant ${tenantId}: chưa cấu hình SMTP, bỏ qua`);
          continue;
        }
        const r = await runRemindersForTenant(pool, tenantId, mailer);
        failed += r.failed;
        console.log(`tenant ${tenantId}: đã gửi ${r.sent} thư, lỗi ${r.failed}`);
      } catch (error) {
        failed += 1;
        console.error(`tenant ${tenantId}: ${error instanceof Error ? error.message : error}`);
      }
    }
  } finally {
    await pool.end();
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
