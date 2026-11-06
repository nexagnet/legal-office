import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TesseractEngine, meanConfidence } from './engine';
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
