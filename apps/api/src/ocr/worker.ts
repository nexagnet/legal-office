import type pg from 'pg';
import type { FileStore } from '../storage/file-store';
import type { OcrEngine } from './engine';
import { toSearchText } from './text';

export interface WorkerLog {
  info(msg: string): void;
  error(msg: string): void;
}

interface Claimed {
  readonly id: string;
  readonly version_id: string;
  readonly object_key: string;
  readonly mime: string;
}

async function inTenant<T>(
  pool: pg.Pool,
  tenant: string,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** Mã lỗi ngắn, không chứa nội dung tệp hay đường dẫn. */
function errorCode(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  if (/^[A-Z_]{3,40}$/.test(m)) return m;
  const code = (e as { code?: unknown }).code;
  return typeof code === 'string' ? `ENGINE_${code}`.slice(0, 60) : 'ENGINE_ERROR';
}

/** Xử lý tối đa `limit` việc của một tenant; trả số việc đã xử lý. Mỗi việc độc lập, một việc lỗi không dừng các việc khác. */
export async function processTenant(
  pool: pg.Pool,
  tenant: string,
  store: FileStore,
  engine: OcrEngine,
  log: WorkerLog,
  limit = 20,
): Promise<number> {
  let done = 0;
  for (let i = 0; i < limit; i += 1) {
    const job = await inTenant(pool, tenant, async (c) => {
      const res = await c.query<Claimed>('SELECT * FROM dms_ocr_claim($1)', [tenant]);
      return res.rows[0] ?? null;
    });
    if (!job) break;
    try {
      const bytes = await store.get(job.object_key);
      if (!bytes) throw new Error('FILE_MISSING');
      const out = await engine.recognize(bytes, job.mime);
      await inTenant(pool, tenant, (c) =>
        c.query('SELECT dms_ocr_complete($1,$2,$3,$4,$5,$6,$7,$8)', [
          tenant,
          job.id,
          out.engine,
          out.lang,
          out.pages,
          out.confidence,
          out.text,
          toSearchText(out.text),
        ]),
      );
      log.info(`ocr: xong ${job.id} (${out.pages} trang, ${out.text.length} ký tự)`);
    } catch (e) {
      const code = errorCode(e);
      log.error(`ocr: lỗi ${job.id}: ${code}`);
      await inTenant(pool, tenant, (c) =>
        c.query('SELECT dms_ocr_fail($1,$2,$3)', [tenant, job.id, code]),
      );
    }
    done += 1;
  }
  return done;
}

export function tenantIdsFromEnv(env: NodeJS.ProcessEnv): string[] {
  return (env.OCR_TENANT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface RunOnceResult {
  readonly processed: number;
  /** Số tenant gặp lỗi mức hệ thống (DB, kho tệp); lỗi từng tệp không tính vì đã được ghi và thử lại ở lượt sau. */
  readonly tenantErrors: number;
}

/** Chế độ chạy một lần cho Job theo lịch: làm hết việc đang chờ của mọi tenant rồi dừng. */
export async function runOnce(
  pool: pg.Pool,
  tenants: readonly string[],
  store: FileStore,
  engine: OcrEngine,
  log: WorkerLog,
): Promise<RunOnceResult> {
  let processed = 0;
  let tenantErrors = 0;
  for (const t of tenants) {
    try {
      for (;;) {
        const n = await processTenant(pool, t, store, engine, log);
        processed += n;
        if (n === 0) break;
      }
    } catch (e) {
      tenantErrors += 1;
      log.error(`ocr: tenant ${t}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { processed, tenantErrors };
}
