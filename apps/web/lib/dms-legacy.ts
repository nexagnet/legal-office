import { getJson } from './case-api';

/** Một tệp tài liệu cũ đã nạp bằng công cụ lo-import (chỉ thêm, không sửa, không xóa). */
export interface LegacyFileRow {
  readonly id: string;
  readonly batch_id: string;
  readonly rel_path: string;
  readonly file_name: string;
  readonly size_bytes: number | string;
  readonly sha256: string;
  readonly mime: string;
  readonly source_mtime: string | null;
  readonly created_at: string;
}

export interface LegacyFileList {
  readonly rows: readonly LegacyFileRow[];
  readonly limit: number;
  readonly offset: number;
}

/** Số tệp mỗi trang của danh sách tài liệu cũ. */
export const LEGACY_PAGE_SIZE = 50;

/** Danh sách tài liệu cũ theo tiền tố đường dẫn. Cần quyền `dms.legacy.read`; thiếu quyền máy chủ trả danh sách rỗng. */
export function loadLegacyFiles(
  cookie: string | null,
  p: {
    readonly officeId: string;
    readonly prefix?: string;
    readonly limit?: number;
    readonly offset?: number;
  },
): Promise<LegacyFileList | 404 | 'error'> {
  const q = new URLSearchParams({
    officeId: p.officeId,
    prefix: p.prefix ?? '',
    limit: String(p.limit ?? LEGACY_PAGE_SIZE),
    offset: String(p.offset ?? 0),
  });
  return getJson<LegacyFileList>(`/dms/legacy/files?${q}`, cookie);
}

/** Thư mục chứa tệp: phần đường dẫn trước tên tệp (rỗng nếu tệp nằm ở gốc). */
export function legacyFolderOf(relPath: string): string {
  const i = relPath.lastIndexOf('/');
  return i < 0 ? '' : relPath.slice(0, i);
}

/** Đường mở/tải một tệp tài liệu cũ (máy chủ ghi nhật ký mỗi lần mở). */
export const legacyDownloadHref = (id: string): string => `/api/dms/legacy/files/${id}/download`;

/** Dung lượng dễ đọc: KB, MB hoặc GB. */
export function legacySizeLabel(n: number | string): string {
  const b = Number(n);
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

/** Hai công tắc của máy chủ (độc lập): chạy OCR tài liệu cũ và tìm kiếm tài liệu cũ. Lỗi thì coi như tắt. */
export async function loadLegacyFeatures(
  cookie: string | null,
): Promise<{ readonly ocr: boolean; readonly search: boolean }> {
  const r = await getJson<{ ocr: boolean; search: boolean }>('/dms/legacy/features', cookie);
  return r === 404 || r === 'error' ? { ocr: false, search: false } : r;
}

export interface LegacySearchHit {
  readonly id: string;
  readonly rel_path: string;
  readonly file_name: string;
  readonly size_bytes: number | string;
  readonly snippet: string;
  readonly page_count: number | null;
}

/** Tìm theo nội dung OCR của tài liệu cũ. Tìm kiếm tắt thì máy chủ trả 404 (LEGACY_SEARCH_DISABLED). */
export function searchLegacy(
  cookie: string | null,
  p: { readonly officeId: string; readonly q: string },
): Promise<{ readonly rows: readonly LegacySearchHit[] } | 404 | 'error'> {
  const q = new URLSearchParams({ officeId: p.officeId, q: p.q, limit: '20' });
  return getJson(`/dms/legacy/search?${q}`, cookie);
}

/** Trạng thái OCR của các tệp (khi OCR bật). Lỗi thì trả bảng rỗng. */
export async function loadLegacyOcrStatus(
  cookie: string | null,
  officeId: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const q = new URLSearchParams({ officeId, ids: ids.join(',') });
  const r = await getJson<{ rows: { file_id: string; status: string }[] }>(
    `/dms/legacy/ocr-status?${q}`,
    cookie,
  );
  return r === 404 || r === 'error' ? new Map() : new Map(r.rows.map((x) => [x.file_id, x.status]));
}
