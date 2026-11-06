import { describe, expect, it } from 'vitest';
import { BOOKS, VANTHU_BOOKS, bookCells, toCsv } from './books';
import { PHONE_KEY, isValidPhone, phoneIssue } from './dms-phone';

describe('số điện thoại khách (N1)', () => {
  it('chấp nhận cách gõ quen thuộc và +84', () => {
    for (const v of [
      '0912345678',
      '0912 345 678',
      '091.234.5678',
      '(028) 3822-1234',
      '+84912345678',
    ])
      expect(isValidPhone(v), v).toBe(true);
  });

  it('từ chối chuỗi ngắn, quá dài, có chữ', () => {
    for (const v of ['1234567', '1234567890123456', '09123abc78', 'không có', '+', ''])
      expect(isValidPhone(v), v).toBe(false);
  });

  it('chỉ kiểm khóa so_dien_thoai: bỏ trống được, kiểu sai bị báo, khóa khác không bị đụng', () => {
    expect(phoneIssue({ ten: 'A' })).toBeNull();
    expect(phoneIssue({ [PHONE_KEY]: '' })).toBeNull();
    expect(phoneIssue({ [PHONE_KEY]: '   ' })).toBeNull();
    expect(phoneIssue({ [PHONE_KEY]: 912345678 })).toMatch(/chuỗi/);
    expect(phoneIssue({ [PHONE_KEY]: 'abc' })).toMatch(/không hợp lệ/);
    expect(phoneIssue({ [PHONE_KEY]: null })).toMatch(/chuỗi/);
    expect(phoneIssue({ [PHONE_KEY]: null }, true)).toBeNull();
  });
});

describe('SĐT không bao giờ vào sổ (N1)', () => {
  const PHONE = '0987654321';
  const all = [...Object.values(BOOKS), ...Object.values(VANTHU_BOOKS)];

  it('không cột nào của 4 sổ chính thức hay 3 sổ Văn thư lấy khóa so_dien_thoai', () => {
    for (const b of all)
      expect(
        b.columns.map((c) => c.key),
        b.code,
      ).not.toContain(PHONE_KEY);
  });

  it('dòng sổ và CSV có SĐT trong thuộc tính vẫn không in ra SĐT', () => {
    const row = {
      stt: 1,
      case_title: 'Hồ sơ',
      case_attributes: { [PHONE_KEY]: PHONE, nguoi_yeu_cau: 'A' },
      doc_kind: 'Giấy tờ',
      doc_attributes: { [PHONE_KEY]: PHONE },
    };
    for (const b of all) {
      expect(bookCells(b, row).join('|'), b.code).not.toContain(PHONE);
      expect(toCsv(b, [row]), b.code).not.toContain(PHONE);
    }
  });
});
