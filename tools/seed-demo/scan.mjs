// Dựng bản scan GIẢ (PDF A4) bằng pdfkit có sẵn của API: nội dung chữ tiếng Việt khác nhau cho từng tệp.
// vector=true: vẽ chữ thành đường nét (không có lớp chữ) → PDF giống ảnh scan, buộc OCR thật (pdftoppm + Tesseract).
// vector=false: PDF có lớp chữ (OCR lấy bằng pdftotext).
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiRequire = createRequire(resolve(here, '../../apps/api/package.json'));
const PDFDocument = apiRequire('pdfkit');
const fontDir = dirname(apiRequire.resolve('@expo-google-fonts/tinos/package.json'));
const FONT = join(fontDir, '400Regular', 'Tinos_400Regular.ttf');
const FONT_BOLD = join(fontDir, '700Bold', 'Tinos_700Bold.ttf');

export function buildScan({ title, lines, footer, vector }) {
  return new Promise((ok, fail) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: title } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => ok(Buffer.concat(chunks)));
    doc.on('error', fail);
    const draw = (text, o) => {
      doc.font(o.bold ? FONT_BOLD : FONT).fontSize(o.size);
      if (!vector) return doc.text(text, o.x, o.y, { width: o.width, align: o.align ?? 'left' });
      // Vẽ từng ký tự thành đường nét bằng fontkit của pdfkit (ngắt dòng thủ công theo bề rộng).
      const font = doc._font.font;
      const scale = o.size / font.unitsPerEm;
      const words = text.split(' ');
      const rows = [];
      let cur = '';
      for (const w of words) {
        const t = cur ? `${cur} ${w}` : w;
        if (doc.widthOfString(t) > o.width && cur) {
          rows.push(cur);
          cur = w;
        } else cur = t;
      }
      rows.push(cur);
      let y = o.y;
      for (const row of rows) {
        const run = font.layout(row);
        const rowW = run.advanceWidth * scale;
        let x = o.align === 'center' ? o.x + (o.width - rowW) / 2 : o.x;
        run.glyphs.forEach((g, k) => {
          doc
            .save()
            .translate(x, y + o.size * 0.9)
            .scale(scale, -scale)
            .path(g.path.toSVG())
            .fill('#111')
            .restore();
          x += run.positions[k].xAdvance * scale;
        });
        y += o.size * 1.25;
      }
      doc.y = y;
      return doc;
    };
    const W = doc.page.width - 112;
    const put = (text, size, bold, align) =>
      draw(text, { x: 56, y: doc.y, width: W, size, bold, align });
    put('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 13, true, 'center');
    put('Độc lập – Tự do – Hạnh phúc', 12, false, 'center');
    doc.moveDown(1.2);
    put(title.toUpperCase(), 15, true, 'center');
    doc.moveDown(1);
    for (const l of lines) {
      put(l, 12.5, false, 'left');
      doc.moveDown(0.5);
    }
    doc.moveDown(2);
    put('Người lập                                              Xác nhận', 12, true, 'center');
    doc.y = doc.page.height - 80;
    put(footer, 9, false, 'center');
    doc.end();
  });
}
