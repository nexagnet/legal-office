'use client';

import { Check, Copy, Download } from 'lucide-react';
import { useState } from 'react';

export interface ReportExportRow {
  readonly group: string;
  readonly label: string;
  readonly value: number | null;
  readonly prev: number | null;
  readonly status: string;
  readonly source: string;
}

const BOM = String.fromCharCode(0xfeff);
const HEADER = ['Nhóm', 'Chỉ tiêu', 'Số liệu', 'Kỳ trước', 'Khả năng tính', 'Nguồn dữ liệu'];
const cell = (v: number | null) => (v === null ? '' : String(v));
const line = (r: ReportExportRow) => [
  r.group,
  r.label,
  cell(r.value),
  cell(r.prev),
  r.status,
  r.source,
];

/** Bảng dán được vào Excel (cột cách nhau bằng Tab). */
export function reportToTsv(rows: readonly ReportExportRow[]): string {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, ' ');
  return [HEADER, ...rows.map(line)].map((l) => l.map(clean).join('\t')).join('\n');
}

/** CSV có BOM UTF-8 để Excel mở đúng tiếng Việt; ô bắt đầu bằng ký tự công thức được chặn. */
export function reportToCsv(rows: readonly ReportExportRow[]): string {
  const esc = (s: string) => {
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const body = [HEADER, ...rows.map(line)].map((l) => l.map(esc).join(',')).join('\r\n');
  return BOM + body;
}

/** Sao chép cả bảng hoặc tải CSV. Chỉ là số tham khảo để khách tự điền mẫu; hệ thống không lập báo cáo. */
export function ReportExport({
  rows,
  fileName,
}: {
  readonly rows: readonly ReportExportRow[];
  readonly fileName: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <div className="bao-cao-export">
      <button
        type="button"
        className="copy-value"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(reportToTsv(rows))
            .then(() => {
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            })
            .catch(() => undefined);
        }}
      >
        {done ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {done ? 'Đã chép' : 'Sao chép cả bảng'}
      </button>
      <button
        type="button"
        className="copy-value"
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob([reportToCsv(rows)], { type: 'text/csv;charset=utf-8' }),
          );
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        <Download size={14} aria-hidden="true" />
        Tải CSV (mở bằng Excel)
      </button>
    </div>
  );
}
