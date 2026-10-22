import { Cron } from 'croner';
import type pg from 'pg';
import { runRemindersForTenants, tenantIdsFromEnv, type RemindersLog } from './run-all';

/** Mặc định 7:30 sáng giờ Việt Nam mỗi ngày. */
export const DEFAULT_REMINDER_CRON = '30 7 * * *';
export const REMINDER_TIMEZONE = 'Asia/Ho_Chi_Minh';
/** Khoá advisory của Postgres: nhiều bản lo-api cùng chạy thì chỉ một bản gửi mỗi lượt. */
const LOCK_KEY = 'legal-office:reminders';

/** Một lượt gửi. Không giành được khoá (bản khác đang gửi) thì bỏ qua; trả về có chạy hay không. */
export async function runRemindersOnce(
  pool: pg.Pool,
  env: NodeJS.ProcessEnv,
  log: RemindersLog,
): Promise<boolean> {
  const tenants = tenantIdsFromEnv(env);
  if (tenants.length === 0) {
    log.error('REMINDERS_SCHEDULE=on nhưng thiếu REMINDER_TENANT_IDS');
    return false;
  }
  const lockClient = await pool.connect();
  try {
    const got = await lockClient.query<{ ok: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS ok',
      [LOCK_KEY],
    );
    if (!got.rows[0]?.ok) {
      log.info('nhắc hạn: bản khác đang gửi, bỏ qua lượt này');
      return false;
    }
    try {
      const failed = await runRemindersForTenants(pool, tenants, env, log);
      if (failed > 0) log.error(`nhắc hạn: ${failed} thư hoặc tenant lỗi, lượt sau thử lại`);
      return true;
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]);
    }
  } finally {
    lockClient.release();
  }
}

/**
 * Lịch gửi nhắc hạn chạy trong chính ứng dụng, không phụ thuộc dịch vụ lịch của nền tảng host.
 * Bật bằng `REMINDERS_SCHEDULE=on`; giờ chạy `REMINDERS_CRON` (mặc định 7:30 giờ Việt Nam).
 */
export function startReminderSchedule(
  pool: pg.Pool,
  env: NodeJS.ProcessEnv,
  log: RemindersLog,
): () => void {
  const pattern = env.REMINDERS_CRON || DEFAULT_REMINDER_CRON;
  const job = new Cron(
    pattern,
    { timezone: REMINDER_TIMEZONE, protect: true, unref: true },
    async () => {
      try {
        await runRemindersOnce(pool, env, log);
      } catch (error) {
        log.error(`nhắc hạn: ${error instanceof Error ? error.message : error}`);
      }
    },
  );
  log.info(
    `nhắc hạn: lịch "${pattern}" (${REMINDER_TIMEZONE}), lượt kế ${job.nextRun()?.toISOString()}`,
  );
  return () => job.stop();
}
