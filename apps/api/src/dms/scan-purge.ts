import { Cron } from 'croner';
import type pg from 'pg';
import type { FileStore } from '../storage/file-store';

export interface PurgeLog {
  info(message: string): void;
  error(message: string): void;
}

export interface PurgeResult {
  readonly purged: number;
  readonly failed: number;
}

/** Mặc định 02:30 sáng giờ Việt Nam mỗi ngày (ít người dùng nhất). */
export const DEFAULT_PURGE_CRON = '30 2 * * *';
export const PURGE_TIMEZONE = 'Asia/Ho_Chi_Minh';
/** Khoá advisory của Postgres: nhiều bản lo-api cùng chạy thì chỉ một bản dọn mỗi lượt. */
const LOCK_KEY = 'legal-office:scan-purge';
const BATCH = 200;
/** Trần số lô một lượt/tenant, để một tenant tồn đọng không giữ lượt mãi. */
const MAX_BATCHES = 50;

/** Tenant cần dọn, ngăn cách bằng dấu phẩy: `SCAN_PURGE_TENANT_IDS`, không có thì dùng danh sách của nhắc hạn. */
export function purgeTenantIds(env: NodeJS.ProcessEnv): string[] {
  return (env.SCAN_PURGE_TENANT_IDS || env.REMINDER_TENANT_IDS || env.TENANT_IDS || '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '');
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

interface DueRow {
  readonly kind: 'document' | 'submission';
  readonly file_id: string;
  readonly object_key: string;
}

/**
 * Dọn các file scan đã xóa quá 30 ngày của một tenant: xóa đối tượng khỏi kho rồi mới đánh dấu "đã dọn" trong DB.
 * An toàn khi chạy lại: xóa đối tượng không có thì thôi, đánh dấu lần hai trả false. Lỗi kho ở một file chỉ bỏ qua file đó
 * (không đánh dấu, lượt sau thử lại). Một file có nhiều phiên bản chỉ được đánh dấu khi đã xóa hết các phiên bản.
 */
export async function purgeScansForTenant(
  pool: pg.Pool,
  store: FileStore,
  tenantId: string,
  log: PurgeLog,
): Promise<PurgeResult> {
  let purged = 0;
  // Một file lỗi có thể xuất hiện lại ở lô sau (chưa được đánh dấu), nên đếm theo file chứ không theo lần thử.
  const failedFiles = new Set<string>();
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const due = await inTenant(pool, tenantId, async (c) => {
      const res = await c.query<DueRow>('SELECT * FROM dms_scan_purge_due($1,$2)', [
        tenantId,
        BATCH,
      ]);
      return res.rows;
    });
    if (due.length === 0) break;

    const groups = new Map<string, { kind: DueRow['kind']; fileId: string; keys: string[] }>();
    for (const r of due) {
      const g = groups.get(`${r.kind}:${r.file_id}`) ?? {
        kind: r.kind,
        fileId: r.file_id,
        keys: [],
      };
      g.keys.push(r.object_key);
      groups.set(`${r.kind}:${r.file_id}`, g);
    }

    let progress = 0;
    for (const g of groups.values()) {
      try {
        // Không bao giờ xóa khóa ngoài vùng của tenant này, kể cả khi dữ liệu sai.
        if (g.keys.some((k) => !k.startsWith(`t/${tenantId}/`)))
          throw new Error('khóa đối tượng ngoài vùng của tenant');
        for (const key of g.keys) await store.delete(key);
        await inTenant(pool, tenantId, (c) =>
          c.query('SELECT dms_scan_purge_done($1,$2,$3)', [tenantId, g.kind, g.fileId]),
        );
        purged += 1;
        progress += 1;
      } catch (error) {
        if (!failedFiles.has(`${g.kind}:${g.fileId}`))
          log.error(
            `dọn scan tenant ${tenantId} ${g.kind} ${g.fileId}: ${error instanceof Error ? error.message : error}`,
          );
        failedFiles.add(`${g.kind}:${g.fileId}`);
      }
    }
    // Cả lô đều lỗi thì dừng, tránh lặp vô hạn trên cùng các dòng.
    if (progress === 0) break;
  }
  return { purged, failed: failedFiles.size };
}

/** Dọn cho từng tenant, độc lập nhau. Trả tổng số file lỗi. */
export async function purgeScansForTenants(
  pool: pg.Pool,
  store: FileStore,
  tenantIds: readonly string[],
  log: PurgeLog,
): Promise<number> {
  let failed = 0;
  for (const tenantId of tenantIds) {
    try {
      const r = await purgeScansForTenant(pool, store, tenantId, log);
      failed += r.failed;
      log.info(`dọn scan tenant ${tenantId}: đã dọn ${r.purged} file, lỗi ${r.failed}`);
    } catch (error) {
      failed += 1;
      log.error(`dọn scan tenant ${tenantId}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return failed;
}

/** Một lượt dọn. Không giành được khoá (bản khác đang dọn) thì bỏ qua; trả về có chạy hay không. */
export async function runScanPurgeOnce(
  pool: pg.Pool,
  store: FileStore,
  env: NodeJS.ProcessEnv,
  log: PurgeLog,
): Promise<boolean> {
  const tenants = purgeTenantIds(env);
  if (tenants.length === 0) {
    log.error('SCAN_PURGE_SCHEDULE=on nhưng thiếu SCAN_PURGE_TENANT_IDS');
    return false;
  }
  const lockClient = await pool.connect();
  try {
    const got = await lockClient.query<{ ok: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS ok',
      [LOCK_KEY],
    );
    if (!got.rows[0]?.ok) {
      log.info('dọn scan: bản khác đang dọn, bỏ qua lượt này');
      return false;
    }
    try {
      await purgeScansForTenants(pool, store, tenants, log);
      return true;
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]);
    }
  } finally {
    lockClient.release();
  }
}

/**
 * Lịch dọn scan hết hạn 30 ngày chạy trong chính ứng dụng. Bật bằng `SCAN_PURGE_SCHEDULE=on`;
 * giờ chạy `SCAN_PURGE_CRON` (mặc định 02:30 giờ Việt Nam).
 */
export function startScanPurgeSchedule(
  pool: pg.Pool,
  store: FileStore,
  env: NodeJS.ProcessEnv,
  log: PurgeLog,
): () => void {
  const pattern = env.SCAN_PURGE_CRON || DEFAULT_PURGE_CRON;
  const job = new Cron(
    pattern,
    { timezone: PURGE_TIMEZONE, protect: true, unref: true },
    async () => {
      try {
        await runScanPurgeOnce(pool, store, env, log);
      } catch (error) {
        log.error(`dọn scan: ${error instanceof Error ? error.message : error}`);
      }
    },
  );
  log.info(
    `dọn scan: lịch "${pattern}" (${PURGE_TIMEZONE}), lượt kế ${job.nextRun()?.toISOString()}`,
  );
  return () => job.stop();
}
