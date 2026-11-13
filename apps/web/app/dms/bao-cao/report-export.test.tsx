import { describe, expect, it } from 'vitest';
import { reportToCsv, reportToTsv, type ReportExportRow } from '../../../components/ReportExport';

const rows: ReportExportRow[] = [
  { group: 'A', label: 'Số "vi bằng"', value: 5, prev: null, status: 'Tính được', source: 'S-02' },
  { group: 'A', label: '=HYPERLINK("x")', value: null, prev: 3, status: 'Chưa đủ', source: 'a\tb' },
];

describe('xuất bảng báo cáo', () => {
  it('TSV: cột cách bằng Tab, ô rỗng khi chưa tính được', () => {
    const lines = reportToTsv(rows).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('A\tSố "vi bằng"\t5\t\tTính được\tS-02');
    expect(lines[2]?.split('\t')).toHaveLength(6);
  });

  it('CSV: có BOM, escape dấu nháy kép và chặn công thức', () => {
    const csv = reportToCsv(rows);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Số ""vi bằng"""');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
