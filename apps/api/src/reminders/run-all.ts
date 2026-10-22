import type pg from 'pg';
import { resolveTenantMailer } from './resolve-mailer';
import { runRemindersForTenant } from './run-reminders';

export interface RemindersLog {
  info(message: string): void;
  error(message: string): void;
}

/** Danh sách tenant gửi nhắc hạn, ngăn cách bằng dấu phẩy (`REMINDER_TENANT_IDS`, cũ hơn là `TENANT_IDS`). */
export function tenantIdsFromEnv(env: NodeJS.ProcessEnv): string[] {
  return (env.REMINDER_TENANT_IDS || env.TENANT_IDS || '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '');
}

/**
 * Gửi nhắc hạn cho từng tenant, mỗi tenant độc lập: tenant lỗi không chặn tenant sau.
 * Tenant chưa có SMTP thì bỏ qua. Trả số thư lỗi và tenant lỗi (để lịch chạy ghi nhận, lệnh CLI đặt mã thoát).
 */
export async function runRemindersForTenants(
  pool: pg.Pool,
  tenantIds: readonly string[],
  env: NodeJS.ProcessEnv,
  log: RemindersLog,
): Promise<number> {
  let failed = 0;
  for (const tenantId of tenantIds) {
    try {
      const mailer = await resolveTenantMailer(pool, tenantId, env);
      if (!mailer) {
        log.info(`tenant ${tenantId}: chưa cấu hình SMTP, bỏ qua`);
        continue;
      }
      const r = await runRemindersForTenant(pool, tenantId, mailer);
      failed += r.failed;
      log.info(`tenant ${tenantId}: đã gửi ${r.sent} thư, lỗi ${r.failed}`);
    } catch (error) {
      failed += 1;
      log.error(`tenant ${tenantId}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return failed;
}
