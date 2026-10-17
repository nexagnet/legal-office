'use client';

/** Tải bảng báo cáo đang xem thành CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt). Không gọi máy chủ. */
export function ReportExport({
  rows,
  filename,
  server,
}: {
  readonly rows: readonly (readonly string[])[];
  readonly filename: string;
  /** Đường xuất của máy chủ (`/office/...`) và tham số lọc; có thì thêm nút Excel và PDF. */
  readonly server?: { readonly path: string; readonly params: Readonly<Record<string, string>> };
}) {
  const href = (format: 'xlsx' | 'pdf') =>
    server
      ? `/api${server.path}?${new URLSearchParams({ ...server.params, format }).toString()}`
      : '';
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
    <div className="export-actions">
      {server ? (
        <>
          <a className="secondary btn-link" href={href('xlsx')}>
            Xuất Excel
          </a>
          <a className="secondary btn-link" href={href('pdf')}>
            Xuất PDF
          </a>
        </>
      ) : null}
      <button type="button" className="primary" onClick={download} disabled={rows.length <= 1}>
        Tải CSV
      </button>
    </div>
  );
}
