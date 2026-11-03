import { HttpException, HttpStatus, StreamableFile } from '@nestjs/common';
import type { FileStore } from '../storage/file-store';

interface StoredFile {
  readonly object_key: string;
  readonly mime: string;
  readonly label: string;
}

type HeaderSink = { set(headers: Record<string, string>): unknown };

/**
 * Trả một tệp lấy từ kho. Quyền tải đã do hàm DB quyết định và ghi nhật ký; ở đây chỉ chặn khóa đối tượng lạ tenant
 * và đặt tiêu đề an toàn. `inline` chỉ có tác dụng với PDF/PNG/JPEG; mọi loại khác (và tệp đã xóa) luôn là tệp tải về.
 */
export async function sendStoredFile(
  store: FileStore | null,
  tenantId: string,
  file: StoredFile | undefined,
  res: HeaderSink,
  inline: boolean,
): Promise<StreamableFile> {
  if (!store)
    throw new HttpException(
      { code: 'FILE_STORE_NOT_CONFIGURED', label: null },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  const bytes =
    file && file.object_key.startsWith(`t/${tenantId}/`) ? await store.get(file.object_key) : null;
  if (!file || !bytes)
    throw new HttpException({ code: 'FILE_NOT_FOUND', label: null }, HttpStatus.NOT_FOUND);
  const previewable = inline && /^(application\/pdf|image\/(png|jpeg))$/.test(file.mime);
  res.set({
    'content-type': file.mime,
    'content-disposition': `${previewable ? 'inline' : 'attachment'}; filename="${file.label.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
    'cache-control': 'private, no-store',
    ...(previewable
      ? {
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'SAMEORIGIN',
          'content-security-policy': "frame-ancestors 'self'",
        }
      : {}),
  });
  return new StreamableFile(bytes);
}
