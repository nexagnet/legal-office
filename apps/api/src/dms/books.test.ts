import { describe, expect, it } from 'vitest';
import { BOOKS, BOOK_CODES, bookCells, bookForDomain, toCsv } from './books';

describe('định nghĩa sổ nghiệp vụ', () => {
  it('số cột và thứ tự đúng mẫu: S-01 10 cột, S-02 7, S-04 11, S-05 12; cột đầu là STT', () => {
    expect(BOOK_CODES.map((c) => BOOKS[c].columns.length)).toEqual([10, 7, 11, 12]);
    for (const c of BOOK_CODES) {
      const cols = BOOKS[c].columns;
      expect(cols[0]).toMatchObject({ no: 1, key: 'stt' });
      expect(cols.map((x) => x.no)).toEqual(cols.map((_, i) => i + 1));
    }
  });

  it('mỗi miền ứng với đúng một sổ', () => {
    expect(bookForDomain('vibang')?.code).toBe('S-02');
    expect(bookForDomain('tongdat')?.code).toBe('S-01');
    expect(bookForDomain('xacminh')?.code).toBe('S-04');
    expect(bookForDomain('tochuc')?.code).toBe('S-05');
    expect(bookForDomain('khac')).toBeUndefined();
  });

  it('không tự điền hộ: ô thiếu để trống; S-01 lấy loại văn bản từ loại tài liệu; cột tick hiện ✓', () => {
    const row = {
      stt: 3,
      case_title: 't',
      case_attributes: {},
      doc_kind: 'Giấy triệu tập',
      doc_attributes: { co_quan_thads: 'x', so_ngay_van_ban: '45/GTT, 02/10/2026' },
    };
    expect(bookCells(BOOKS['S-01'], row)).toEqual([
      '3',
      'Giấy triệu tập',
      '45/GTT, 02/10/2026',
      '',
      '✓',
      '',
      '',
      '',
      '',
      '',
    ]);
    expect(bookCells(BOOKS['S-02'], { ...row, case_attributes: { nguoi_yeu_cau: 'A' } })).toEqual([
      '3',
      'A',
      '',
      '',
      '',
      '',
      '',
    ]);
  });

  it('CSV có BOM, thoát dấu, và chặn chèn công thức', () => {
    const csv = toCsv(BOOKS['S-02'], [
      {
        stt: 1,
        case_title: 't',
        case_attributes: { nguoi_yeu_cau: 'Trần, "Việt"', noi_dung_yeu_cau: '=HYPERLINK("x")' },
        doc_kind: null,
        doc_attributes: null,
      },
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Trần, ""Việt"""');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
