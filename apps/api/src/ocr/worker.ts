import type pg from 'pg';
import type { FileStore } from '../storage/file-store';
import type { OcrEngine } from './engine';
import { legacyOcrEnabled } from '../dms/legacy';
import { toSearchText } from './text';

export interface WorkerLog {
  info(msg: string): void;
  error(msg: string): void;
}

interface Claimed {
  readonly id: string;
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

interface Source {
  readonly claim: string;
  readonly complete: string;
  readonly fail: string;
  readonly label: string;
  /** Hàm báo tiến độ theo trang; chỉ tài liệu mới có (tài liệu cũ không hiển thị tiến độ). */
  readonly progress?: string;
}
const CASE_SOURCE: Source = {
  claim: 'dms_ocr_claim',
  complete: 'dms_ocr_complete',
  fail: 'dms_ocr_fail',
  progress: 'dms_ocr_progress',
  label: 'ocr',
};
const LEGACY_SOURCE: Source = {
  claim: 'dms_legacy_ocr_claim',
  complete: 'dms_legacy_ocr_complete',
  fail: 'dms_legacy_ocr_fail',
  label: 'ocr tài liệu cũ',
};

/**
 * Xử lý tối đa `limit` việc của một tenant; trả số việc đã xử lý. Mỗi việc độc lập, một việc lỗi không dừng các việc khác.
 * Việc của hồ sơ làm trước; tài liệu cũ chỉ được nhận khi `legacy` bật (biến LEGACY_OCR_ENABLED).
 */
export async function processTenant(
  pool: pg.Pool,
  tenant: string,
  store: FileStore,
  engine: OcrEngine,
  log: WorkerLog,
  limit = 20,
  legacy = legacyOcrEnabled(),
): Promise<number> {
  let done = 0;
  for (let i = 0; i < limit; i += 1) {
    let src = CASE_SOURCE;
    let job = await claimFrom(pool, tenant, src);
    if (!job && legacy) {
      src = LEGACY_SOURCE;
      job = await claimFrom(pool, tenant, src);
    }
    if (!job) break;
    try {
      const bytes = await store.get(job.object_key);
      if (!bytes) throw new Error('FILE_MISSING');
      const out = await engine.recognize(
        bytes,
        job.mime,
        src.progress
          ? (done, total) =>
              inTenant(pool, tenant, (c) =>
                c.query(`SELECT ${src.progress}($1,$2,$3,$4)`, [tenant, job.id, done, total]),
              ).then(() => undefined)
          : undefined,
      );
      await inTenant(pool, tenant, (c) =>
        c.query(`SELECT ${src.complete}($1,$2,$3,$4,$5,$6,$7,$8)`, [
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
      log.info(`${src.label}: xong ${job.id} (${out.pages} trang, ${out.text.length} ký tự)`);
    } catch (e) {
      const code = errorCode(e);
      log.error(`${src.label}: lỗi ${job.id}: ${code}`);
      await inTenant(pool, tenant, (c) =>
        c.query(`SELECT ${src.fail}($1,$2,$3)`, [tenant, job.id, code]),
      );
    }
    done += 1;
  }
  return done;
}

async function claimFrom(pool: pg.Pool, tenant: string, src: Source): Promise<Claimed | null> {
  return inTenant(pool, tenant, async (c) => {
    const res = await c.query<Claimed>(`SELECT * FROM ${src.claim}($1)`, [tenant]);
    return res.rows[0] ?? null;
  });
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
