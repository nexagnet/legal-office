import { messageFor } from './messages';

export interface StagedFile {
  readonly stagedId: string;
  readonly label: string;
}

export type StageResult =
  | { readonly ok: true; readonly files: readonly StagedFile[] }
  | { readonly ok: false; readonly error: string };

/** Tối đa 20 tệp một lần, khớp giới hạn của máy chủ. */
export const MAX_STAGED_FILES = 20;

/**
 * Tải từng tệp (PDF/JPEG/PNG) lên bước đệm `POST /api/dms/uploads` để gắn vào bản trình. Máy chủ tự tính băm và khóa đối
 * tượng; trả `label` là mã tệp đệm, chỉ người tải dùng được. Dừng ở tệp lỗi đầu tiên để người dùng sửa rồi gửi lại.
 */
export async function stageFiles(files: readonly File[]): Promise<StageResult> {
  if (files.length === 0)
    return { ok: false, error: 'Hãy chọn ít nhất một tệp PDF, JPEG hoặc PNG.' };
  if (files.length > MAX_STAGED_FILES)
    return { ok: false, error: `Mỗi lần chỉ gửi tối đa ${MAX_STAGED_FILES} tệp.` };
  const staged: StagedFile[] = [];
  for (const file of files) {
    if (file.size === 0) return { ok: false, error: `Tệp "${file.name}" rỗng.` };
    try {
      const res = await fetch('/api/dms/uploads', {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string; label?: string };
      if (!res.ok || !json.label)
        return { ok: false, error: `Tệp "${file.name}": ${messageFor(json.code)}` };
      staged.push({ stagedId: json.label, label: file.name });
    } catch {
      return { ok: false, error: 'Không kết nối được máy chủ. Vui lòng thử lại.' };
    }
  }
  return { ok: true, files: staged };
}
