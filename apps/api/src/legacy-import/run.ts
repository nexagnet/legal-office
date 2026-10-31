import { stat } from 'node:fs/promises';
import { ApiError, type ImportApi } from './client';
import { sha256File } from './hash';
import type { Ledger } from './ledger';
import { mimeFor } from './mime';
import { scan, type ScannedFile } from './scan';

export interface RunOptions {
  readonly root: string;
  readonly batchId: string;
  readonly api: ImportApi;
  readonly ledger: Ledger;
  readonly concurrency?: number;
  readonly ignore?: readonly RegExp[];
  readonly skipAbsPaths?: ReadonlySet<string>;
  readonly onEvent?: (e: { relPath: string; outcome: string }) => void;
}

export interface RunSummary {
  scanned: number;
  registered: number;
  deduplicated: number;
  alreadyDone: number;
  skipped: Record<string, number>;
  failed: { relPath: string; error: string }[];
  bytesUploaded: number;
}

/** Tải lên bằng liên kết hết hạn (403) thì xin liên kết mới, tối đa hai lần. */
const MAX_REPREPARE = 2;

async function importOne(
  o: RunOptions,
  f: ScannedFile,
  sum: RunSummary,
  inflight: Map<string, Promise<string>>,
): Promise<string> {
  const { ledger } = o;
  if (ledger.isDone(f.relPath, f.size, f.mtimeMs)) {
    sum.alreadyDone++;
    return 'ALREADY_DONE';
  }
  const sha256 = ledger.cachedHash(f.relPath, f.size, f.mtimeMs) ?? (await sha256File(f.absPath));
  await ledger.record({
    relPath: f.relPath,
    size: f.size,
    mtimeMs: f.mtimeMs,
    state: 'hashed',
    sha256,
  });
  // Tệp đang bị sửa trong lúc nhập thì không đăng ký nội dung nửa vời.
  const after = await stat(f.absPath);
  if (after.size !== f.size || after.mtimeMs !== f.mtimeMs)
    throw new Error('CHANGED_DURING_IMPORT');

  const meta = {
    relPath: f.relPath,
    size: f.size,
    sha256,
    mime: mimeFor(f.relPath),
    mtime: new Date(f.mtimeMs).toISOString(),
  };
  // Hai tệp cùng nội dung chạy song song: tệp sau chờ tệp trước xong rồi mới hỏi, để nhận ra "đã có" thay vì tải lại.
  const prior = inflight.get(sha256);
  if (prior) await prior.catch(() => undefined);
  const mine = transfer(o, f, sha256, meta, sum);
  inflight.set(sha256, mine);
  try {
    return await mine;
  } finally {
    if (inflight.get(sha256) === mine) inflight.delete(sha256);
  }
}

type Meta = Parameters<ImportApi['prepare']>[1];

async function transfer(
  o: RunOptions,
  f: ScannedFile,
  sha256: string,
  meta: Meta,
  sum: RunSummary,
): Promise<string> {
  const { api, ledger, batchId } = o;
  let prep = await api.prepare(batchId, meta);
  if (prep.status === 'UPLOAD') {
    for (let tries = 0; ; tries++) {
      try {
        await api.upload(f.absPath, f.size, prep);
        break;
      } catch (e) {
        if (e instanceof ApiError && e.status === 403 && tries < MAX_REPREPARE) {
          prep = await api.prepare(batchId, meta);
          if (prep.status === 'UPLOAD') continue;
          break;
        }
        throw e;
      }
    }
    if (prep.status === 'UPLOAD') {
      sum.bytesUploaded += f.size;
      const done = await api.complete(batchId, meta);
      await ledger.record({
        relPath: f.relPath,
        size: f.size,
        mtimeMs: f.mtimeMs,
        state: 'registered',
        sha256,
        fileId: done.fileId,
        deduplicated: false,
      });
      sum.registered++;
      return 'UPLOADED';
    }
  }
  await ledger.record({
    relPath: f.relPath,
    size: f.size,
    mtimeMs: f.mtimeMs,
    state: 'registered',
    sha256,
    fileId: prep.fileId,
    deduplicated: true,
  });
  sum.registered++;
  sum.deduplicated++;
  return 'DEDUPLICATED';
}

export async function runImport(o: RunOptions): Promise<RunSummary> {
  const sum: RunSummary = {
    scanned: 0,
    registered: 0,
    deduplicated: 0,
    alreadyDone: 0,
    skipped: {},
    failed: [],
    bytesUploaded: 0,
  };
  const limit = Math.max(1, o.concurrency ?? 3);
  const running = new Set<Promise<void>>();
  const inflight = new Map<string, Promise<string>>();
  for await (const entry of scan(o.root, { ignore: o.ignore, skipAbsPaths: o.skipAbsPaths })) {
    if (entry.kind === 'skip') {
      sum.skipped[entry.reason] = (sum.skipped[entry.reason] ?? 0) + 1;
      continue;
    }
    sum.scanned++;
    const task: Promise<void> = importOne(o, entry, sum, inflight)
      .then((outcome) => o.onEvent?.({ relPath: entry.relPath, outcome }))
      .catch(async (e: unknown) => {
        const error = e instanceof Error ? e.message : String(e);
        sum.failed.push({ relPath: entry.relPath, error });
        await o.ledger.record({
          relPath: entry.relPath,
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          state: 'failed',
          error,
        });
        o.onEvent?.({ relPath: entry.relPath, outcome: `FAILED ${error}` });
      })
      .finally(() => {
        running.delete(task);
      });
    running.add(task);
    if (running.size >= limit) await Promise.race(running);
  }
  await Promise.all(running);
  return sum;
}
