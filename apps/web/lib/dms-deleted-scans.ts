import { getJson } from './case-api';

/** Một file scan đã xóa mềm, còn trong 30 ngày (mục "Scan đã xóa 30 ngày", chỉ Admin xem). */
export interface DeletedScanRow {
  /** `document`: scan của tài liệu trong hồ sơ; `submission`: scan của bản trình. */
  readonly kind: 'document' | 'submission';
  readonly file_id: string;
  readonly label: string;
  readonly mime: string;
  readonly size_bytes: number | string;
  readonly deleted_at: string;
  readonly deleted_by: string;
  readonly delete_reason: string;
  /** Hạn bị xóa hẳn khỏi kho. */
  readonly purge_after: string;
  readonly days_left: number;
  readonly case_id: string | null;
  readonly case_number: string | null;
  readonly case_title: string | null;
  readonly domain: string | null;
  readonly submission_id: string | null;
  readonly submission_title: string | null;
}

export interface DeletedScanList {
  readonly rows: readonly DeletedScanRow[];
  readonly total: number;
}

/** Danh sách Scan đã xóa 30 ngày. Chỉ Admin có dữ liệu; người khác nhận danh sách rỗng từ máy chủ. */
export function loadDeletedScans(
  cookie: string | null,
  p: { readonly officeId: string; readonly limit?: number; readonly offset?: number },
): Promise<DeletedScanList | 404 | 'error'> {
  const q = new URLSearchParams({
    officeId: p.officeId,
    limit: String(p.limit ?? 50),
    offset: String(p.offset ?? 0),
  });
  return getJson<DeletedScanList>(`/dms/deleted-scans?${q}`, cookie);
}

/** Đường tải một scan đã xóa (luôn là tệp tải về, chỉ Admin, không khôi phục). */
export const deletedScanDownloadHref = (row: Pick<DeletedScanRow, 'kind' | 'file_id'>): string =>
  `/api/dms/deleted-scans/${row.kind}/${row.file_id}/download`;
