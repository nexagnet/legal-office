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
import { sendStoredFile } from './dms-file-response';
import { parse, respond, uuid } from './dms-http';

/** Tệp đã tải lên bước đệm (POST /dms/uploads) kèm tên hiển thị. Tối đa 20 tệp một lần, khớp giới hạn của hàm DB. */
const files = z
  .array(z.object({ stagedId: uuid, label: z.string().trim().min(1).max(255) }).strict())
  .min(1)
  .max(20);

/**
 * Trình / Duyệt (N4): thay "Yêu cầu sửa đổi". Mọi thành viên văn phòng gửi được bản trình (tiêu đề, mô tả, các bản scan);
 * chỉ Admin duyệt hoặc từ chối. Người gửi chỉ thấy bản của mình, Admin thấy cả văn phòng. Quyền do hàm `dms_submission_*`
 * quyết định và ghi nhật ký; controller không tự phán quyền. Bản trình không bao giờ bị xóa; chỉ file scan mới xóa được
 * (xem DmsScansController).
 */
@Controller('dms')
@UseGuards(ActorGuard)
export class DmsSubmissionsController {
  constructor(
    @Inject(VibangRepo) private readonly repo: VibangRepo,
    @Optional() @Inject(FILE_STORE) private readonly store: FileStore | null,
  ) {}

  /** Tải lên bước đệm một tệp (PDF/JPEG/PNG), trả `label` là id tệp đệm để gắn vào bản trình. Chỉ người tải dùng được. */
  @Post('uploads')
  @HttpCode(HttpStatus.OK)
  stage(
    @CurrentActor() a: AuthenticatedActor,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: RawBody,
  ) {
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/dms/staged/${randomUUID()}.${f.extension}`,
      (key, f) =>
        this.repo
          .call(a.tenantId, 'dms_stage_upload', [
            a.tenantId,
            a.userId,
            key,
            f.sha256,
            f.mime,
            f.bytes.length,
          ])
          .then(respond),
    );
  }

  @Get('submissions')
  list(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(
      z
        .object({
          officeId: uuid,
          status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
          q: z.string().max(200).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .strict(),
      query,
    );
    return this.repo
      .rows<{ total: string | number }>(a.tenantId, 'dms_submission_list', [
        a.tenantId,
        a.userId,
        q.officeId,
        q.status ?? null,
        q.q?.trim() || null,
        q.limit,
        q.offset,
      ])
      .then((rows) => ({
        rows: rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'total'))),
        total: rows[0] ? Number(rows[0].total) : 0,
      }));
  }

  /** Số bản trình chờ duyệt (huy hiệu ở thanh bên). Người không phải Admin luôn nhận 0. */
  @Get('submissions/pending-count')
  async pendingCount(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(z.object({ officeId: uuid }).strict(), query);
    const rows = await this.repo.rows<Record<string, number>>(
      a.tenantId,
      'dms_submission_pending_count',
      [a.tenantId, a.userId, q.officeId],
    );
    return { pending: Number(Object.values(rows[0] ?? { n: 0 })[0] ?? 0) };
  }

  @Post('submissions')
  create(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          title: z.string().trim().min(1).max(300),
          description: z.string().max(5000).optional(),
          /** Hồ sơ liên quan (tuỳ chọn). Phải là hồ sơ người gửi được xem. */
          caseId: uuid.optional(),
          files,
        })
        .strict(),
      body,
    );
    return this.repo
      .call(a.tenantId, 'dms_submission_create', [
        a.tenantId,
        a.userId,
        b.officeId,
        b.title,
        b.description ?? null,
        b.caseId ?? null,
        b.files.map((f) => f.stagedId),
        b.files.map((f) => f.label),
      ])
      .then(respond);
  }

  @Get('submissions/:id')
  async one(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.repo.rows(a.tenantId, 'dms_submission_get', [a.tenantId, a.userId, id]);
    if (!rows[0])
      throw new HttpException({ code: 'SUBMISSION_NOT_FOUND', label: null }, HttpStatus.NOT_FOUND);
    const fileRows = await this.repo.rows(a.tenantId, 'dms_submission_files_list', [
      a.tenantId,
      a.userId,
      id,
    ]);
    return { ...rows[0], files: fileRows };
  }

  /** Bổ sung thêm scan vào bản trình của chính mình (hoặc Admin) khi còn chờ duyệt. */
  @Post('submissions/:id/files')
  @HttpCode(HttpStatus.OK)
  addFiles(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ files }).strict(), body);
    return this.repo
      .call(a.tenantId, 'dms_submission_add_files', [
        a.tenantId,
        a.userId,
        id,
        b.files.map((f) => f.stagedId),
        b.files.map((f) => f.label),
      ])
      .then(respond);
  }

  /** Chỉ Admin. Từ chối bắt buộc có lý do. */
  @Post('submissions/:id/decide')
  @HttpCode(HttpStatus.OK)
  decide(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ approve: z.boolean(), note: z.string().trim().max(2000).optional() }).strict(),
      body,
    );
    return this.repo
      .call(a.tenantId, 'dms_submission_decide', [
        a.tenantId,
        a.userId,
        id,
        b.approve,
        b.note ?? null,
      ])
      .then(respond);
  }

  /** Tải/xem một scan của bản trình. Scan đã xóa không tải được ở đây (Admin vào mục Scan đã xóa). */
  @Get('submission-files/:id/download')
  async download(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
    @Query('inline') inline?: string,
  ): Promise<StreamableFile> {
    const rows = await this.repo.rows<{ object_key: string; mime: string; label: string }>(
      a.tenantId,
      'dms_submission_file_download',
      [a.tenantId, a.userId, id],
    );
    return sendStoredFile(this.store, a.tenantId, rows[0], res, inline === '1');
  }
}
