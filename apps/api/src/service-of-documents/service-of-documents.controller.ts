import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
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
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { FILE_STORE, type FileStore } from '../storage/file-store';
import { recordWithUpload } from '../storage/evidence';
import type { RawBody } from '../storage/upload';
import { statusFor } from '../vibang/status';
import { VibangRepo, type Op } from '../vibang/vibang.repo';

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });

function parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }
  return result.data;
}

interface Reply {
  readonly code: string;
  readonly label: string | null;
}
function respond(op: Op): Reply {
  const status = statusFor(op);
  const reply = { code: op.code, label: op.label };
  if (status >= 400) throw new HttpException(reply, status);
  return reply;
}

/**
 * Tống đạt. Quyền do hàm `td_*` trong DB quyết định và audit. Thời điểm của một lần tống đạt luôn là giờ máy chủ
 * (không nhận từ client). Đọc: `GET documents` theo phạm vi ghi (hàm `td_list_documents`).
 */
@Controller('service-of-documents')
@UseGuards(ActorGuard)
export class ServiceOfDocumentsController {
  constructor(
    @Inject(VibangRepo) private readonly repo: VibangRepo,
    @Optional() @Inject(FILE_STORE) private readonly store: FileStore | null,
  ) {}

  private run(actor: AuthenticatedActor, fn: string, args: readonly unknown[]): Promise<Reply> {
    return this.repo
      .call(actor.tenantId, fn, [actor.tenantId, actor.userId, ...args])
      .then(respond);
  }

  @Get('documents')
  async list(@CurrentActor() a: AuthenticatedActor) {
    const rows = await this.repo.rows<{
      document_id: string;
      request_id: string;
      request_ref: string;
      request_status: string;
      branch_id: string;
      recipient_name: string;
      address: string;
      deadline_at: Date;
      status: string;
      undeliverable_reason: string | null;
      handler_user_id: string | null;
      attempts: number;
      last_attempt_at: Date | null;
      document_title: string | null;
    }>(a.tenantId, 'td_list_documents', [a.tenantId, a.userId, 100]);
    return {
      items: rows.map((r) => ({
        documentId: r.document_id,
        requestId: r.request_id,
        requestRef: r.request_ref,
        requestStatus: r.request_status,
        branchId: r.branch_id,
        recipientName: r.recipient_name,
        address: r.address,
        deadlineAt: r.deadline_at,
        status: r.status,
        undeliverableReason: r.undeliverable_reason,
        handlerUserId: r.handler_user_id,
        attempts: r.attempts,
        lastAttemptAt: r.last_attempt_at,
        documentTitle: r.document_title,
      })),
    };
  }

  /** Các lần tống đạt của một văn bản, cũ đến mới. Cùng phạm vi quyền với `GET documents`; ngoài phạm vi thì rỗng. */
  @Get('documents/:id/attempts')
  async attempts(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.repo.rows<{
      seq: number;
      outcome: string;
      late: boolean;
      at: Date;
      actor_user_id: string;
      has_evidence: boolean;
    }>(a.tenantId, 'td_list_attempts', [a.tenantId, a.userId, id]);
    return {
      items: rows.map((r) => ({
        seq: r.seq,
        outcome: r.outcome,
        late: r.late,
        at: r.at,
        actorUserId: r.actor_user_id,
        hasEvidence: r.has_evidence,
      })),
    };
  }

  @Post('requests')
  @HttpCode(HttpStatus.OK)
  createRequest(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z.object({ officeId: uuid, branchId: uuid, requestRef: z.string().max(200) }).strict(),
      body,
    );
    return this.run(a, 'td_create_request', [b.officeId, b.branchId, b.requestRef]);
  }

  @Post('requests/:id/documents')
  @HttpCode(HttpStatus.OK)
  addDocument(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          recipientName: z.string().max(300),
          address: z.string().max(500),
          deadlineAt: iso,
          title: z.string().max(300).nullish(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'td_add_document', [
      id,
      b.recipientName,
      b.address,
      b.deadlineAt,
      b.title ?? null,
    ]);
  }

  @Put('documents/:id/handler')
  assign(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ handlerUserId: uuid }).strict(), body);
    return this.run(a, 'td_assign', [id, b.handlerUserId]);
  }

  @Post('documents/:id/reminders')
  @HttpCode(HttpStatus.OK)
  remind(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'td_remind', [id]);
  }

  @Post('documents/:id/attempts')
  @HttpCode(HttpStatus.OK)
  recordAttempt(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          outcome: z.string(),
          evidenceKey: z.string().max(500).nullish(),
          evidenceSha256: z.string().max(64).nullish(),
          statutoryRef: z.string().max(500).nullish(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'td_record_attempt', [
      id,
      b.outcome,
      b.evidenceKey ?? null,
      b.evidenceSha256 ?? null,
      b.statutoryRef ?? null,
    ]);
  }

  /**
   * Ghi nhận ĐÃ TỐNG ĐẠT kèm tệp bằng chứng N-02 (PDF/JPEG/PNG, thân yêu cầu là chính tệp). Máy chủ tự tính
   * sha256 và khoá đối tượng. Quyền và điều kiện do `td_record_attempt` quyết định; bị từ chối thì xoá tệp vừa ghi.
   */
  @Post('documents/:id/served')
  @HttpCode(HttpStatus.OK)
  async recordServed(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: RawBody,
  ): Promise<Reply> {
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/td/${id}/evidence/${randomUUID()}.${f.extension}`,
      (key, f) => this.run(a, 'td_record_attempt', [id, 'SERVED', key, f.sha256, null]),
    );
  }

  @Post('documents/:id/undeliverable')
  @HttpCode(HttpStatus.OK)
  markUndeliverable(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ reason: z.string() }).strict(), body);
    return this.run(a, 'td_mark_undeliverable', [id, b.reason]);
  }

  @Post('requests/:id/closure')
  @HttpCode(HttpStatus.OK)
  close(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'td_close_request', [id]);
  }

  /** Ghi việc ĐÃ báo kết quả tống đạt cho cơ quan yêu cầu (Điều 25.2). Chỉ khi mọi văn bản đã có kết cục cuối. */
  @Post('requests/:id/result-notices')
  @HttpCode(HttpStatus.OK)
  reportResult(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ agency: z.string().max(300), note: z.string().max(2000) }).strict(),
      body,
    );
    return this.run(a, 'td_report_result', [id, b.agency, b.note]);
  }

  @Get('requests/:id/result-notices')
  async resultNotices(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const rows = await this.repo.rows<{
      id: string;
      agency: string;
      note: string;
      sent_by: string;
      sent_at: Date;
    }>(a.tenantId, 'td_list_result_notices', [a.tenantId, a.userId, id]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        agency: r.agency,
        note: r.note,
        sentBy: r.sent_by,
        sentAt: r.sent_at,
      })),
    };
  }
}
