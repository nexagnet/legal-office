import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashPassword, passwordPolicyError } from './password';

/**
 * Dựng một văn phòng MỚI cho môi trường thật: tenant, văn phòng, chi nhánh, Admin đầu tiên và các nhóm quyền mẫu.
 * KHÔNG nạp dữ liệu mẫu (không hồ sơ, không tài khoản thử). Chạy bằng tài khoản chủ DB, đọc mọi thứ từ biến môi trường
 * tạm thời để mật khẩu không nằm trong lịch sử lệnh:
 *   DATABASE_URL=... TENANT_NAME="Văn phòng ..." BRANCHES="Chi nhánh 1,Chi nhánh 2" \
 *   ADMIN_EMAIL=... ADMIN_NAME="Họ tên" [ADMIN_CCCD=012345678901] ADMIN_PASSWORD=... node dist/auth/bootstrap-tenant.cli.js
 * Admin phải đổi mật khẩu ở lần đăng nhập đầu. In ra TENANT_ID để đặt cho `lo-web`.
 */
export interface BootstrapInput {
  tenantName: string;
  officeName: string;
  branches: string[];
  adminEmail: string;
  adminName: string;
  adminCccd?: string;
  adminPassword: string;
}

export function readInput(env: NodeJS.ProcessEnv): BootstrapInput {
  const tenantName = (env.TENANT_NAME ?? '').trim();
  const adminEmail = (env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const adminName = (env.ADMIN_NAME ?? '').trim();
  const adminPassword = env.ADMIN_PASSWORD ?? '';
  const adminCccd = (env.ADMIN_CCCD ?? '').trim() || undefined;
  const branches = (env.BRANCHES ?? '')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
  if (!tenantName || !adminEmail || !adminName || !adminPassword) {
    throw new Error('Thiếu TENANT_NAME, ADMIN_EMAIL, ADMIN_NAME hoặc ADMIN_PASSWORD');
  }
  if (!/^[^@\s]+@[^@\s]+$/.test(adminEmail)) throw new Error('ADMIN_EMAIL không hợp lệ');
  if (adminCccd && !/^[0-9]{12}$/.test(adminCccd))
    throw new Error('ADMIN_CCCD phải đúng 12 chữ số');
  const weak = passwordPolicyError(adminPassword);
  if (weak) throw new Error(weak);
  if (branches.length === 0)
    throw new Error('Cần ít nhất một chi nhánh trong BRANCHES (cách nhau dấu phẩy)');
  return {
    tenantName,
    officeName: (env.OFFICE_NAME ?? '').trim() || tenantName,
    branches,
    adminEmail,
    adminName,
    adminCccd,
    adminPassword,
  };
}

async function main(): Promise<void> {
  const { DATABASE_URL } = process.env;
  if (!DATABASE_URL) throw new Error('Thiếu DATABASE_URL (tài khoản chủ DB)');
  const input = readInput(process.env);
  const hash = await hashPassword(input.adminPassword);
  const tenantId = randomUUID();
  const officeId = randomUUID();
  const userId = randomUUID();
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    await client.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [
      tenantId,
      input.tenantName,
    ]);
    await client.query('INSERT INTO offices (id, tenant_id, name) VALUES ($1, $2, $3)', [
      officeId,
      tenantId,
      input.officeName,
    ]);
    for (const name of input.branches) {
      await client.query('INSERT INTO branches (tenant_id, office_id, name) VALUES ($1, $2, $3)', [
        tenantId,
        officeId,
        name,
      ]);
    }
    await client.query(
      'INSERT INTO users (id, tenant_id, external_ref, full_name) VALUES ($1, $2, $3, $4)',
      [userId, tenantId, `admin-${userId.slice(0, 8)}`, input.adminName],
    );
    await client.query(
      `INSERT INTO memberships (tenant_id, user_id, office_id, role, legal_signer) VALUES ($1, $2, $3, 'ADMIN', false)`,
      [tenantId, userId, officeId],
    );
    await client.query(
      `INSERT INTO auth_credentials (tenant_id, user_id, email, password_hash, cccd, must_change_password)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [tenantId, userId, input.adminEmail, hash, input.adminCccd ?? null],
    );
    await client.query('SELECT dms_seed_template_groups($1, $2)', [tenantId, officeId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
  console.log(
    `Đã tạo văn phòng. TENANT_ID=${tenantId} OFFICE_ID=${officeId} (đặt TENANT_ID cho lo-web).`,
  );
  console.log('Admin phải đổi mật khẩu ở lần đăng nhập đầu. Chưa nạp dữ liệu mẫu.');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
