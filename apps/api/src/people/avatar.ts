import { HttpException, HttpStatus } from '@nestjs/common';
import type { RawBody } from '../storage/upload';

/** Ảnh đại diện tối đa 2 MB (web thu nhỏ trước khi gửi nên thường dưới 200 KB). */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const EXTENSION: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Chữ ký đầu tệp khớp loại khai báo: không tin Content-Type của client. */
function matchesSignature(mime: string, b: Buffer): boolean {
  if (mime === 'image/jpeg') return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === 'image/png')
    return (
      b.length > 8 &&
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  if (mime === 'image/webp')
    return (
      b.length > 12 &&
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP'
    );
  return false;
}

const fail = (status: HttpStatus, code: string): never => {
  throw new HttpException({ code, label: null }, status);
};

export interface ReceivedAvatar {
  readonly bytes: Buffer;
  readonly mime: string;
  readonly extension: string;
}

/** Nhận ảnh đại diện: chỉ jpeg/png/webp, tối đa 2 MB (cả khi client khai sai Content-Length), kiểm chữ ký đầu tệp. */
export async function receiveAvatar(
  req: RawBody,
  contentType: string | undefined,
  contentLength: string | undefined,
): Promise<ReceivedAvatar> {
  const mime = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!EXTENSION[mime]) return fail(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_DOCUMENT');
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_AVATAR_BYTES)
    return fail(HttpStatus.PAYLOAD_TOO_LARGE, 'FILE_TOO_LARGE');
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    total += buf.length;
    if (total > MAX_AVATAR_BYTES) return fail(HttpStatus.PAYLOAD_TOO_LARGE, 'FILE_TOO_LARGE');
    chunks.push(buf);
  }
  const bytes = Buffer.concat(chunks);
  if (!matchesSignature(mime, bytes))
    return fail(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_DOCUMENT');
  return { bytes, mime, extension: EXTENSION[mime]! };
}
