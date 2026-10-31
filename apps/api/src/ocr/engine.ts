import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface OcrOutput {
  readonly engine: string;
  readonly lang: string;
  readonly pages: number;
  /** Độ tin cậy trung bình 0..100 (theo engine), null nếu engine không báo. */
  readonly confidence: number | null;
  readonly text: string;
}

/** Cổng engine OCR: đổi Tesseract sang PaddleOCR chỉ cần thêm một hiện thực, không đổi worker hay DB. */
export interface OcrEngine {
  recognize(bytes: Buffer, mime: string): Promise<OcrOutput>;
}

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/tiff': 'tif',
  'image/webp': 'webp',
};
const MAX_PAGES = 50;
const PDF_DPI = '300';

/** Trung bình độ tin cậy từ TSV của Tesseract (bỏ dòng conf = -1). */
export function meanConfidence(tsv: string): number | null {
  const confs: number[] = [];
  for (const line of tsv.split('\n').slice(1)) {
    const cols = line.split('\t');
    const conf = Number(cols[10]);
    if (cols.length >= 12 && cols[11]?.trim() && Number.isFinite(conf) && conf >= 0)
      confs.push(conf);
  }
  return confs.length
    ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100
    : null;
}

/**
 * Tesseract 5 (gói `vie`) gọi qua execFile (không qua shell). PDF: lấy lớp chữ có sẵn bằng pdftotext nếu đủ dài,
 * nếu không thì pdftoppm 300 dpi rồi OCR từng trang. Tệp tạm nằm trong thư mục riêng và luôn bị xoá.
 */
export class TesseractEngine implements OcrEngine {
  constructor(
    private readonly lang = 'vie',
    private readonly timeoutMs = 120_000,
  ) {}

  async recognize(bytes: Buffer, mime: string): Promise<OcrOutput> {
    const dir = await mkdtemp(join(tmpdir(), 'lo-ocr-'));
    try {
      const images: string[] = [];
      if (mime === 'application/pdf') {
        await writeFile(join(dir, 'in.pdf'), bytes);
        const layer = await this.pdfTextLayer(dir);
        if (layer)
          return {
            engine: 'pdftotext',
            lang: this.lang,
            pages: layer.pages,
            confidence: null,
            text: layer.text,
          };
        await run(
          'pdftoppm',
          ['-r', PDF_DPI, '-l', String(MAX_PAGES), '-png', join(dir, 'in.pdf'), join(dir, 'p')],
          {
            timeout: this.timeoutMs,
          },
        );
        for (const f of (await readdir(dir)).sort())
          if (/^p-\d+\.png$/.test(f)) images.push(join(dir, f));
      } else {
        const ext = IMAGE_EXT[mime];
        if (!ext) throw new Error('UNSUPPORTED_MIME');
        const p = join(dir, `in.${ext}`);
        await writeFile(p, bytes);
        images.push(p);
      }
      if (images.length === 0) throw new Error('NO_PAGES');
      const texts: string[] = [];
      const confs: number[] = [];
      for (const img of images) {
        const base = img.replace(/\.[^.]+$/, '');
        await run('tesseract', [img, base, '-l', this.lang, '--psm', '1', 'txt', 'tsv'], {
          timeout: this.timeoutMs,
        });
        texts.push((await readFile(`${base}.txt`, 'utf8')).trim());
        const c = meanConfidence(await readFile(`${base}.tsv`, 'utf8'));
        if (c !== null) confs.push(c);
      }
      const confidence = confs.length
        ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100
        : null;
      return {
        engine: 'tesseract',
        lang: this.lang,
        pages: images.length,
        confidence,
        text: texts.join('\n\n'),
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async pdfTextLayer(dir: string): Promise<{ text: string; pages: number } | null> {
    try {
      await run('pdftotext', ['-layout', join(dir, 'in.pdf'), join(dir, 'layer.txt')], {
        timeout: this.timeoutMs,
      });
      const text = (await readFile(join(dir, 'layer.txt'), 'utf8')).replace(/\f/g, '\n').trim();
      if (text.replace(/\s/g, '').length < 40) return null;
      const info = await run('pdfinfo', [join(dir, 'in.pdf')], { timeout: this.timeoutMs });
      const pages = Number(/Pages:\s+(\d+)/.exec(info.stdout)?.[1] ?? 1);
      return { text, pages };
    } catch {
      return null;
    }
  }
}
