import { describe, expect, it } from 'vitest';
import { buildPdf } from './pdf-export';

const spec = (n: number) => ({
  name: 'Báo cáo',
  title: 'Báo cáo tổng hợp từ 2026-01-01 đến 2026-10-17',
  notice: 'Bản điện tử hỗ trợ theo dõi, không phải biểu mẫu chính thức.',
  columns: ['STT', 'Nghiệp vụ', 'Trạng thái', 'Số lượng'],
  rows: Array.from({ length: n }, (_, i) => [i + 1, 'Tống đạt', 'Đã giao thành công', i]),
});

describe('buildPdf', () => {
  it('produces a PDF with an embedded Vietnamese-capable font', async () => {
    const buf = await buildPdf(spec(3));
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.toString('latin1')).toContain('DejaVuSans');
  });

  it('paginates long tables and still ends cleanly', async () => {
    const pages = async (n: number) =>
      Number(((await buildPdf(spec(n))).toString('latin1').match(/\/Count (\d+)/) ?? [])[1]);
    expect(await pages(3)).toBe(1);
    expect(await pages(200)).toBeGreaterThan(2);
  });

  it('handles an empty table', async () => {
    const buf = await buildPdf(spec(0));
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
