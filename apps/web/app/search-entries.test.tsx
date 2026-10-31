import { describe, expect, it } from 'vitest';
import { searchEntries } from '../lib/search-entries';
import { visibleNav } from './nav';

const pages = visibleNav(['ADMIN']);
const cases = [
  { id: 'c1', title: 'Vi bằng Hòa Phát', customerName: 'Cty CP Hòa Phát', numberLabel: '12/2026' },
  { id: 'c2', title: 'Vi bằng Sao Mai', customerName: 'Cty Sao Mai' },
];

describe('searchEntries', () => {
  it('rỗng khi chưa gõ gì', () => {
    expect(searchEntries('  ', pages, cases)).toEqual([]);
  });
  it('tìm không phân biệt dấu và hoa thường, trang trước hồ sơ', () => {
    const hits = searchEntries('hoa phat', pages, cases);
    expect(hits.map((h) => h.href)).toEqual(['/vi-bang/c1']);
    expect(searchEntries('VAN THU', pages, cases)[0]?.href).toBe('/dms/van-ban-den');
  });
  it('tìm theo số vi bằng và khách hàng', () => {
    expect(searchEntries('12/2026', pages, cases).map((h) => h.href)).toEqual(['/vi-bang/c1']);
    expect(searchEntries('sao mai', pages, cases)[0]?.hint).toContain('Cty Sao Mai');
  });
  it('giới hạn số kết quả', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, title: `Hồ sơ ${i}` }));
    expect(searchEntries('ho so', pages, many)).toHaveLength(8);
  });
});
