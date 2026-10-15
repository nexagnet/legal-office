import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

/**
 * Chạy các file SQL trong `drizzle/` theo thứ tự tên, mỗi file đúng một lần (ghi vào `schema_migrations`).
 * Chạy bằng tài khoản CHỦ DB (không phải vai ứng dụng), như một job riêng trước khi bật API:
 *   DATABASE_URL=... [APP_DB_ROLE=legal_app] node dist/db/migrate.cli.js
 * Nếu có APP_DB_ROLE (vai đã tồn tại, không phải superuser, không BYPASSRLS) thì cấp quyền bảng/sequence cho vai đó.
 */
const MIGRATION_DIR = resolve(__dirname, '../../drizzle');
const LOCK_KEY = 482_017_001;
const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

async function main(): Promise<void> {
  const { DATABASE_URL, APP_DB_ROLE } = process.env;
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (APP_DB_ROLE && !ROLE_NAME.test(APP_DB_ROLE)) throw new Error('APP_DB_ROLE không hợp lệ');
  const files = readdirSync(MIGRATION_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
    );
    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
        (r) => r.name,
      ),
    );
    for (const file of files.filter((f) => !done.has(f))) {
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(resolve(MIGRATION_DIR, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`Migration ${file} lỗi: ${error instanceof Error ? error.message : error}`);
      }
      console.log(`Đã chạy ${file}`);
    }
    if (APP_DB_ROLE) {
      const role = `"${APP_DB_ROLE}"`;
      await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await client.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${role}`);
      await client.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
      await client.query(`REVOKE ALL ON schema_migrations FROM ${role}`);
    }
    console.log(`Migration xong (${files.length} file).`);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
