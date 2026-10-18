import pg from 'pg';
import { createSmtpMailer } from './mailer';
import { runRemindersForTenant } from './run-reminders';

/**
 * Gửi email nhắc hạn (chạy theo lịch, ví dụ mỗi giờ hoặc mỗi sáng). Toàn bộ cấu hình ở biến môi trường:
 *   DATABASE_URL=... TENANT_IDS=<uuid>,<uuid> SMTP_URL=smtps://user:pass@host:465 MAIL_FROM="Legal Office <no-reply@...>" \
 *     node dist/reminders/reminders.cli.js
 * Chạy bằng vai ứng dụng (có RLS), mỗi tenant một ngữ cảnh riêng. Thiếu SMTP_URL thì dừng, không gửi gì.
 */
async function main(): Promise<void> {
  const { DATABASE_URL, TENANT_IDS, SMTP_URL, MAIL_FROM } = process.env;
  if (!DATABASE_URL || !TENANT_IDS || !SMTP_URL || !MAIL_FROM) {
    throw new Error('Thiếu DATABASE_URL, TENANT_IDS, SMTP_URL hoặc MAIL_FROM');
  }
  const tenants = TENANT_IDS.split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '');
  const mailer = createSmtpMailer(SMTP_URL, MAIL_FROM);
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  let failed = 0;
  try {
    for (const tenantId of tenants) {
      const r = await runRemindersForTenant(pool, tenantId, mailer);
      failed += r.failed;
      console.log(`tenant ${tenantId}: đã gửi ${r.sent} thư, lỗi ${r.failed}`);
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
