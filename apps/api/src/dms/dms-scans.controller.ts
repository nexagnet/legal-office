import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
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
import { sendStoredFile } from './dms-file-response';
import { parse, respond, uuid } from './dms-http';

const kind = z.enum(['document', 'submission']);

/**
 * Xóa file scan (N6, N7). Chỉ FILE SCAN mới xóa được: hồ sơ, STT, dòng sổ và bản trình không bao giờ bị xóa. Xóa là xóa mềm:
 * file chuyển vào "Scan đã xóa 30 ngày" (chỉ Admin xem và tải, không khôi phục), hết 30 ngày mới bị dọn khỏi kho. Quyền xóa
 * do Nhóm quyền/cấp riêng (`dms.scan.delete`) quyết định ở DB; bắt buộc lý do; mọi lần xóa/tải đều có nhật ký.
 */
@Controller('dms')
@UseGuards(ActorGuard)
export class DmsScansController {
  constructor(
    @Inject(VibangRepo) private readonly repo: VibangRepo,
    @Optional() @Inject(FILE_STORE) private readonly store: FileStore | null,
  ) {}

  @Post('scans/delete')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z.object({ kind, fileId: uuid, reason: z.string().trim().min(1).max(1000) }).strict(),
      body,
    );
    return this.repo
      .call(a.tenantId, 'dms_scan_delete', [a.tenantId, a.userId, b.kind, b.fileId, b.reason])
      .then(respond);
  }

  /** Mục "Scan đã xóa 30 ngày". Chỉ Admin; người khác nhận danh sách rỗng. */
  @Get('deleted-scans')
  list(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(
      z
        .object({
          officeId: uuid,
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .strict(),
      query,
    );
    return this.repo
      .rows<{ total: string | number }>(a.tenantId, 'dms_deleted_scans_list', [
        a.tenantId,
        a.userId,
        q.officeId,
        q.limit,
        q.offset,
      ])
      .then((rows) => ({
        rows: rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'total'))),
        total: rows[0] ? Number(rows[0].total) : 0,
      }));
  }

  /** Tải một scan đã xóa (chỉ Admin, trong 30 ngày, luôn là tệp tải về; không có đường khôi phục). */
  @Get('deleted-scans/:kind/:fileId/download')
  async download(
    @CurrentActor() a: AuthenticatedActor,
    @Param('kind') rawKind: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
    @Query('version') version?: string,
  ): Promise<StreamableFile> {
    const k = parse(kind, rawKind);
    const v = version === undefined ? null : parse(z.coerce.number().int().min(1), version);
    const rows = await this.repo.rows<{
      object_key: string;
      mime: string;
      label: string;
      version: number;
    }>(a.tenantId, 'dms_deleted_scan_download', [a.tenantId, a.userId, k, fileId]);
    const file =
      v === null
        ? rows.reduce<(typeof rows)[number] | undefined>(
            (best, r) => (!best || r.version > best.version ? r : best),
            undefined,
          )
        : rows.find((r) => r.version === v);
    return sendStoredFile(this.store, a.tenantId, file, res, false);
  }
}
