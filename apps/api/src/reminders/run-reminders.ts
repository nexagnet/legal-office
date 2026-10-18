import type pg from 'pg';
import { buildDigests, type PendingReminder } from './digest';
import type { Mailer } from './mailer';

export interface ReminderRunResult {
  readonly tenantId: string;
  readonly sent: number;
  readonly failed: number;
}

async function inTenant<T>(
  pool: pg.Pool,
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Gửi thư nhắc hạn cho một tenant: lấy danh sách chưa gửi, gửi mỗi người một thư, chỉ ghi nhận "đã gửi" cho thư gửi được.
 * Thư lỗi để lại, lần chạy sau thử lại. Gửi xong mà chưa kịp ghi nhận (sập giữa chừng) có thể gửi lặp một thư: chấp nhận.
 */
export async function runRemindersForTenant(
  pool: pg.Pool,
  tenantId: string,
  mailer: Mailer,
): Promise<ReminderRunResult> {
  const pending = await inTenant(pool, tenantId, async (c) => {
    const res = await c.query<PendingReminder>('SELECT * FROM of_email_pending($1)', [tenantId]);
    return res.rows;
  });
  let sent = 0;
  let failed = 0;
  for (const d of buildDigests(pending)) {
    try {
      await mailer.send({ to: d.email, subject: d.subject, text: d.text });
    } catch {
      failed += 1;
      continue;
    }
    sent += 1;
    await inTenant(pool, tenantId, (c) =>
      c.query('SELECT of_email_mark_sent($1, $2::uuid[])', [tenantId, [...d.notificationIds]]),
    );
  }
  return { tenantId, sent, failed };
}
