import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Chống lặp lại lỗi "Đã xảy ra lỗi. Trang chưa tải được" ở chi tiết hồ sơ: hàm/hằng số (không phải component) export từ
 * module 'use client' không gọi/so sánh được ở component máy chủ ("Attempted to call ocrApplies() from the server").
 * Vitest không dựng ranh giới máy chủ/client nên test này kiểm bằng nguồn: tệp không 'use client' không được import
 * giá trị không phải component (tên không viết hoa chữ đầu) từ tệp 'use client'.
 */
const ROOT = resolve(__dirname, '..');
const DIRS = ['app', 'components', 'lib'];
const EXT = /\.(ts|tsx)$/;
const TEST = /\.test\.(ts|tsx)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === 'node_modules' || n === '.next') return [];
    return statSync(p).isDirectory() ? walk(p) : EXT.test(n) && !TEST.test(n) ? [p] : [];
  });
}
const isClient = (src: string) => /^\s*(['"])use client\1/.test(src);
const files = DIRS.flatMap((d) => walk(join(ROOT, d)));
const src = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

function resolveImport(from: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined;
  const base = resolve(from, '..', spec);
  return files.find((f) => f === `${base}.ts` || f === `${base}.tsx` || f === `${base}/index.tsx`);
}

describe('ranh giới máy chủ / client', () => {
  it('component máy chủ không import hàm hay hằng số (không phải component) từ module use client', () => {
    const bad: string[] = [];
    for (const [file, text] of src) {
      if (isClient(text)) continue;
      for (const m of text.matchAll(/import\s+(?!type\b)\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g)) {
        const target = resolveImport(file, m[2]!);
        if (!target || !isClient(src.get(target)!)) continue;
        for (const part of m[1]!.split(',')) {
          const name = part
            .trim()
            .replace(/^type\s.*/, '')
            .split(/\s+as\s+/)[0]!
            .trim();
          // Component viết hoa chữ đầu rồi có chữ thường (Modal, DmsFileActions); còn lại là hàm/hằng số.
          if (name && !/^[A-Z][a-z0-9][A-Za-z0-9]*$/.test(name))
            bad.push(`${file.replace(ROOT, '')}: ${name}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
