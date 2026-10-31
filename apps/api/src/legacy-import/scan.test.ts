import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mimeFor } from './mime';
import { scan } from './scan';

async function collect(root: string) {
  const out = [];
  for await (const e of scan(root)) out.push(e);
  return out;
}

describe('quét kho tài liệu cũ', () => {
  const root = mkdtempSync(join(tmpdir(), 'lo-scan-'));
  mkdirSync(join(root, 'b/c'), { recursive: true });
  mkdirSync(join(root, 'a'));
  writeFileSync(join(root, 'b/c/z.pdf'), 'zz');
  writeFileSync(join(root, 'a/x.pdf'), 'x');
  writeFileSync(join(root, 'a/Thumbs.db'), '');
  writeFileSync(join(root, 'a/~$x.docx'), '');
  writeFileSync(join(root, 'a/phản hồi.PDF'), 'p'); // tên có dấu
  symlinkSync('/etc', join(root, 'link'));

  it('trả đường dẫn tương đối dùng "/", theo thứ tự ổn định, bỏ tệp rác và liên kết tượng trưng', async () => {
    const all = await collect(root);
    const files = all.filter((e) => e.kind === 'file').map((e) => e.relPath);
    expect(files).toEqual(['a/phản hồi.PDF', 'a/x.pdf', 'b/c/z.pdf']);
    const skips = all
      .filter((e) => e.kind === 'skip')
      .map((e) => `${e.relPath}:${(e as { reason: string }).reason}`);
    expect(skips.sort()).toEqual(['a/Thumbs.db:IGNORED', 'a/~$x.docx:IGNORED', 'link:SYMLINK']);
  });

  it('thư mục không tồn tại báo UNREADABLE thay vì làm hỏng cả lần chạy', async () => {
    const all = await collect(join(root, 'khong-co'));
    expect(all).toEqual([{ kind: 'skip', relPath: '.', reason: 'UNREADABLE' }]);
  });

  it('đoán loại tệp theo đuôi, mặc định octet-stream', () => {
    expect(mimeFor('a/b.PDF')).toBe('application/pdf');
    expect(mimeFor('b.docx')).toContain('wordprocessingml');
    expect(mimeFor('khong-duoi')).toBe('application/octet-stream');
  });
});
