import { appendFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ledger } from './ledger';

describe('sổ tiến độ nhập', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'lo-ledger-')), 'l.jsonl');

  it('nhớ tệp đã xong chỉ khi kích thước và ngày sửa không đổi', async () => {
    const l = await Ledger.open(path);
    await l.record({ relPath: 'a.pdf', size: 10, mtimeMs: 5, state: 'hashed', sha256: 'h1' });
    expect(l.cachedHash('a.pdf', 10, 5)).toBe('h1');
    expect(l.isDone('a.pdf', 10, 5)).toBe(false);
    await l.record({ relPath: 'a.pdf', size: 10, mtimeMs: 5, state: 'registered', sha256: 'h1' });
    expect(l.isDone('a.pdf', 10, 5)).toBe(true);
    expect(l.isDone('a.pdf', 11, 5)).toBe(false);
    expect(l.cachedHash('a.pdf', 10, 6)).toBeUndefined();
  });

  it('mở lại từ đĩa khôi phục trạng thái, bỏ qua dòng cuối bị cắt dở do tắt máy', async () => {
    appendFileSync(path, '{"relPath":"b.pdf","size":1,"mtimeMs":1,"sta');
    const l = await Ledger.open(path);
    expect(l.isDone('a.pdf', 10, 5)).toBe(true);
    expect(l.isDone('b.pdf', 1, 1)).toBe(false);
    await l.record({ relPath: 'c.pdf', size: 1, mtimeMs: 1, state: 'failed', error: 'boom' });
    expect((await Ledger.open(path)).summary()).toEqual({ registered: 1, failed: 1 });
  });
});
