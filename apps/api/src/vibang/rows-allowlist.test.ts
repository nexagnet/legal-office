import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROWS_FN_ALLOWED } from './vibang.repo';

// Mọi tên hàm DB truyền cho `repo.rows(...)` phải nằm trong danh sách cho phép, nếu không API trả 500 ("unsafe function name").
// Lỗi này từng lọt qua vì chỉ có test mức DB, không có test HTTP cho các đường đọc đó (ocr-status, tài liệu cũ, lựa chọn THV).
const SRC = resolve(__dirname, '..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory()
      ? files(p)
      : /\.ts$/.test(n) && !/(\.test|\.itest)\.ts$/.test(n)
        ? [p]
        : [];
  });

describe('danh sách hàm DB cho phép của repo.rows', () => {
  it('mọi lời gọi .rows(tenant, "hàm", ...) trong mã nguồn đều được phép', () => {
    const bad: string[] = [];
    let seen = 0;
    for (const f of files(SRC)) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/\.rows(?:<[^>]*>)?\(\s*[^,()]+,\s*'([a-z0-9_]+)'/g)) {
        seen += 1;
        if (!ROWS_FN_ALLOWED.test(m[1]!)) bad.push(`${m[1]} (${f.slice(SRC.length + 1)})`);
      }
    }
    expect(seen).toBeGreaterThan(20);
    expect(bad).toEqual([]);
  });

  it('không cho phép tên lạ hoặc tên có ký tự đặc biệt', () => {
    for (const x of ['drop_table', 'dms_ocr_status; DROP TABLE x', 'DMS_OCR_STATUS', 'dms_', '']) {
      expect(ROWS_FN_ALLOWED.test(x)).toBe(false);
    }
    expect(ROWS_FN_ALLOWED.test('dms_ocr_status')).toBe(true);
    expect(ROWS_FN_ALLOWED.test('dms_legacy_ocr_status')).toBe(true);
    expect(ROWS_FN_ALLOWED.test('dms_legacy_search')).toBe(true);
    expect(ROWS_FN_ALLOWED.test('dms_list_thv_options')).toBe(true);
  });
});
