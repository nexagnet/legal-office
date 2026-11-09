/**
 * Tải một tệp tài liệu cũ lên từ trình duyệt: băm sha256, xin liên kết ký sẵn, PUT thẳng lên kho (R2/S3), đăng ký.
 * Máy chủ web/API không chịu tải nội dung tệp. Tệp lớn hơn LEGACY_BROWSER_MAX_BYTES dùng công cụ lo-import
 * (trình duyệt phải đọc cả tệp vào bộ nhớ để băm).
 */
export const LEGACY_BROWSER_MAX_BYTES = 200 * 1024 ** 2;

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
};

/** Loại tệp: ưu tiên loại trình duyệt báo, nếu trống thì suy từ đuôi tệp (OCR dựa vào PDF/ảnh). */
export function legacyMimeOf(name: string, type: string): string {
  if (type && /^[a-z0-9][\w.+-]*\/[a-z0-9][\w.+-]*$/i.test(type)) return type.toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

/** Đường dẫn trong kho: thư mục tuỳ chọn + tên tệp; bỏ ký tự máy chủ từ chối. */
export function legacyRelPath(folder: string, fileName: string): string {
  const clean = (s: string) =>
    s
      .replaceAll('\\', '/')
      .split('/')
      .map((p) => p.trim())
      .filter((p) => p && p !== '.' && p !== '..')
      .join('/');
  const dir = clean(folder);
  const name = clean(fileName).replaceAll('/', '_');
  return dir ? `${dir}/${name}` : name;
}

export async function sha256Hex(file: Blob): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type LegacyStep = 'hash' | 'prepare' | 'put' | 'complete';

export interface LegacyUploadResult {
  readonly ok: boolean;
  /** Mã lỗi của API hoặc mã nội bộ (NETWORK, PUT_FAILED, FILE_TOO_BIG, EMPTY_FILE). */
  readonly code?: string;
  readonly fileId?: string | null;
  readonly deduplicated?: boolean;
}

export interface LegacyUploadDeps {
  readonly fetchJson: (
    path: string,
    body: unknown,
  ) => Promise<{ status: number; json: Record<string, unknown> }>;
  readonly put: (
    url: string,
    headers: Record<string, string>,
    file: Blob,
    onProgress: (fraction: number) => void,
  ) => Promise<boolean>;
  readonly hash: (file: Blob) => Promise<string>;
}

export const browserDeps: LegacyUploadDeps = {
  hash: sha256Hex,
  fetchJson: async (path, body) => {
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      json: (await res.json().catch(() => ({}))) as Record<string, unknown>,
    };
  },
  put: (url, headers, file, onProgress) =>
    new Promise((resolve) => {
      const x = new XMLHttpRequest();
      x.open('PUT', url);
      for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
      x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      x.onload = () => resolve(x.status >= 200 && x.status < 300);
      x.onerror = () => resolve(false);
      x.ontimeout = () => resolve(false);
      x.send(file);
    }),
};

/** Tải một tệp vào đợt `batchId`. Gọi lại an toàn sau khi lỗi (máy chủ bỏ qua tệp đã đăng ký, không ghi đè). */
export async function uploadLegacyFile(
  batchId: string,
  file: File,
  relPath: string,
  hooks: { onStep: (s: LegacyStep) => void; onProgress: (f: number) => void },
  deps: LegacyUploadDeps = browserDeps,
): Promise<LegacyUploadResult> {
  if (file.size === 0) return { ok: false, code: 'EMPTY_FILE' };
  if (file.size > LEGACY_BROWSER_MAX_BYTES) return { ok: false, code: 'FILE_TOO_BIG' };
  const mime = legacyMimeOf(file.name, file.type);
  try {
    hooks.onStep('hash');
    const sha256 = await deps.hash(file);
    const meta = {
      relPath,
      size: file.size,
      sha256,
      mime,
      mtime: new Date(file.lastModified).toISOString(),
    };
    hooks.onStep('prepare');
    const prep = await deps.fetchJson(`/dms/legacy/batches/${batchId}/files/prepare`, meta);
    if (prep.status >= 300) return { ok: false, code: String(prep.json.code ?? 'ERROR') };
    if (prep.json.status === 'REGISTERED') {
      return { ok: true, deduplicated: true, fileId: (prep.json.fileId as string | null) ?? null };
    }
    hooks.onStep('put');
    const putOk = await deps.put(
      String(prep.json.url),
      (prep.json.headers as Record<string, string>) ?? {},
      file,
      hooks.onProgress,
    );
    if (!putOk) return { ok: false, code: 'PUT_FAILED' };
    hooks.onStep('complete');
    const done = await deps.fetchJson(`/dms/legacy/batches/${batchId}/files/complete`, meta);
    if (done.status >= 300) return { ok: false, code: String(done.json.code ?? 'ERROR') };
    return { ok: true, deduplicated: false, fileId: (done.json.fileId as string | null) ?? null };
  } catch {
    return { ok: false, code: 'NETWORK' };
  }
}

const LEGACY_MESSAGES: Record<string, string> = {
  EMPTY_FILE: 'Tệp rỗng.',
  FILE_TOO_BIG: 'Tệp quá lớn để tải bằng trình duyệt (tối đa 200 MB). Dùng công cụ lo-import.',
  FILE_TOO_LARGE: 'Tệp lớn hơn 5 GB, kho không nhận.',
  NETWORK: 'Mất kết nối. Bấm Thử lại.',
  PUT_FAILED: 'Tải lên kho không thành công (mạng hoặc kho từ chối). Bấm Thử lại.',
  UPLOAD_NOT_COMPLETE: 'Kho chưa nhận đủ tệp. Bấm Thử lại.',
  UPLOAD_SIZE_MISMATCH: 'Kích thước tệp trên kho không khớp. Bấm Thử lại.',
  PATH_CONFLICT: 'Đã có tệp cùng đường dẫn nhưng khác nội dung (không ghi đè).',
  BATCH_CLOSED: 'Đợt tải đã đóng. Tải lại trang để bắt đầu đợt mới.',
  PERMISSION_DENIED: 'Bạn không có quyền tải tài liệu cũ lên.',
  BATCH_NOT_FOUND: 'Không có quyền hoặc không tìm thấy đợt tải.',
  DIRECT_UPLOAD_NOT_SUPPORTED: 'Máy chủ chưa dùng kho R2/S3 nên chưa tải lên được.',
  FILE_STORE_NOT_CONFIGURED: 'Máy chủ chưa cấu hình kho tệp.',
};
export const legacyUploadMessage = (code?: string): string =>
  LEGACY_MESSAGES[code ?? ''] ?? `Lỗi: ${code ?? 'không rõ'}`;

export type LegacyOcrStatus = 'NONE' | 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';
const OCR_LABEL: Record<LegacyOcrStatus, string> = {
  NONE: 'Không OCR',
  PENDING: 'Chờ OCR',
  RUNNING: 'Đang OCR',
  DONE: 'Đã OCR',
  FAILED: 'OCR lỗi',
  SKIPPED: 'Không OCR được',
};
export const legacyOcrLabel = (s: string): string => OCR_LABEL[s as LegacyOcrStatus] ?? s;
