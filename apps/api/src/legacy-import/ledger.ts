import { appendFile, readFile } from 'node:fs/promises';

export type LedgerState = 'hashed' | 'registered' | 'failed';

export interface LedgerEntry {
  readonly relPath: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly state: LedgerState;
  readonly sha256?: string;
  readonly fileId?: string | null;
  readonly deduplicated?: boolean;
  readonly error?: string;
  readonly at: string;
}

/**
 * Sổ tiến độ dạng JSON từng dòng, chỉ ghi thêm. Mở lại sau khi đứt mạng/tắt máy thì công cụ đọc sổ này và chỉ làm tiếp
 * những tệp chưa xong. Mục của một tệp chỉ có giá trị khi kích thước và ngày sửa vẫn như cũ.
 */
export class Ledger {
  private readonly last = new Map<string, LedgerEntry>();
  private constructor(private readonly path: string) {}

  static async open(path: string): Promise<Ledger> {
    const ledger = new Ledger(path);
    let text = '';
    try {
      text = await readFile(path, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    // Dòng cuối bị cắt dở (không có xuống dòng) thì chốt lại để bản ghi mới không dính vào nó.
    if (text && !text.endsWith('\n')) await appendFile(path, '\n', 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as LedgerEntry;
        if (typeof e.relPath === 'string') ledger.last.set(e.relPath, e);
      } catch {
        // Dòng cuối có thể bị cắt dở khi tắt máy đột ngột: bỏ qua, tệp đó sẽ được làm lại.
      }
    }
    return ledger;
  }

  private same(e: LedgerEntry | undefined, size: number, mtimeMs: number): e is LedgerEntry {
    return e !== undefined && e.size === size && e.mtimeMs === mtimeMs;
  }

  isDone(relPath: string, size: number, mtimeMs: number): boolean {
    const e = this.last.get(relPath);
    return this.same(e, size, mtimeMs) && e.state === 'registered';
  }

  cachedHash(relPath: string, size: number, mtimeMs: number): string | undefined {
    const e = this.last.get(relPath);
    return this.same(e, size, mtimeMs) ? e.sha256 : undefined;
  }

  async record(entry: Omit<LedgerEntry, 'at'>): Promise<void> {
    const full: LedgerEntry = { ...entry, at: new Date().toISOString() };
    this.last.set(entry.relPath, full);
    await appendFile(this.path, `${JSON.stringify(full)}\n`, 'utf8');
  }

  summary(): { registered: number; failed: number } {
    let registered = 0;
    let failed = 0;
    for (const e of this.last.values()) {
      if (e.state === 'registered') registered++;
      else if (e.state === 'failed') failed++;
    }
    return { registered, failed };
  }
}
