import { describe, expect, it } from 'vitest';
import { searchTerms, snippetAround, toSearchText, toTsQuery } from './text';

describe('chuẩn hoá tìm kiếm không dấu', () => {
  it('bỏ dấu tiếng Việt, đ thành d, giữ nguyên độ dài', () => {
    const s = 'Đặng Thị Hương, phố Huế — Hai Bà Trưng';
    const f = toSearchText(s);
    expect(f).toBe('dang thi huong, pho hue — hai ba trung');
    expect(f.length).toBe(s.length);
  });
  it('chuỗi dựng sẵn và chuỗi tổ hợp cho cùng kết quả', () => {
    expect(toSearchText('ệ'.normalize('NFD'))).toBe(toSearchText('ệ'.normalize('NFC')));
  });
  it('tsquery chỉ chứa từ an toàn, từ cuối khớp tiền tố', () => {
    expect(toTsQuery("Tống đạt'; DROP TABLE x & | !")).toBe('tong & dat & drop & table & x:*');
    expect(toTsQuery('  !!! ')).toBe('');
    expect(searchTerms('a a b')).toEqual(['a', 'b']);
  });
  it('đoạn trích lấy từ văn bản gốc có dấu', () => {
    const t = 'Biên bản tống đạt số 125/2026 cho ông Nguyễn Văn An';
    const s = snippetAround(t, ['nguyen'], 10);
    expect(s).toContain('Nguyễn Văn');
    expect(s.startsWith('…')).toBe(true);
  });
});
