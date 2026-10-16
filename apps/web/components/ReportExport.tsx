'use client';

/** Tải bảng báo cáo đang xem thành CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt). Không gọi máy chủ. */
export function ReportExport({
  rows,
  filename,
}: {
  readonly rows: readonly (readonly string[])[];
  readonly filename: string;
}) {
  function download() {
    const csv = rows
      .map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button type="button" className="primary" onClick={download} disabled={rows.length <= 1}>
      Tải CSV
    </button>
  );
}
