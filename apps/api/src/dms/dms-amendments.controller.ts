import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { FILE_STORE, type FileStore } from '../storage/file-store';
import { VibangRepo } from '../vibang/vibang.repo';
import { parse, uuid } from './dms-http';

/**
 * Yêu cầu sửa đổi CŨ: chỉ ĐỌC. Luồng gửi và duyệt đã gỡ (N4): người khác Admin dùng Trình / Duyệt, còn Admin sửa trực tiếp
 * hồ sơ đã ghi sổ (POST /dms/cases/:id/admin-edit). Dữ liệu các yêu cầu đã gửi trước đó vẫn đọc được, kèm bản scan văn bản
 * sửa đổi, và các phiên bản hồ sơ do chúng tạo vẫn nằm trong tab Phiên bản. Quyền do hàm `dms_*` quyết định.
 */
@Controller('dms')
@UseGuards(ActorGuard)
export class DmsAmendmentsController {
  constructor(
    @Inject(VibangRepo) private readonly repo: VibangRepo,
    @Optional() @Inject(FILE_STORE) private readonly store: FileStore | null,
  ) {}

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
}
