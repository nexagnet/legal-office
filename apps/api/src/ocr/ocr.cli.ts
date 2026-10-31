import pg from 'pg';
import { fileStoreFromEnv } from '../storage/file-store';
import { TesseractEngine } from './engine';
import { processTenant, tenantIdsFromEnv } from './worker';

/**
 * Dịch vụ lo-ocr: vòng lặp nền, không mở cổng. Cần DATABASE_URL (vai legal_app), FILE_STORE* như lo-api và OCR_TENANT_IDS.
 * Không gọi dịch vụ ngoài: toàn bộ OCR chạy trong container này.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const tenants = tenantIdsFromEnv(process.env);
  if (tenants.length === 0) throw new Error('OCR_TENANT_IDS is required');
  const store = fileStoreFromEnv();
  if (!store) throw new Error('FILE_STORE is required');
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const engine = new TesseractEngine(process.env.OCR_LANG || 'vie');
  const idleMs = Number(process.env.OCR_POLL_SECONDS ?? 30) * 1000;
  let stop = false;
  for (const s of ['SIGTERM', 'SIGINT'] as const)
    process.once(s, () => {
      stop = true;
    });
  console.log(`ocr: bắt đầu, ${tenants.length} tenant, chu kỳ ${idleMs / 1000}s`);
  while (!stop) {
    let worked = 0;
    for (const t of tenants) {
      try {
        worked += await processTenant(pool, t, store, engine, console);
      } catch (e) {
        console.error(`ocr: tenant ${t}: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (worked === 0) await new Promise((r) => setTimeout(r, idleMs));
  }
  await pool.end();
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
