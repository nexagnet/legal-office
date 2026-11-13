import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  /** `onProgress(đã xong, tổng)` được gọi khi biết tổng số trang và sau mỗi trang; lỗi của callback không làm hỏng OCR. */
  recognize(bytes: Buffer, mime: string, onProgress?: OcrProgress): Promise<OcrOutput>;
}

export type OcrProgress = (done: number, total: number) => void | Promise<void>;

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/tiff': 'tif',
  'image/webp': 'webp',
};
const MAX_PAGES = 50;
const DEFAULT_PDF_DPI = 200;
/** Một lệnh (pdftoppm một trang, tesseract một trang). Job chạy 0.2 vCPU: 300 dpi, nhiều trang vượt 120 giây. */
const DEFAULT_PAGE_TIMEOUT_MS = 240_000;
/** pdftotext và pdfinfo chỉ đọc cấu trúc tệp nên nhanh. */
const QUICK_TIMEOUT_MS = 120_000;

export interface TesseractOptions {
  /** Hết giờ cho từng trang (dựng ảnh hoặc nhận dạng), mili giây. */
  readonly pageTimeoutMs?: number;
  /** Độ phân giải dựng ảnh từ PDF. */
  readonly dpi?: number;
  /** Chỉ dùng cho test: thay execFile. */
  readonly exec?: ExecFn;
}

export type ExecFn = (
  file: string,
  args: string[],
  opts: { timeout: number; env?: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr?: string }>;

function positiveInt(v: number | undefined, fallback: number): number {
  return v !== undefined && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/** Đổi lỗi tiến trình thành mã ngắn: hết giờ (bị kill bằng SIGTERM) và bị hệ điều hành kill (thường là hết RAM). */
export function classifyExecError(e: unknown): Error {
  const err = e as { killed?: boolean; signal?: string | null; code?: unknown };
  if (err.killed && err.signal !== 'SIGKILL') return new Error('OCR_TIMEOUT');
  if (err.signal === 'SIGKILL') return new Error('OCR_KILLED');
  if (err.code === 'ENOENT') return new Error('OCR_TOOL_MISSING');
  return e instanceof Error ? e : new Error('ENGINE_ERROR');
}

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
  private readonly pageTimeoutMs: number;
  private readonly dpi: number;
  private readonly exec: ExecFn;

  constructor(
    private readonly lang = 'vie',
    opts: TesseractOptions = {},
  ) {
    this.pageTimeoutMs = positiveInt(opts.pageTimeoutMs, DEFAULT_PAGE_TIMEOUT_MS);
    this.dpi = positiveInt(opts.dpi, DEFAULT_PDF_DPI);
    this.exec = opts.exec ?? ((f, a, o) => run(f, a, o));
  }

  private async call(
    file: string,
    args: string[],
    timeout: number,
    env?: NodeJS.ProcessEnv,
  ): Promise<{ stdout: string }> {
    try {
      return await this.exec(file, args, { timeout, env });
    } catch (e) {
      throw classifyExecError(e);
    }
  }

  async recognize(bytes: Buffer, mime: string, onProgress?: OcrProgress): Promise<OcrOutput> {
    const dir = await mkdtemp(join(tmpdir(), 'lo-ocr-'));
    try {
      const report = async (done: number, total: number) => {
        try {
          await onProgress?.(done, total);
        } catch {
          /* tiến độ chỉ để hiển thị */
        }
      };
      // Mỗi phần tử trả đường dẫn ảnh của một trang; PDF được dựng từng trang để không giữ cả tệp ảnh 300 dpi trong đĩa/RAM.
      let total: number;
      let image: (i: number) => Promise<string>;
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
        total = Math.min(await this.pdfPages(dir), MAX_PAGES);
        image = async (i) => {
          const base = join(dir, `p${i}`);
          await this.call(
            'pdftoppm',
            [
              '-r',
              String(this.dpi),
              '-f',
              String(i),
              '-l',
              String(i),
              '-singlefile',
              '-png',
              join(dir, 'in.pdf'),
              base,
            ],
            this.pageTimeoutMs,
          );
          return `${base}.png`;
        };
      } else {
        const ext = IMAGE_EXT[mime];
        if (!ext) throw new Error('UNSUPPORTED_MIME');
        const p = join(dir, `in.${ext}`);
        await writeFile(p, bytes);
        total = 1;
        image = async () => p;
      }
      if (total === 0) throw new Error('NO_PAGES');
      const texts: string[] = [];
      const confs: number[] = [];
      await report(0, total);
      for (let i = 1; i <= total; i += 1) {
        const img = await image(i);
        const base = img.replace(/\.[^.]+$/, '');
        // OMP_THREAD_LIMIT=1: trên CPU rất ít nhân, nhiều luồng OpenMP chỉ tranh nhau và chậm hơn.
        await this.call(
          'tesseract',
          [img, base, '-l', this.lang, '--psm', '1', 'txt', 'tsv'],
          this.pageTimeoutMs,
          { ...process.env, OMP_THREAD_LIMIT: '1' },
        );
        texts.push((await readFile(`${base}.txt`, 'utf8')).trim());
        const c = meanConfidence(await readFile(`${base}.tsv`, 'utf8'));
        if (c !== null) confs.push(c);
        await rm(img, { force: true });
        await report(texts.length, total);
      }
      const confidence = confs.length
        ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100
        : null;
      return {
        engine: 'tesseract',
        lang: this.lang,
        pages: total,
        confidence,
        text: texts.join('\n\n'),
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async pdfPages(dir: string): Promise<number> {
    const info = await this.call('pdfinfo', [join(dir, 'in.pdf')], QUICK_TIMEOUT_MS);
    const n = Number(/Pages:\s+(\d+)/.exec(info.stdout)?.[1] ?? 0);
    if (!Number.isInteger(n) || n < 1) throw new Error('PDF_NO_PAGES');
    return n;
  }

  private async pdfTextLayer(dir: string): Promise<{ text: string; pages: number } | null> {
    try {
      await this.call(
        'pdftotext',
        ['-layout', join(dir, 'in.pdf'), join(dir, 'layer.txt')],
        QUICK_TIMEOUT_MS,
      );
      const text = (await readFile(join(dir, 'layer.txt'), 'utf8')).replace(/\f/g, '\n').trim();
      if (text.replace(/\s/g, '').length < 40) return null;
      return { text, pages: await this.pdfPages(dir) };
    } catch {
      return null;
    }
  }
}
