import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { N09Form, N10Form } from '../components/DmsStatForms';
import type { DmsReportRow } from '../lib/dms';

const rows = [
  { domain: 'tongdat', recorded_cases: 7 },
  { domain: 'vibang', recorded_cases: 3 },
  { domain: 'xacminh', recorded_cases: 2 },
] as unknown as DmsReportRow[];

const headerCells = (name: string) =>
  Array.from(screen.getByRole('table', { name }).querySelectorAll('thead tr')).map(
    (tr) => tr.children.length,
  );

describe('mẫu TP-THV-N-09 / N-10', () => {
  it('N-09: đủ 15 cột đánh số, điền số tống đạt, vi bằng, xác minh; không điền tiền', () => {
    render(<N09Form unit="VP Hai Bà Trưng" year={2026} rows={rows} />);
    expect(screen.getByText('TP-THV-N-09')).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Mẫu TP-THV-N-09 năm 2026' });
    const numbering = table.querySelectorAll('thead tr')[3]!.children;
    expect(numbering.length).toBe(16);
    const first = Array.from(table.querySelectorAll('tbody tr')[0]!.children).map(
      (c) => c.textContent,
    );
    expect(first).toEqual([
      '1',
      'VP Hai Bà Trưng',
      '',
      '7',
      '',
      '',
      '',
      '',
      '',
      '',
      '3',
      '',
      '2',
      '',
      '',
      '',
    ]);
    expect(headerCells('Mẫu TP-THV-N-09 năm 2026').slice(0, 3)).toEqual([8, 3, 12]);
  });

  it('N-10: 16 cột đánh số, ô số liệu để trống cho văn phòng điền', () => {
    render(<N10Form unit="VP Hai Bà Trưng" year={2026} />);
    expect(screen.getByText('TP-THV-N-10')).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Mẫu TP-THV-N-10 năm 2026' });
    expect(table.querySelectorAll('thead tr')[2]!.children.length).toBe(17);
    const cells = Array.from(table.querySelectorAll('tbody tr')[0]!.children).map(
      (c) => c.textContent,
    );
    expect(cells.slice(0, 2)).toEqual(['1', 'VP Hai Bà Trưng']);
    expect(cells.slice(2).every((c) => c === '')).toBe(true);
  });
});
