import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { recordWithUpload } from '../storage/evidence';
import { FILE_STORE, type FileStore } from '../storage/file-store';
import type { RawBody } from '../storage/upload';
import { VibangRepo } from '../vibang/vibang.repo';
import { parse, respond, uuid } from './dms-http';

const changes = z
  .object({
    title: z.string().min(1).max(500).optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/**
 * Yêu cầu sửa đổi hồ sơ ĐÃ ghi sổ. Bắt buộc lý do và bản scan văn bản sửa đổi (thân yêu cầu là tệp). Admin: có hiệu lực ngay;
 * người khác: chờ Admin duyệt, hoặc tự duyệt nếu gửi trong cửa sổ N giờ sau khi ghi sổ. Quyền do hàm `dms_*` quyết định.
 * Lát này mở HTTP cho sửa tiêu đề/thuộc tính hồ sơ và thuộc tính tài liệu; thêm phiên bản tệp mới đã có ở DB, HTTP làm sau
 * (cần tải lên hai tệp trong một yêu cầu).
 */
@Controller('dms')
@UseGuards(ActorGuard)
export class DmsAmendmentsController {
  constructor(
    @Inject(VibangRepo) private readonly repo: VibangRepo,
    @Optional() @Inject(FILE_STORE) private readonly store: FileStore | null,
  ) {}

  @Post('cases/:id/amendments')
  @HttpCode(HttpStatus.OK)
  propose(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: RawBody,
  ) {
    const q = parse(
      z
        .object({
          documentId: uuid.optional(),
          reason: z.string().min(1).max(2000),
          n11: z.enum(['true', 'false']).default('false'),
          changes: z.string().min(2).max(20000),
        })
        .strict(),
      query,
    );
    let parsedChanges: z.infer<typeof changes>;
    try {
      parsedChanges = parse(changes, JSON.parse(q.changes));
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        { code: 'INVALID_INPUT', label: null },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const kind = q.documentId ? 'DOCUMENT_FIELDS' : 'CASE_FIELDS';
    const proposed =
      kind === 'DOCUMENT_FIELDS' ? { attributes: parsedChanges.attributes ?? {} } : parsedChanges;
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/dms/amendments/${randomUUID()}.${f.extension}`,
      (key, f) =>
        this.repo
          .call(a.tenantId, 'dms_amendment_propose', [
            a.tenantId,
            a.userId,
            id,
            q.documentId ?? null,
            null,
            kind,
            JSON.stringify(proposed),
            q.reason,
            q.n11 === 'true',
            key,
            f.sha256,
            f.mime,
            f.bytes.length,
          ])
          .then(respond),
    );
  }

  @Get('amendments')
  list(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(
      z
        .object({
          officeId: uuid,
          caseId: uuid.optional(),
          status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
          limit: z.coerce.number().int().min(1).max(500).default(100),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .strict(),
      query,
    );
    return this.repo
      .rows(a.tenantId, 'dms_list_amendments', [
        a.tenantId,
        a.userId,
        q.officeId,
        q.caseId ?? null,
        q.status ?? null,
        q.limit,
        q.offset,
      ])
      .then((rows) => ({ rows }));
  }

  @Post('amendments/:id/review')
  @HttpCode(HttpStatus.OK)
  review(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ approve: z.boolean(), note: z.string().max(2000).optional() }).strict(),
      body,
    );
    return this.repo
      .call(a.tenantId, 'dms_amendment_review', [
        a.tenantId,
        a.userId,
        id,
        b.approve,
        b.note ?? null,
      ])
      .then(respond);
  }

  /** Tải bản scan văn bản sửa đổi (Admin hoặc người gửi). */
  @Get('amendments/:id/evidence')
  async evidence(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
  ) {
    if (!this.store)
      throw new HttpException(
        { code: 'FILE_STORE_NOT_CONFIGURED', label: null },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const rows = await this.repo.rows<{ object_key: string; mime: string }>(
      a.tenantId,
      'dms_amendment_evidence',
      [a.tenantId, a.userId, id],
    );
    const file = rows[0];
    const bytes =
      file && file.object_key.startsWith(`t/${a.tenantId}/`)
        ? await this.store.get(file.object_key)
        : null;
    if (!file || !bytes)
      throw new HttpException({ code: 'FILE_NOT_FOUND', label: null }, HttpStatus.NOT_FOUND);
    res.set({
      'content-type': file.mime,
      'content-disposition': 'attachment; filename="van-ban-sua-doi"',
      'cache-control': 'private, no-store',
    });
    return new StreamableFile(bytes);
  }

  /** Cửa sổ duyệt tự động (giờ). Chỉ Admin đổi; 0 = tắt. */
  @Get('amendment-window')
  async window(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(z.object({ officeId: uuid }).strict(), query);
    const rows = await this.repo.rows<{ dms_amendment_window: number }>(
      a.tenantId,
      'dms_amendment_window',
      [a.tenantId, q.officeId],
    );
    return { hours: rows[0]?.dms_amendment_window ?? 48 };
  }

  @Put('amendment-window')
  setWindow(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z.object({ officeId: uuid, hours: z.number().int().min(0).max(720) }).strict(),
      body,
    );
    return this.repo
      .call(a.tenantId, 'dms_amendment_window_set', [a.tenantId, a.userId, b.officeId, b.hours])
      .then(respond);
  }
}
