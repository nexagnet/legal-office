import { HttpException, HttpStatus } from '@nestjs/common';
import type { FileStore } from './file-store';
import { receiveFile, type RawBody, type ReceivedFile } from './upload';

/** Định dạng chứng cứ chung cho tống đạt, xác minh, thi hành án: bản scan hoặc ảnh chụp. */
export const EVIDENCE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

interface Upload {
  readonly contentType: string | undefined;
  readonly contentLength: string | undefined;
  readonly body: RawBody;
}

/**
 * Nhận một tệp chứng cứ, lưu vào kho, rồi gọi `record` để DB quyết định quyền và ghi nhận. `record` từ chối hoặc lỗi
 * (ném ngoại lệ) thì tệp vừa ghi bị xoá để không để lại tệp mồ côi. Chưa cấu hình kho thì 503, không giả vờ lưu.
 * `keyFor` do máy chủ dựng; client không được chọn khoá đối tượng.
 */
export async function recordWithUpload<T>(
  store: FileStore | null,
  upload: Upload,
  keyFor: (file: ReceivedFile) => string,
  record: (key: string, file: ReceivedFile) => Promise<T>,
): Promise<T> {
  if (!store)
    throw new HttpException(
      { code: 'FILE_STORE_NOT_CONFIGURED', label: null },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  const file = await receiveFile(upload.body, upload.contentType, upload.contentLength, [
    ...EVIDENCE_TYPES,
  ]);
  const key = keyFor(file);
  await store.put(key, file.bytes, file.mime);
  try {
    return await record(key, file);
  } catch (e) {
    await store.delete(key).catch(() => undefined);
    throw e;
  }
}
