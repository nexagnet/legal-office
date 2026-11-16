import { readFile } from 'node:fs/promises';

/** Số MB RAM còn dùng được (MemAvailable của /proc/meminfo); null khi không đọc được (không phải Linux). */
export async function availableMemoryMb(path = '/proc/meminfo'): Promise<number | null> {
  try {
    const m = /^MemAvailable:\s+(\d+)\s+kB/m.exec(await readFile(path, 'utf8'));
    return m ? Math.floor(Number(m[1]) / 1024) : null;
  } catch {
    return null;
  }
}

/**
 * Cổng RAM cho worker chạy chung máy nhỏ với API/web: trả `true` khi đủ RAM trống để nhận thêm một tệp.
 * `OCR_MIN_FREE_MB` (mặc định 0 = tắt). Không đọc được RAM thì cho chạy (cgroup `mem_limit` vẫn là lưới an toàn cuối).
 */
export function memoryGate(
  env: NodeJS.ProcessEnv = process.env,
  read: () => Promise<number | null> = () => availableMemoryMb(),
): () => Promise<boolean> {
  const min = Number(env.OCR_MIN_FREE_MB);
  if (!Number.isFinite(min) || min <= 0) return async () => true;
  return async () => {
    const free = await read();
    return free === null || free >= min;
  };
}
