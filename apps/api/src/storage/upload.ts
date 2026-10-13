import { createHash } from 'node:crypto';
import { HttpException, HttpStatus } from '@nestjs/common';

/** Tệp tải lên tối đa 25 MB: đủ cho bản scan nhiều trang, chặn tải khổng lồ. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Phần của Express request mà ta dùng: một luồng byte. Không kéo kiểu Express vào chỉ vì một luồng. */
export interface RawBody {
  [Symbol.asyncIterator](): AsyncIterator<Buffer | string>;
}

const SIGNATURES: Readonly<Record<string, Buffer>> = {
  'application/pdf': Buffer.from('%PDF-'),
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
};
const EXTENSION: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export interface ReceivedFile {
  readonly bytes: Buffer;
  readonly mime: string;
  readonly sha256: string;
  readonly extension: string;
}

const fail = (status: HttpStatus, code: string): never => {
  throw new HttpException({ code, label: null }, status);
};

/**
 * Nhận một tệp từ thân yêu cầu: kiểm tra content-type nằm trong danh sách cho phép, giới hạn kích thước (cả khi
 * client khai sai Content-Length), kiểm tra chữ ký đầu tệp khớp loại, rồi tính sha256. Không tin tên tệp của client.
 */
export async function receiveFile(
  req: RawBody,
  contentType: string | undefined,
  contentLength: string | undefined,
  allowed: readonly string[],
): Promise<ReceivedFile> {
  const mime = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  const signature = SIGNATURES[mime];
  if (!allowed.includes(mime) || !signature)
    return fail(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_DOCUMENT');
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_UPLOAD_BYTES)
    return fail(HttpStatus.PAYLOAD_TOO_LARGE, 'FILE_TOO_LARGE');
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    total += buf.length;
    if (total > MAX_UPLOAD_BYTES) return fail(HttpStatus.PAYLOAD_TOO_LARGE, 'FILE_TOO_LARGE');
    chunks.push(buf);
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length === 0 || !bytes.subarray(0, signature.length).equals(signature))
    return fail(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_DOCUMENT');
  return {
    bytes,
    mime,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    extension: EXTENSION[mime]!,
  };
}
