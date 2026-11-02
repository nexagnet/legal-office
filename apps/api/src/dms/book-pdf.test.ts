import { describe, expect, it } from 'vitest';
import {
  BOOKS,
  BOOK_CODES,
  VANTHU_BOOKS,
  VANTHU_CODES,
  type BookRowRaw,
  type BookSpec,
} from './books';
import { buildBookPdf, officeHeading } from './book-pdf';
import { COVER_TITLES, FORM_LAYOUTS, VANTHU_LAYOUTS } from './book-pdf-layout';

const rowsFor = (spec: BookSpec, n: number): BookRowRaw[] =>
  Array.from({ length: n }, (_, i) => ({
    stt: i + 1,
    case_title: `Công văn ${i + 1}`,
    case_attributes: Object.fromEntries(
      spec.columns.map((c) => [c.key, `Giá trị ${c.no}/${i + 1}`]),
    ),
    doc_kind: null,
    doc_attributes: Object.fromEntries(
      spec.columns.map((c) => [c.key, c.tick ? 'x' : `Giá trị ${c.no}/${i + 1}`]),
    ),
  }));

const pages = (buf: Buffer) => Number(/\/Count (\d+)/.exec(buf.toString('latin1'))?.[1]);
const build = (spec: BookSpec, n: number) =>
  buildBookPdf({
    spec,
    rows: rowsFor(spec, n),
    year: 2026,
    officeName: 'Văn phòng Thi hành án dân sự Hải Bà Trưng',
  });

describe('bố cục in đúng Phụ lục I TT 08/2026/TT-BTP', () => {
  it('số cột mẫu: S-01 10, S-02 7, S-04 11, S-05 13 (mẫu có 4 cột con ở nhóm Quyết định về thi hành án)', () => {
    expect(BOOK_CODES.map((c) => FORM_LAYOUTS[c].xs.length - 1)).toEqual([10, 7, 11, 13]);
  });

  it('mọi cột mẫu có đúng một ô tiêu đề đầy đủ hoặc một ô cột con, và cột nào có dữ liệu thì trỏ đúng cột sổ', () => {
    for (const code of BOOK_CODES) {
      const L = FORM_LAYOUTS[code];
      const n = L.xs.length - 1;
      for (let col = 1; col <= n; col++) {
        const own = L.cells.filter((c) => c.zone !== 'group' && c.from <= col && col <= c.to);
        expect(own, `${code} cột ${col}`).toHaveLength(1);
      }
      expect(L.columnIndex).toHaveLength(n);
      const used = L.columnIndex.filter((i): i is number => i !== null);
      expect(used).toEqual([...used].sort((a, b) => a - b));
      expect(new Set(used).size).toBe(BOOKS[code].columns.length);
    }
  });

  it('S-05: cột mẫu 3 chưa có nguồn nên để trống, các cột sau nối đúng thuộc tính', () => {
    const L = FORM_LAYOUTS['S-05'];
    expect(L.columnIndex[2]).toBeNull();
    const keys = L.columnIndex.map((i) => (i === null ? null : BOOKS['S-05'].columns[i]?.key));
    expect(keys.slice(3, 6)).toEqual([
      'quyet_dinh_thi_hanh_an',
      'quyet_dinh_sua_doi_bo_sung',
      'quyet_dinh_thu_hoi',
    ]);
  });

  it('có bìa cho đủ bốn sổ và bố cục cho ba sổ Văn thư', () => {
    expect(Object.keys(COVER_TITLES)).toEqual(BOOK_CODES);
    for (const c of VANTHU_CODES) {
      expect(VANTHU_LAYOUTS[c].widths).toHaveLength(VANTHU_BOOKS[c].columns.length);
    }
  });
});

describe('buildBookPdf', () => {
  it.each(BOOK_CODES)(
    '%s: bìa 1, bìa 2 và một trang ruột chấm chấm khi chưa có dòng nào',
    async (code) => {
      const buf = await build(BOOKS[code], 0);
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(buf.toString('latin1')).toContain('Tinos');
      expect(pages(buf)).toBe(3);
    },
  );

  it('tự ngắt trang khi nhiều dòng và vẫn kết thúc sạch', async () => {
    expect(pages(await build(BOOKS['S-02'], 5))).toBe(3);
    expect(pages(await build(BOOKS['S-02'], 200))).toBeGreaterThan(5);
  });

  it('S-01 có dấu ✓ nên nhúng thêm phông có dấu này', async () => {
    const buf = await buildBookPdf({
      spec: BOOKS['S-01'],
      rows: rowsFor(BOOKS['S-01'], 3),
      year: 2026,
      officeName: null,
    });
    expect(buf.toString('latin1')).toContain('DejaVuSans');
  });

  it.each(VANTHU_CODES)('%s: không có bìa, bảng lặp tiêu đề qua các trang', async (code) => {
    expect(pages(await build(VANTHU_BOOKS[code], 3))).toBe(1);
    expect(pages(await build(VANTHU_BOOKS[code], 120))).toBeGreaterThan(2);
    expect(pages(await build(VANTHU_BOOKS[code], 0))).toBe(1);
  });

  it('dòng quá dài không làm hỏng bản in và không tràn sang trang vô tận', async () => {
    const spec = BOOKS['S-04'];
    const long = 'rất dài '.repeat(2000);
    const rows = rowsFor(spec, 2).map((r) => ({
      ...r,
      case_attributes: { ...r.case_attributes, noi_dung_xac_minh: long },
    }));
    const buf = await buildBookPdf({ spec, rows, year: 2026, officeName: null });
    expect(pages(buf)).toBeLessThan(8);
  });
});

describe('officeHeading', () => {
  it('chưa có tên thì giữ tiền tố của mẫu kèm chấm chấm; có tên thì in nguyên tên chữ hoa', () => {
    expect(officeHeading(null)).toMatch(/^VĂN PHÒNG THI HÀNH ÁN DÂN SỰ \.+$/);
    expect(officeHeading('  ')).toMatch(/\.+$/);
    expect(officeHeading('Văn phòng Thi hành án dân sự Hải Bà Trưng')).toBe(
      'VĂN PHÒNG THI HÀNH ÁN DÂN SỰ HẢI BÀ TRƯNG',
    );
  });
});
