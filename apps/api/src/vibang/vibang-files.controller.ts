import { randomUUID } from 'node:crypto';
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
import { receiveFile, type RawBody } from '../storage/upload';
import { respond, type Reply } from './vibang.controller';
import { VibangRepo } from './vibang.repo';

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
    const file = await receiveFile(req, contentType, contentLength, ['application/pdf']);
    const key = `t/${a.tenantId}/vibang/${id}/final-scan/${randomUUID()}.${file.extension}`;
    await this.store.put(key, file.bytes, file.mime);
    try {
      const op = await this.repo.call(a.tenantId, 'vibang_add_document', [
        a.tenantId,
        id,
        a.userId,
        'FINAL_SCAN',
        'UPLOADED',
        key,
        file.sha256,
        file.mime,
        file.bytes.length,
      ]);
      return respond(op);
    } catch (e) {
      await this.store.delete(key).catch(() => undefined);
      throw e;
    }
  }
}
