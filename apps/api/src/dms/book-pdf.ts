/**
 * Bản xuất PDF của các sổ DMS, dựng riêng cho in (không chụp màn hình web): A4 ngang, phông Tinos (số đo chữ trùng
 * Times New Roman), bìa 1, bìa 2 và trang ruột đúng Phụ lục I Thông tư 08/2026/TT-BTP; ba sổ Văn thư theo sổ Excel của
 * bộ phận Văn thư. Dữ liệu là dòng sổ do API cấp (đã lọc theo quyền); ô thiếu để trống, không điền hộ.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import PDFDocument from 'pdfkit';
import { bookCells, type BookRowRaw, type BookSpec, type VanThuCode } from './books';
import {
  COVER_GEOM,
  COVER_TITLES,
  type CoverGeom,
  FORM_LAYOUTS,
  HEADER_GAP,
  VANTHU_LAYOUTS,
  type FormLayout,
  type VanThuLayout,
} from './book-pdf-layout';

export const BOOK_PDF_MIME = 'application/pdf';

const nodeRequire = createRequire(__filename);
const FONT_DIR = dirname(nodeRequire.resolve('@expo-google-fonts/tinos/package.json'));
const FONT = join(FONT_DIR, '400Regular', 'Tinos_400Regular.ttf');
const FONT_BOLD = join(FONT_DIR, '700Bold', 'Tinos_700Bold.ttf');
const FONT_ITALIC = join(FONT_DIR, '400Regular_Italic', 'Tinos_400Regular_Italic.ttf');
// Tinos không có dấu ✓ (cột đánh dấu của S-01); lấy riêng từ DejaVu, phông đã dùng cho bản xuất khác.
const FONT_TICK = join(
  dirname(nodeRequire.resolve('dejavu-fonts-ttf/package.json')),
  'ttf',
  'DejaVuSans.ttf',
);

const PAGE_W = 841.89;
const PAGE_H = 595.28;

export interface BookPdfInput {
  readonly spec: BookSpec;
  readonly rows: readonly BookRowRaw[];
  readonly year: number;
  /** Tên pháp lý của văn phòng; `null` thì để chấm chấm như mẫu giấy. */
  readonly officeName: string | null;
}

type Doc = InstanceType<typeof PDFDocument>;
type CoverCode = keyof typeof COVER_TITLES;

const OFFICE_PREFIX = 'VĂN PHÒNG THI HÀNH ÁN DÂN SỰ';
const dots = (n: number) => '.'.repeat(n);

/** Dòng tên văn phòng ở bìa: có tên thì in nguyên tên (chữ hoa), chưa có thì giữ tiền tố của mẫu kèm chấm chấm. */
export function officeHeading(name: string | null): string {
  const n = (name ?? '').trim();
  if (n === '') return `${OFFICE_PREFIX} ${dots(36)}`;
  return n.toLocaleUpperCase('vi-VN');
}

const newPage = (doc: Doc) => doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });

/** Chân trang: số trang nằm dưới khung bảng, ngoài vùng mẫu. */
function drawPageNumber(doc: Doc, n: number, total: number, y: number) {
  doc
    .font(FONT_ITALIC)
    .fontSize(8)
    .fillColor('#000000')
    .text(`Trang ${n}/${total}`, 0, y, { width: PAGE_W, align: 'center', lineBreak: false });
}

// ---------------------------------------------------------------- Bìa
// pdfkit đặt chữ lệch so với "đỉnh chữ" đo trong mẫu: ~1,1 pt ở cỡ 10 và ~1,9 pt ở cỡ 20.
const T10 = -1.1;
const T20 = -1.9;
const LINE = 14.55;

function drawCoverBox(doc: Doc, form: string, y: number) {
  doc.save().lineWidth(0.75).rect(562.5, y, 222, 36).stroke('#000000').restore();
  doc.font(FONT).fontSize(10).fillColor('#000000');
  doc.text(form, 562.5, y + 5.2 + T10, { width: 222, align: 'center', lineBreak: false });
  doc.font(FONT_ITALIC);
  doc.text('(Ban hành kèm theo Thông tư số 08/2026/TT-BTP)', 562.5, y + 17.1 + T10, {
    width: 222,
    align: 'center',
    lineBreak: false,
  });
}

function drawCoverCommon(
  doc: Doc,
  spec: BookSpec,
  code: CoverCode,
  officeName: string | null,
  g: CoverGeom,
) {
  drawCoverBox(doc, spec.form, g.box);
  doc.font(FONT_BOLD).fontSize(10).fillColor('#000000');
  doc.text(officeHeading(officeName), 85, g.office + T10, { lineBreak: false });
  doc.text(`Địa chỉ: ${dots(88)}`, 85, g.address + T10, { lineBreak: false });
  doc.fontSize(20);
  doc.text('SỔ', 0, g.so + T20, { width: PAGE_W, align: 'center', lineBreak: false });
  doc.text(COVER_TITLES[code], 0, g.so + 29 + T20, {
    width: PAGE_W,
    align: 'center',
    lineBreak: false,
  });
}

function periodLine(year: number) {
  return `từ ngày 01/01/${year} đến ngày 31/12/${year}`;
}

function drawCover1(doc: Doc, spec: BookSpec, code: CoverCode, input: BookPdfInput) {
  newPage(doc);
  const g = COVER_GEOM[code].c1;
  drawCoverCommon(doc, spec, code, input.officeName, g);
  doc.font(FONT_BOLD).fontSize(10);
  doc.text('Quyển số: 01', 491.4, g.block + T10, { lineBreak: false });
  doc.text('Thời gian sử dụng:', 491.4, g.block + LINE + T10, { lineBreak: false });
  doc
    .font(FONT_ITALIC)
    .text(periodLine(input.year), 491.4, g.block + 2 * LINE + T10, { lineBreak: false });
}

function drawCover2(
  doc: Doc,
  spec: BookSpec,
  code: CoverCode,
  input: BookPdfInput,
  totalPages: number,
) {
  newPage(doc);
  const g = COVER_GEOM[code].c2;
  drawCoverCommon(doc, spec, code, input.officeName, g);
  doc.font(FONT_BOLD).fontSize(10);
  doc.text('Quyển số: 01', 453.1, g.block + T10, { lineBreak: false });
  doc.text(`Tổng số trang: ${totalPages}`, 453.1, g.block + LINE + T10, { lineBreak: false });
  doc.text('Thời gian sử dụng:', 453.1, g.block + 2 * LINE + T10, { lineBreak: false });
  doc
    .font(FONT_ITALIC)
    .text(periodLine(input.year), 453.1, g.block + 3 * LINE + T10, { lineBreak: false });
  doc.font(FONT_BOLD).text('TRƯỞNG VĂN PHÒNG', 549.3, g.block + 58.3 + T10, {
    width: 140,
    align: 'center',
    lineBreak: false,
  });
  doc.font(FONT_ITALIC).text('(Ký tên, đóng dấu)', 549.3, g.block + 72.5 + T10, {
    width: 140,
    align: 'center',
    lineBreak: false,
  });
}

// ---------------------------------------------------------------- Trang ruột theo mẫu TT 08
const HEAD_FONT = 8;
const HEAD_LINE = 9.2;
const GAP_H = 3;
const BODY_FONT = 9;
const BODY_LINE = 10.35;
const CELL_PAD = 4;
/** Khoảng từ đỉnh chữ đến đường viết: chữ ngồi trên dòng chấm như viết tay lên mẫu giấy. */
const TEXT_ABOVE_LEADER = 8.2;
const ROW_BOTTOM_PAD = 4.7;

interface FormRow {
  readonly cells: readonly string[];
  readonly height: number;
}

const colWidth = (L: FormLayout, i: number) => (L.xs[i + 1] ?? 0) - (L.xs[i] ?? 0);

function measureRows(
  doc: Doc,
  L: FormLayout,
  spec: BookSpec,
  rows: readonly BookRowRaw[],
): FormRow[] {
  doc.font(FONT).fontSize(BODY_FONT);
  const max = L.bottom - L.numBottom - 6;
  return rows.map((r) => {
    const data = bookCells(spec, r);
    const cells = L.columnIndex.map((idx) => (idx === null ? '' : (data[idx] ?? '')));
    let textH = BODY_LINE;
    cells.forEach((c, i) => {
      if (c === '') return;
      textH = Math.max(
        textH,
        doc.heightOfString(c, {
          width: colWidth(L, i) - CELL_PAD * 2,
          lineGap: BODY_LINE - BODY_FONT * 1.15,
        }),
      );
    });
    const textTop = L.leader - TEXT_ABOVE_LEADER;
    const height = Math.min(max, Math.max(L.pitch, textTop + textH + ROW_BOTTOM_PAD));
    return { cells, height };
  });
}

/** Chia dòng vào các trang ruột; dòng cao quá một trang bị cắt ở cuối trang. */
function paginateRows(L: FormLayout, rows: readonly FormRow[]): FormRow[][] {
  const limit = L.bottom - 5;
  const pages: FormRow[][] = [[]];
  let y = L.numBottom;
  for (const row of rows) {
    if (y + row.height > limit && (pages[pages.length - 1]?.length ?? 0) > 0) {
      pages.push([]);
      y = L.numBottom;
    }
    pages[pages.length - 1]!.push(row);
    y += row.height;
  }
  return pages;
}

function strokeLine(doc: Doc, x1: number, y1: number, x2: number, y2: number, w = 0.5) {
  doc.save().lineWidth(w).moveTo(x1, y1).lineTo(x2, y2).stroke('#000000').restore();
}

function dottedLine(doc: Doc, x1: number, x2: number, y: number) {
  doc
    .save()
    .lineWidth(0.55)
    .dash(0.55, { space: 1.65 })
    .moveTo(x1, y)
    .lineTo(x2, y)
    .stroke('#000000')
    .undash()
    .restore();
}

function centeredLines(
  doc: Doc,
  lines: readonly string[],
  x0: number,
  x1: number,
  y0: number,
  y1: number,
) {
  const h = lines.reduce((s, l) => s + (l === HEADER_GAP ? GAP_H : HEAD_LINE), 0);
  let y = y0 + (y1 - y0 - h) / 2;
  doc.font(FONT_BOLD).fontSize(HEAD_FONT).fillColor('#000000');
  for (const l of lines) {
    if (l === HEADER_GAP) {
      y += GAP_H;
      continue;
    }
    // Dòng chú thích dài hơn ô thì thu cỡ chữ cho vừa (mẫu dùng chữ co hẹp), không xuống dòng thêm.
    doc.fontSize(HEAD_FONT);
    const w = doc.widthOfString(l);
    const room = x1 - x0 - 3;
    if (w > room) doc.fontSize(HEAD_FONT * (room / w));
    doc.text(l, x0, y, { width: x1 - x0, align: 'center', lineBreak: false });
    y += HEAD_LINE;
  }
}

/** Khung bảng, hàng tiêu đề và hàng đánh số cột của một trang ruột; khung ngoài là đường kép như mẫu. */
function drawFormChrome(doc: Doc, L: FormLayout) {
  const n = L.xs.length - 1;
  const x0 = L.xs[0]!;
  const xn = L.xs[n]!;
  for (const d of [-0.5, 0.5]) {
    strokeLine(doc, x0 + d, L.top - 0.5, x0 + d, L.bottom + 0.5);
    strokeLine(doc, xn + d, L.top - 0.5, xn + d, L.bottom + 0.5);
    strokeLine(doc, x0 - 0.5, L.top + d, xn + 0.5, L.top + d);
    strokeLine(doc, x0 - 0.5, L.bottom + d, xn + 0.5, L.bottom + d);
  }
  for (const c of L.cells) {
    const xa = L.xs[c.from - 1]!;
    const xb = L.xs[c.to]!;
    const ya = c.zone === 'sub' ? (L.split ?? L.top) : L.top;
    const yb = c.zone === 'group' ? (L.split ?? L.headBottom) : L.headBottom;
    doc
      .save()
      .lineWidth(0.5)
      .rect(xa, ya, xb - xa, yb - ya)
      .stroke('#000000')
      .restore();
    centeredLines(doc, c.lines, xa, xb, ya, yb);
  }
  strokeLine(doc, x0, L.headBottom, xn, L.headBottom);
  strokeLine(doc, x0, L.numBottom, xn, L.numBottom);
  doc.font(FONT_ITALIC).fontSize(HEAD_FONT).fillColor('#000000');
  for (let i = 0; i < n; i++) {
    const xa = L.xs[i]!;
    const xb = L.xs[i + 1]!;
    if (i > 0) strokeLine(doc, xa, L.headBottom, xa, L.bottom);
    doc.text(String(i + 1), xa, L.headBottom + (L.numBottom - L.headBottom - HEAD_LINE) / 2 - 0.5, {
      width: xb - xa,
      align: 'center',
      lineBreak: false,
    });
  }
}

function drawFormRow(doc: Doc, L: FormLayout, row: FormRow, top: number, height: number) {
  const n = L.xs.length - 1;
  const lineY = top + height - (L.pitch - L.leader);
  for (let i = 0; i < n; i++) {
    const xa = L.xs[i]! + CELL_PAD;
    const xb = L.xs[i + 1]! - CELL_PAD;
    const text = row.cells[i] ?? '';
    if (text === '') {
      dottedLine(doc, xa, xb, lineY);
      continue;
    }
    const centered = i === 0 || text === '✓';
    doc
      .font(text === '✓' ? FONT_TICK : FONT)
      .fontSize(BODY_FONT)
      .fillColor('#000000');
    doc.text(text, xa, top + L.leader - TEXT_ABOVE_LEADER, {
      width: xb - xa,
      height: height - (L.leader - TEXT_ABOVE_LEADER) - 1,
      align: centered ? 'center' : 'left',
      ellipsis: true,
      lineGap: BODY_LINE - BODY_FONT * 1.15,
    });
  }
}

function drawFormBook(doc: Doc, spec: BookSpec, code: CoverCode, input: BookPdfInput) {
  const L = FORM_LAYOUTS[code];
  const rows = measureRows(doc, L, spec, input.rows);
  const pages = paginateRows(L, rows);
  const total = 2 + pages.length;
  drawCover1(doc, spec, code, input);
  drawCover2(doc, spec, code, input, total);
  pages.forEach((page, p) => {
    newPage(doc);
    drawFormChrome(doc, L);
    let y = L.numBottom;
    for (const row of page) {
      drawFormRow(doc, L, row, y, row.height);
      y += row.height;
    }
    // Phần còn lại của trang giữ các dòng chấm trống như mẫu giấy.
    const blank: FormRow = { cells: [], height: L.pitch };
    while (y + L.pitch <= L.bottom - 5) {
      drawFormRow(doc, L, blank, y, L.pitch);
      y += L.pitch;
    }
    drawPageNumber(doc, 3 + p, total, Math.max(L.bottom + 14, 536));
  });
}

// ---------------------------------------------------------------- Sổ Văn thư
const VT_MARGIN = 36;
const VT_HEAD_FONT = 10.5;
const VT_BODY_FONT = 10;
const VT_PAD = 4;
const VT_MIN_ROW = 22;

function vanThuTitle(L: VanThuLayout, office: string | null, year: number): [string, string] {
  const suffix =
    office && office.trim() !== '' ? ` - ${office.trim().toLocaleUpperCase('vi-VN')}` : '';
  return [`${L.title}${suffix}`, `NĂM ${year}`];
}

function drawVanThuBook(doc: Doc, spec: BookSpec, input: BookPdfInput) {
  const L = VANTHU_LAYOUTS[spec.code as VanThuCode];
  const tableW = PAGE_W - VT_MARGIN * 2;
  const sum = L.widths.reduce((a, b) => a + b, 0);
  const widths = L.widths.map((w) => (w / sum) * tableW);
  const xs = widths.reduce<number[]>(
    (acc, w) => [...acc, (acc[acc.length - 1] ?? VT_MARGIN) + w],
    [VT_MARGIN],
  );
  const bottom = PAGE_H - 46;
  const heading = (i: number) => {
    const h = spec.columns[i]?.heading ?? '';
    return L.subHeadings?.[i] ? h.replace(/\s*\(.*\)$/, '') : h;
  };

  doc.font(FONT_BOLD).fontSize(VT_HEAD_FONT);
  let headH = 0;
  spec.columns.forEach((_, i) => {
    const sub = L.subHeadings?.[i];
    const h =
      doc.heightOfString(heading(i), { width: widths[i]! - VT_PAD * 2 }) +
      (sub ? 10 : 0) +
      VT_PAD * 2;
    headH = Math.max(headH, h);
  });
  headH = Math.max(headH, 34);

  doc.font(FONT).fontSize(VT_BODY_FONT);
  const rows = input.rows.map((r) => {
    const cells = bookCells(spec, r);
    const h = Math.max(
      VT_MIN_ROW,
      ...cells.map((c, i) =>
        c === '' ? 0 : doc.heightOfString(c, { width: widths[i]! - VT_PAD * 2 }) + VT_PAD * 2,
      ),
    );
    return { cells, h };
  });
  if (rows.length === 0) rows.push({ cells: spec.columns.map(() => ''), h: VT_MIN_ROW });

  const titleBlock = 62;
  const pages: (typeof rows)[] = [[]];
  let y = VT_MARGIN + titleBlock + headH;
  for (const r of rows) {
    if (y + r.h > bottom && (pages[pages.length - 1]?.length ?? 0) > 0) {
      pages.push([]);
      y = VT_MARGIN + headH;
    }
    pages[pages.length - 1]!.push(r);
    y += r.h;
  }

  const [t1, t2] = vanThuTitle(L, input.officeName, input.year);
  pages.forEach((page, p) => {
    newPage(doc);
    let top = VT_MARGIN;
    if (p === 0) {
      doc.font(FONT_BOLD).fontSize(15).fillColor('#000000');
      doc.text(t1, VT_MARGIN, VT_MARGIN, { width: tableW, align: 'center', lineBreak: false });
      doc.text(t2, VT_MARGIN, VT_MARGIN + 22, { width: tableW, align: 'center', lineBreak: false });
      top = VT_MARGIN + titleBlock;
    }
    // Hàng tiêu đề lặp lại ở mọi trang.
    doc.save().lineWidth(0.75);
    spec.columns.forEach((_, i) => {
      doc.rect(xs[i]!, top, widths[i]!, headH).stroke('#000000');
      doc.font(FONT_BOLD).fontSize(VT_HEAD_FONT).fillColor('#000000');
      const sub = L.subHeadings?.[i];
      const h = doc.heightOfString(heading(i), { width: widths[i]! - VT_PAD * 2 }) + (sub ? 10 : 0);
      const y0 = top + (headH - h) / 2;
      doc.text(heading(i), xs[i]! + VT_PAD, y0, {
        width: widths[i]! - VT_PAD * 2,
        align: 'center',
      });
      if (sub) {
        doc.font(FONT).fontSize(8);
        doc.text(sub, xs[i]! + 1, y0 + h - 9, {
          width: widths[i]! - 2,
          align: 'center',
          lineBreak: false,
        });
      }
    });
    doc.restore();
    let ry = top + headH;
    for (const r of page) {
      doc.save().lineWidth(0.75);
      r.cells.forEach((c, i) => {
        doc.rect(xs[i]!, ry, widths[i]!, r.h).stroke('#000000');
        if (c === '') return;
        doc.font(FONT).fontSize(VT_BODY_FONT).fillColor('#000000');
        doc.text(c, xs[i]! + VT_PAD, ry + VT_PAD, {
          width: widths[i]! - VT_PAD * 2,
          height: r.h - VT_PAD,
          align: L.centered.includes(i) ? 'center' : 'left',
          ellipsis: true,
        });
      });
      doc.restore();
      ry += r.h;
    }
    drawPageNumber(doc, p + 1, pages.length, PAGE_H - 30);
  });
}

/** Dựng PDF của một sổ (`spec`) với các dòng sổ đã lấy từ API. */
export function buildBookPdf(input: BookPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      const { spec } = input;
      if (spec.code in FORM_LAYOUTS) {
        drawFormBook(doc, spec, spec.code as CoverCode, input);
      } else drawVanThuBook(doc, spec, input);
      doc.info.Title = `${spec.form} ${input.year}`;
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
