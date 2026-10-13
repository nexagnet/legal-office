import { createHash, randomUUID } from 'node:crypto';
import {
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { FILE_STORE, type FileStore } from '../storage/file-store';
import { respond, type Reply } from './vibang.controller';
import { VibangRepo } from './vibang.repo';

/** Bản scan cuối giấy thường vài MB; 25 MB đủ cho bản scan nhiều trang và chặn tải khổng lồ. */
export const MAX_SCAN_BYTES = 25 * 1024 * 1024;
const PDF_MAGIC = Buffer.from('%PDF-');

/** Phần của Express request mà ta dùng: một luồng byte. Không kéo kiểu Express vào chỉ vì một luồng. */
interface RawBody {
  [Symbol.asyncIterator](): AsyncIterator<Buffer | string>;
}

async function readCapped(req: RawBody, declared: number | undefined): Promise<Buffer> {
  if (declared !== undefined && declared > MAX_SCAN_BYTES)
    throw new HttpException({ code: 'FILE_TOO_LARGE', label: null }, HttpStatus.PAYLOAD_TOO_LARGE);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    total += buf.length;
    if (total > MAX_SCAN_BYTES)
      throw new HttpException(
        { code: 'FILE_TOO_LARGE', label: null },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

@Controller('vibang')
@UseGuards(ActorGuard)
export class VibangFilesController {
  constructor(
    @Inject(VibangRepo) private readonly repo: VibangRepo,
    @Optional() @Inject(FILE_STORE) private readonly store: FileStore | null,
  ) {}

  /**
   * Tải lên bản scan cuối (PDF). Thân yêu cầu là chính tệp (Content-Type: application/pdf).
   * Máy chủ tự tính sha256/kích thước và đặt khoá đối tượng — client không được chọn. Quyền do DB quyết định
   * (`vibang_add_document`); nếu bị từ chối thì tệp vừa ghi bị xoá để không để lại tệp mồ côi.
   */
  @Post('cases/:id/final-scan')
  @HttpCode(HttpStatus.OK)
  async uploadFinalScan(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: RawBody,
  ): Promise<Reply> {
    if (!this.store)
      throw new HttpException(
        { code: 'FILE_STORE_NOT_CONFIGURED', label: null },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    if (contentType?.split(';')[0]?.trim().toLowerCase() !== 'application/pdf')
      throw new HttpException(
        { code: 'INVALID_DOCUMENT', label: null },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const declared =
      contentLength && /^\d+$/.test(contentLength) ? Number(contentLength) : undefined;
    const bytes = await readCapped(req, declared);
    if (bytes.length === 0 || !bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC))
      throw new HttpException(
        { code: 'INVALID_DOCUMENT', label: null },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const key = `t/${a.tenantId}/vibang/${id}/final-scan/${randomUUID()}.pdf`;
    await this.store.put(key, bytes, 'application/pdf');
    try {
      const op = await this.repo.call(a.tenantId, 'vibang_add_document', [
        a.tenantId,
        id,
        a.userId,
        'FINAL_SCAN',
        'UPLOADED',
        key,
        sha256,
        'application/pdf',
        bytes.length,
      ]);
      return respond(op);
    } catch (e) {
      await this.store.delete(key).catch(() => undefined);
      throw e;
    }
  }
}
