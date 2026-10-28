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
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { recordWithUpload } from '../storage/evidence';
import { FILE_STORE, type FileStore } from '../storage/file-store';
import type { RawBody } from '../storage/upload';
import { statusFor } from '../vibang/status';
import { VibangRepo, type Op } from '../vibang/vibang.repo';

const uuid = z.string().uuid();

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

const evidence = { evidenceKey: z.string().max(500), evidenceSha256: z.string().max(64) };

/**
 * Tài sản THA, lệnh của cơ quan có thẩm quyền và chuyển giao hồ sơ (N-08). Quyền do hàm `as_*` trong DB quyết định và audit.
 * Hệ thống chỉ GHI NHẬN lệnh đã có chữ ký; không đóng băng/kê biên. Truy cập tài sản trả nhãn trong `label` và luôn audit.
 */
@Controller('enforcement')
@UseGuards(ActorGuard)
export class AssetsController {
  constructor(
    @Inject(VibangRepo) private readonly repo: VibangRepo,
    @Optional() @Inject(FILE_STORE) private readonly store: FileStore | null,
  ) {}

  /**
   * Tài sản của một hồ sơ kèm sự kiện, đề xuất biện pháp và lệnh đã ghi. Tài sản nhạy cảm không trả nhãn ở đây
   * (xem nhãn qua `assets/:id/access`, có nêu mục đích và audit). Ngoài phạm vi xem thì rỗng.
   */
  @Get('cases/:id/assets')
  async caseAssets(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.repo.rows<{
      id: string;
      case_id: string;
      category: string;
      label: string | null;
      sensitivity: string;
      obligation_id: string | null;
      party_id: string | null;
      created_at: Date;
      events: unknown;
      proposals: unknown;
    }>(a.tenantId, 'as_list_assets', [a.tenantId, a.userId, id]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        caseId: r.case_id,
        category: r.category,
        label: r.label,
        sensitivity: r.sensitivity,
        obligationId: r.obligation_id,
        partyId: r.party_id,
        createdAt: r.created_at,
        events: r.events,
        proposals: r.proposals,
      })),
    };
  }

  /** Như `assets/:id/events` nhưng tải thẳng tệp chứng cứ (PDF/JPEG/PNG); loại, ghi chú và khoá chống trùng đi theo query. */
  @Post('assets/:id/event-files')
  @HttpCode(HttpStatus.OK)
  recordEventFile(
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
          kind: z.string(),
          note: z.string().max(4000),
          idempotencyKey: z.string().max(200),
        })
        .strict(),
      query,
    );
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/th/assets/${id}/events/${randomUUID()}.${f.extension}`,
      (key, f) =>
        this.run(a, 'as_record_event', [id, q.kind, q.note, key, f.sha256, q.idempotencyKey]),
    );
  }

  /** Như `measure-proposals/:id/order` nhưng tải thẳng bản lệnh có chữ ký; cơ quan và số lệnh đi theo query. */
  @Post('measure-proposals/:id/order-file')
  @HttpCode(HttpStatus.OK)
  recordOrderFile(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: RawBody,
  ) {
    const q = parse(
      z.object({ agencyName: z.string().max(300), orderRef: z.string().max(200) }).strict(),
      query,
    );
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/th/proposals/${id}/order/${randomUUID()}.${f.extension}`,
      (key, f) => this.run(a, 'as_record_order', [id, q.agencyName, q.orderRef, key, f.sha256]),
    );
  }

  private run(actor: AuthenticatedActor, fn: string, args: readonly unknown[]): Promise<Reply> {
    return this.repo
      .call(actor.tenantId, fn, [actor.tenantId, actor.userId, ...args])
      .then(respond);
  }

  @Post('cases/:id/assets')
  @HttpCode(HttpStatus.OK)
  addAsset(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          category: z.string().max(200),
          label: z.string().max(500),
          sensitivity: z.string(),
          obligationId: uuid.nullish(),
          partyId: uuid.nullish(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'as_add_asset', [
      id,
      b.category,
      b.label,
      b.sensitivity,
      b.obligationId ?? null,
      b.partyId ?? null,
    ]);
  }

  @Post('assets/:id/events')
  @HttpCode(HttpStatus.OK)
  recordEvent(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          kind: z.string(),
          note: z.string().max(4000),
          ...evidence,
          idempotencyKey: z.string().max(200),
        })
        .strict(),
      body,
    );
    return this.run(a, 'as_record_event', [
      id,
      b.kind,
      b.note,
      b.evidenceKey,
      b.evidenceSha256,
      b.idempotencyKey,
    ]);
  }

  @Post('assets/:id/access')
  @HttpCode(HttpStatus.OK)
  access(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ purpose: z.string().max(500).nullish() }).strict(), body ?? {});
    return this.run(a, 'as_access_asset', [id, b.purpose ?? null]);
  }

  @Post('assets/:id/measure-proposals')
  @HttpCode(HttpStatus.OK)
  propose(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ measure: z.string().max(500), rationale: z.string().max(4000) }).strict(),
      body,
    );
    return this.run(a, 'as_propose_measure', [id, b.measure, b.rationale]);
  }

  @Post('measure-proposals/:id/withdrawal')
  @HttpCode(HttpStatus.OK)
  withdraw(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'as_withdraw_proposal', [id]);
  }

  @Post('measure-proposals/:id/order')
  @HttpCode(HttpStatus.OK)
  recordOrder(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          agencyName: z.string().max(300),
          orderRef: z.string().max(200),
          evidenceKey: z.string().max(500).nullish(),
          evidenceSha256: z.string().max(64).nullish(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'as_record_order', [
      id,
      b.agencyName,
      b.orderRef,
      b.evidenceKey ?? null,
      b.evidenceSha256 ?? null,
    ]);
  }

  @Post('cases/:id/transfers')
  @HttpCode(HttpStatus.OK)
  proposeTransfer(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ toUserId: uuid }).strict(), body);
    return this.run(a, 'as_transfer_propose', [id, b.toUserId]);
  }

  @Post('transfers/:id/steps')
  @HttpCode(HttpStatus.OK)
  transferStep(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ step: z.string(), ...evidence }).strict(), body);
    return this.run(a, 'as_transfer_step', [id, b.step, b.evidenceKey, b.evidenceSha256]);
  }

  @Post('transfers/:id/completion')
  @HttpCode(HttpStatus.OK)
  completeTransfer(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'as_transfer_complete', [id]);
  }

  /** Chi tiết các lần bàn giao của một hồ sơ (mới nhất trước). Ngoài phạm vi xem thì rỗng (cùng quy tắc `th_list_cases`). */
  @Get('cases/:id/transfers')
  async caseTransfers(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { items: await this.loadTransfers(a, id, null) };
  }

  /** Một lần bàn giao. Không phân biệt "không có" và "không được xem". */
  @Get('transfers/:id')
  async transfer(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const [t] = await this.loadTransfers(a, null, id);
    if (!t) throw new NotFoundException({ code: 'TRANSFER_NOT_FOUND', label: null });
    return t;
  }

  private async loadTransfers(
    a: AuthenticatedActor,
    caseId: string | null,
    transferId: string | null,
  ) {
    const rows = await this.repo.rows<{
      id: string;
      case_id: string;
      case_ref: string;
      to_user_id: string;
      proposed_by: string;
      current_handler_user_id: string | null;
      status: string;
      approval_state: string | null;
      created_at: Date;
      completed_at: Date | null;
      steps: unknown;
      decisions: unknown;
    }>(a.tenantId, 'as_list_transfers', [a.tenantId, a.userId, caseId, transferId]);
    return rows.map((r) => ({
      id: r.id,
      caseId: r.case_id,
      caseRef: r.case_ref,
      toUserId: r.to_user_id,
      proposedBy: r.proposed_by,
      currentHandlerUserId: r.current_handler_user_id,
      status: r.status,
      approvalState: r.approval_state ?? 'OPEN',
      createdAt: r.created_at,
      completedAt: r.completed_at,
      steps: r.steps,
      decisions: r.decisions,
    }));
  }
}
