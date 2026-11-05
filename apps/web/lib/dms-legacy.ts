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
