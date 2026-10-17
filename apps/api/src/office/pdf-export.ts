import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import PDFDocument from 'pdfkit';
import type { SheetSpec } from './xlsx-export';

export const PDF_MIME = 'application/pdf';

// DejaVu Sans phủ đủ chữ tiếng Việt; font chuẩn của PDF (Helvetica) thì không.
const nodeRequire = createRequire(__filename);
const FONT_DIR = join(dirname(nodeRequire.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
const FONT = join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = join(FONT_DIR, 'DejaVuSans-Bold.ttf');

const MARGIN = 36;
const CELL_PAD = 3;
const SIZE = 8;

/**
 * Một bảng PDF khổ A4 ngang: tiêu đề, dòng lưu ý, hàng tiêu đề cột lặp lại mỗi trang rồi các dòng dữ liệu.
 * Bản in hỗ trợ theo dõi, không phải biểu mẫu chính thức (lưu ý do người gọi truyền vào).
 */
export function buildPdf(spec: SheetSpec): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: MARGIN,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = doc.page.width - MARGIN * 2;
    const cols = spec.columns.length;
    // Cột đầu (STT) hẹp, các cột còn lại chia đều.
    const first = cols > 1 ? Math.min(40, width / cols) : width;
    const rest = cols > 1 ? (width - first) / (cols - 1) : 0;
    const widths = spec.columns.map((_, i) => (i === 0 ? first : rest));

    doc.font(FONT_BOLD).fontSize(13).text(spec.title, MARGIN, MARGIN, { width });
    doc.moveDown(0.3).font(FONT).fontSize(SIZE).fillColor('#555555').text(spec.notice, { width });
    doc.fillColor('#000000').moveDown(0.6);

    const rowHeight = (cells: readonly (string | number | null)[], bold: boolean) => {
      doc.font(bold ? FONT_BOLD : FONT).fontSize(SIZE);
      return (
        Math.max(
          ...cells.map((v, i) =>
            doc.heightOfString(v === null ? '' : String(v), {
              width: (widths[i] ?? rest) - CELL_PAD * 2,
            }),
          ),
          SIZE,
        ) +
        CELL_PAD * 2
      );
    };
    const drawRow = (cells: readonly (string | number | null)[], bold: boolean) => {
      const h = rowHeight(cells, bold);
      if (doc.y + h > doc.page.height - MARGIN) {
        doc.addPage();
        drawRow(spec.columns, true);
      }
      const y = doc.y;
      let x = MARGIN;
      cells.forEach((v, i) => {
        const w = widths[i] ?? rest;
        if (bold) doc.rect(x, y, w, h).fillAndStroke('#EEEEEE', '#999999');
        else doc.rect(x, y, w, h).stroke('#999999');
        doc
          .fillColor('#000000')
          .font(bold ? FONT_BOLD : FONT)
          .fontSize(SIZE)
          .text(v === null ? '' : String(v), x + CELL_PAD, y + CELL_PAD, {
            width: w - CELL_PAD * 2,
          });
        x += w;
      });
      doc.x = MARGIN;
      doc.y = y + h;
    };

    drawRow(spec.columns, true);
    spec.rows.forEach((r) => drawRow(r, false));
    if (spec.rows.length === 0) {
      doc.moveDown(0.5).font(FONT).fontSize(SIZE).text('Không có dữ liệu trong kỳ.', MARGIN, doc.y);
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      // Chân trang nằm trong lề dưới; không hạ lề thì pdfkit tự thêm một trang trắng.
      doc.page.margins.bottom = 0;
      doc
        .font(FONT)
        .fontSize(7)
        .fillColor('#777777')
        .text(`Trang ${i + 1}/${range.count}`, MARGIN, doc.page.height - MARGIN + 10, {
          width,
          align: 'right',
          lineBreak: false,
        });
    }
    doc.end();
  });
}
