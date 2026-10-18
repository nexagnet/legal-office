import pg from 'pg';

/**
 * Lối thoát khi email xác thực Admin không dùng được (SMTP hỏng, mất hộp thư): bật/tắt bước email của MỘT tenant.
 * Chạy bằng tài khoản chủ DB, nên không cần đăng nhập. Mật khẩu vẫn được kiểm; chỉ bước email bị bỏ qua khi `off`.
 *   DATABASE_URL=... TENANT_ID=... MODE=off|on node dist/auth/admin-verification.cli.js
 */
async function main(): Promise<void> {
  const { DATABASE_URL, TENANT_ID, MODE } = process.env;
  if (!DATABASE_URL || !TENANT_ID || (MODE !== 'on' && MODE !== 'off')) {
    throw new Error('Cần DATABASE_URL, TENANT_ID và MODE=on|off');
  }
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_ID]);
    const tenant = await client.query('SELECT 1 FROM tenants WHERE id = $1', [TENANT_ID]);
    if (tenant.rowCount !== 1) throw new Error('Không tìm thấy tenant');
    await client.query(
      `INSERT INTO auth_tenant_settings (tenant_id, admin_email_verification) VALUES ($1,$2)
       ON CONFLICT (tenant_id) DO UPDATE SET admin_email_verification = EXCLUDED.admin_email_verification, updated_at = now()`,
      [TENANT_ID, MODE === 'on'],
    );
    await client.query(
      `INSERT INTO audit_log (tenant_id, actor_id, action, outcome, reason) VALUES ($1,'cli','auth.admin_verification.set','allow',$2)`,
      [TENANT_ID, MODE === 'on' ? 'ON' : 'OFF'],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
  console.log(`Bước email xác thực Admin: ${MODE === 'on' ? 'BẬT' : 'TẮT'}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
