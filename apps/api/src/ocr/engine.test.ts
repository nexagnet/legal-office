import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TesseractEngine, classifyExecError, meanConfidence } from './engine';
import { toSearchText } from './text';

const hasTesseract =
  spawnSync('tesseract', ['--list-langs'], { encoding: 'utf8' }).stdout?.includes('vie') ?? false;

describe('meanConfidence', () => {
  it('lấy trung bình độ tin cậy của các từ, bỏ dòng không có chữ', () => {
    const head = 'level\tpage\tblock\tpar\tline\tword\tleft\ttop\twidth\theight\tconf\ttext';
    const row = (c: number, t: string) => `5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t${c}\t${t}`;
    expect(
      meanConfidence([head, row(90, 'a'), row(80, 'b'), row(-1, ''), row(95, ' ')].join('\n')),
    ).toBe(85);
    expect(meanConfidence(head)).toBeNull();
  });
});

// Scan mẫu TỔNG HỢP (văn bản giả, không dữ liệu thật). Chỉ chạy khi máy có tesseract + gói vie (image lo-ocr có sẵn).
describe.skipIf(!hasTesseract)('TesseractEngine trên scan mẫu tổng hợp', () => {
  it('đọc được các từ khoá tiếng Việt có dấu', async () => {
    const png = readFileSync(resolve(__dirname, 'fixtures/mau-bien-ban-tong-dat.png'));
    const out = await new TesseractEngine().recognize(png, 'image/png');
    const folded = toSearchText(out.text);
    for (const k of ['tong dat', 'nguyen van an', 'hai ba trung', 'quyet dinh', 'thanh toan'])
      expect(folded).toContain(k);
    expect(out.confidence).toBeGreaterThan(70);
  }, 60_000);
});

// exec giả: kiểm luồng PDF từng trang, tham số, tiến độ và mã lỗi mà không cần poppler/tesseract.
describe('TesseractEngine với exec giả', () => {
  type Call = { file: string; args: string[]; timeout: number; env?: NodeJS.ProcessEnv };
  const TSV_HEAD = 'level\tpage\tblock\tpar\tline\tword\tleft\ttop\twidth\theight\tconf\ttext';

  function fake(opts: { pages?: number; failOn?: (c: Call) => unknown }) {
    const calls: Call[] = [];
    const exec = async (
      file: string,
      args: string[],
      o: { timeout: number; env?: NodeJS.ProcessEnv },
    ) => {
      const c: Call = { file, args, ...o };
      calls.push(c);
      const err = opts.failOn?.(c);
      if (err) throw err;
      if (file === 'pdftotext') await writeFile(args[args.length - 1] as string, '');
      if (file === 'pdfinfo') return { stdout: `Pages:          ${opts.pages ?? 1}\n` };
      if (file === 'pdftoppm') await writeFile(`${args[args.length - 1]}.png`, 'x');
      if (file === 'tesseract') {
        const base = args[1] as string;
        await writeFile(`${base}.txt`, `trang ${basename(base)}\n`);
        await writeFile(`${base}.tsv`, `${TSV_HEAD}\n5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t90\tx`);
      }
      return { stdout: '' };
    };
    return { calls, exec };
  }

  it('PDF scan: dựng và nhận dạng từng trang, 200 dpi, báo tiến độ, tesseract một luồng', async () => {
    const f = fake({ pages: 3 });
    const progress: string[] = [];
    const out = await new TesseractEngine('vie', { exec: f.exec, pageTimeoutMs: 5000 }).recognize(
      Buffer.from('%PDF'),
      'application/pdf',
      (d, t) => void progress.push(`${d}/${t}`),
    );
    expect(out.pages).toBe(3);
    expect(out.engine).toBe('tesseract');
    expect(out.confidence).toBe(90);
    expect(progress).toEqual(['0/3', '1/3', '2/3', '3/3']);
    const ppm = f.calls.filter((c) => c.file === 'pdftoppm');
    expect(ppm.map((c) => c.args[c.args.indexOf('-f') + 1])).toEqual(['1', '2', '3']);
    expect(ppm.every((c) => c.args[c.args.indexOf('-r') + 1] === '200')).toBe(true);
    expect(ppm.every((c) => c.timeout === 5000)).toBe(true);
    const tess = f.calls.filter((c) => c.file === 'tesseract');
    expect(tess).toHaveLength(3);
    expect(tess.every((c) => c.env?.OMP_THREAD_LIMIT === '1' && c.timeout === 5000)).toBe(true);
  });

  it('hết giờ thì lỗi OCR_TIMEOUT, bị kill SIGKILL thì OCR_KILLED, thiếu công cụ thì OCR_TOOL_MISSING', async () => {
    const run = (e: unknown) =>
      new TesseractEngine('vie', {
        exec: fake({ pages: 2, failOn: (c) => (c.file === 'tesseract' ? e : null) }).exec,
      }).recognize(Buffer.from('%PDF'), 'application/pdf');
    await expect(run({ killed: true, signal: 'SIGTERM', code: null })).rejects.toThrow(
      'OCR_TIMEOUT',
    );
    await expect(run({ killed: false, signal: 'SIGKILL', code: null })).rejects.toThrow(
      'OCR_KILLED',
    );
    await expect(run({ code: 'ENOENT' })).rejects.toThrow('OCR_TOOL_MISSING');
  });

  it('PDF không đọc được số trang thì lỗi PDF_NO_PAGES; ảnh sai định dạng thì UNSUPPORTED_MIME', async () => {
    const f = fake({ pages: 0 });
    await expect(
      new TesseractEngine('vie', { exec: f.exec }).recognize(Buffer.from('x'), 'application/pdf'),
    ).rejects.toThrow('PDF_NO_PAGES');
    await expect(
      new TesseractEngine('vie', { exec: f.exec }).recognize(Buffer.from('x'), 'image/gif'),
    ).rejects.toThrow('UNSUPPORTED_MIME');
  });

  it('classifyExecError giữ nguyên lỗi khác (thoát mã khác 0)', () => {
    const e = Object.assign(new Error('Command failed'), { code: 1 });
    expect(classifyExecError(e)).toBe(e);
  });
});
