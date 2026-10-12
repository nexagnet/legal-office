import pg from 'pg';
import { hashPassword, passwordPolicyError } from './password';

/**
 * Đặt mật khẩu đầu tiên (bootstrap Admin) ngoài API. Chạy bằng tài khoản chủ DB, đọc mọi thứ từ biến môi trường
 * tạm thời để mật khẩu không nằm trong lịch sử lệnh:
 *   DATABASE_URL=... TENANT_ID=... USER_ID=... EMAIL=... NEW_PASSWORD=... node dist/auth/set-password.cli.js
 */
async function main(): Promise<void> {
  const { DATABASE_URL, TENANT_ID, USER_ID, EMAIL, NEW_PASSWORD } = process.env;
  if (!DATABASE_URL || !TENANT_ID || !USER_ID || !EMAIL || !NEW_PASSWORD) {
    throw new Error('Thiếu DATABASE_URL, TENANT_ID, USER_ID, EMAIL hoặc NEW_PASSWORD');
  }
  const weak = passwordPolicyError(NEW_PASSWORD);
  if (weak) throw new Error(weak);
  const hash = await hashPassword(NEW_PASSWORD);
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_ID]);
    const user = await client.query('SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2', [
      USER_ID,
      TENANT_ID,
    ]);
    if (user.rowCount !== 1) throw new Error('Không tìm thấy người dùng trong tenant này');
    await client.query(
      `INSERT INTO auth_credentials (tenant_id, user_id, email, password_hash) VALUES ($1,$2,lower(btrim($3)),$4)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
         failed_attempts = 0, locked_until = NULL, updated_at = now()`,
      [TENANT_ID, USER_ID, EMAIL, hash],
    );
    await client.query(
      `UPDATE auth_sessions SET revoked_at = now() WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [TENANT_ID, USER_ID],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
  console.log('Đã đặt mật khẩu.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
