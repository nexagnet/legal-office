import { describe, expect, it } from 'vitest';
import {
  BOOK_OF_DOMAIN,
  activeDmsFilter,
  filterDmsCases,
  tabForFilter,
  type DmsCaseRow,
} from '../lib/dms';

const row = (id: string, title: string, docs: number, scans: number): DmsCaseRow => ({
  id,
  domain: 'vibang',
  title,
  status: 'RECORDED',
  created_by: 'u',
  created_at: '2026-10-31T00:00:00Z',
  recorded_at: '2026-10-31T01:00:00Z',
  document_count: docs,
  scan_count: scans,
});

const rows = [
  row('a', 'TEST E2E Hồ sơ A', 2, 2),
  row('b', 'TEST E2E Hồ sơ B', 1, 0),
  row('c', 'Hồ sơ trống', 0, 0),
];

describe('bộ lọc danh sách hồ sơ DMS', () => {
  it('chip thiếu scan chỉ lấy hồ sơ có tài liệu nhưng chưa có scan; đủ scan lấy phần còn lại có scan', () => {
    expect(filterDmsCases(rows, 'thieu-scan', '').map((r) => r.id)).toEqual(['b']);
    expect(filterDmsCases(rows, 'du-scan', '').map((r) => r.id)).toEqual(['a']);
    expect(filterDmsCases(rows, 'chinh-thuc', '').map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('chip chờ duyệt sửa đổi chỉ lấy hồ sơ có yêu cầu đang chờ', () => {
    expect(
      filterDmsCases(rows, 'cho-duyet', '', () => [], new Set(['b'])).map((r) => r.id),
    ).toEqual(['b']);
    expect(activeDmsFilter('cho-duyet')).toBe('cho-duyet');
  });

  it('tìm theo tên hoặc ô của dòng sổ, không phân biệt hoa thường', () => {
    expect(filterDmsCases(rows, 'chinh-thuc', 'hồ sơ b').map((r) => r.id)).toEqual(['b']);
    const cells = (id: string) => (id === 'c' ? ['Nguyễn Văn Thử'] : []);
    expect(filterDmsCases(rows, 'chinh-thuc', 'nguyễn văn', cells).map((r) => r.id)).toEqual(['c']);
    expect(filterDmsCases(rows, 'chinh-thuc', 'không có').length).toBe(0);
  });

  it('chip lạ rơi về Chính thức; nháp và đã hủy tải đúng nhóm; mỗi nghiệp vụ có sổ riêng', () => {
    expect(activeDmsFilter('zzz')).toBe('chinh-thuc');
    expect(activeDmsFilter('nhap')).toBe('nhap');
    expect(tabForFilter('thieu-scan')).toBe('chinh-thuc');
    expect(tabForFilter('da-huy')).toBe('da-huy');
    expect(BOOK_OF_DOMAIN).toEqual({
      tongdat: 'S-01',
      vibang: 'S-02',
      xacminh: 'S-04',
      tochuc: 'S-05',
    });
  });
});
