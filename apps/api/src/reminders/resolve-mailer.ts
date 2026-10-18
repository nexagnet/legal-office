import type pg from 'pg';
import { createSmtpMailer, type Mailer } from './mailer';
import { decryptSecret, keyFromEnv } from './secret-box';

interface StoredRow {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly username: string | null;
  readonly password_enc: string | null;
  readonly mail_from: string;
}

/**
 * Mailer của một tenant: cấu hình do Admin lưu trong DB (mật khẩu giải mã bằng `MAIL_SETTINGS_KEY`) được ưu tiên;
 * chưa có thì dùng `SMTP_URL` + `MAIL_FROM` ở môi trường; không có gì thì trả null (bỏ qua tenant, không gửi).
 */
export async function resolveTenantMailer(
  pool: pg.Pool,
  tenantId: string,
  env: NodeJS.ProcessEnv,
): Promise<Mailer | null> {
  const client = await pool.connect();
  let row: StoredRow | undefined;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    row = (await client.query<StoredRow>('SELECT * FROM of_mail_settings_get($1)', [tenantId]))
      .rows[0];
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (row) {
    let password: string | null = null;
    if (row.password_enc) {
      const key = keyFromEnv(env.MAIL_SETTINGS_KEY);
      if (!key)
        throw new Error('Thiếu hoặc sai MAIL_SETTINGS_KEY nên không giải mã được mật khẩu SMTP');
      password = decryptSecret(row.password_enc, key, tenantId);
    }
    return createSmtpMailer(
      { host: row.host, port: row.port, secure: row.secure, username: row.username, password },
      row.mail_from,
    );
  }
  return env.SMTP_URL && env.MAIL_FROM ? createSmtpMailer(env.SMTP_URL, env.MAIL_FROM) : null;
}
