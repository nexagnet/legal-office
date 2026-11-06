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
const evidence = { evidenceKey: z.string().max(500), evidenceSha256: z.string().max(64) };

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
 * Xác minh điều kiện (N-05/N-06). Quyền do hàm `vx_*` trong DB quyết định và audit. Truy cập nguồn trả khoá tệp trong
 * `label` (không trả nội dung); việc đọc tệp thật chờ kho riêng. Chưa có endpoint đọc: sổ S-04 là view `vx_s04_book`.
 */
@Controller('verification')
@UseGuards(ActorGuard)
export class VerificationController {
  constructor(
    @Inject(VibangRepo) private readonly repo: VibangRepo,
    @Optional() @Inject(FILE_STORE) private readonly store: FileStore | null,
  ) {}

  private run(actor: AuthenticatedActor, fn: string, args: readonly unknown[]): Promise<Reply> {
    return this.repo
      .call(actor.tenantId, fn, [actor.tenantId, actor.userId, ...args])
      .then(respond);
  }

  @Get('cases')
  async list(@CurrentActor() a: AuthenticatedActor) {
    const rows = await this.repo.rows<{
      case_id: string;
      case_ref: string;
      branch_id: string;
      status: string;
      handler_user_id: string | null;
      conclusion_text: string | null;
      proposed_by: string | null;
      created_at: Date;
      rounds: unknown;
    }>(a.tenantId, 'vx_list_cases', [a.tenantId, a.userId, 100]);
    return {
      items: rows.map((r) => ({
        caseId: r.case_id,
        caseRef: r.case_ref,
        branchId: r.branch_id,
        status: r.status,
        handlerUserId: r.handler_user_id,
        conclusionText: r.conclusion_text,
        proposedBy: r.proposed_by,
        createdAt: r.created_at,
        rounds: r.rounds,
      })),
    };
  }

  @Post('cases')
  @HttpCode(HttpStatus.OK)
  createCase(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z.object({ officeId: uuid, branchId: uuid, caseRef: z.string().max(200) }).strict(),
      body,
    );
    return this.run(a, 'vx_create_case', [b.officeId, b.branchId, b.caseRef]);
  }

  /** Ngày ký hợp đồng dịch vụ xác minh: sinh/sửa hạn 3 ngày làm việc ra quyết định xác minh (Điều 35.1). */
  @Put('cases/:id/contract-date')
  @HttpCode(HttpStatus.OK)
  setContractDate(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ signedOn: z.string().date() }).strict(), body);
    return this.run(a, 'vx_set_contract_date', [id, b.signedOn]);
  }

  @Put('cases/:id/handler')
  assign(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ handlerUserId: uuid }).strict(), body);
    return this.run(a, 'vx_assign', [id, b.handlerUserId]);
  }

  @Post('cases/:id/rounds')
  @HttpCode(HttpStatus.OK)
  startRound(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ partyName: z.string().max(300) }).strict(), body);
    return this.run(a, 'vx_start_round', [id, b.partyName]);
  }

  @Post('rounds/:id/sources')
  @HttpCode(HttpStatus.OK)
  addSource(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          kind: z.string().max(200),
          confidentiality: z.string(),
          purpose: z.string().max(500),
          ...evidence,
        })
        .strict(),
      body,
    );
    return this.run(a, 'vx_add_source', [
      id,
      b.kind,
      b.confidentiality,
      b.purpose,
      b.evidenceKey,
      b.evidenceSha256,
    ]);
  }

  /**
   * Ghi nguồn kèm tệp (PDF/JPEG/PNG): thân yêu cầu là chính tệp, mô tả nguồn đi theo query. Máy chủ tự tính hash và khoá.
   */
  @Post('rounds/:id/source-files')
  @HttpCode(HttpStatus.OK)
  addSourceFile(
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
          kind: z.string().max(200),
          confidentiality: z.string(),
          purpose: z.string().max(500),
        })
        .strict(),
      query,
    );
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/vx/rounds/${id}/sources/${randomUUID()}.${f.extension}`,
      (key, f) =>
        this.run(a, 'vx_add_source', [id, q.kind, q.confidentiality, q.purpose, key, f.sha256]),
    );
  }

  @Post('sources/:id/access')
  @HttpCode(HttpStatus.OK)
  accessSource(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ purpose: z.string().max(500).nullish() }).strict(), body ?? {});
    return this.run(a, 'vx_access_source', [id, b.purpose ?? null]);
  }

  @Post('rounds/:id/completion')
  @HttpCode(HttpStatus.OK)
  completeRound(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ result: z.string().max(4000) }).strict(), body);
    return this.run(a, 'vx_complete_round', [id, b.result]);
  }

  @Post('cases/:id/conclusion-proposal')
  @HttpCode(HttpStatus.OK)
  propose(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ text: z.string().max(8000) }).strict(), body);
    return this.run(a, 'vx_propose_conclusion', [id, b.text]);
  }

  @Post('cases/:id/conclusion-decision')
  @HttpCode(HttpStatus.OK)
  decide(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ approve: z.boolean(), note: z.string().max(2000).nullish() }).strict(),
      body,
    );
    return this.run(a, 'vx_decide_conclusion', [id, b.approve, b.note ?? null]);
  }

  @Post('cases/:id/delegations')
  @HttpCode(HttpStatus.OK)
  requestDelegation(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ delegateUserId: uuid }).strict(), body);
    return this.run(a, 'vx_delegation_request', [id, b.delegateUserId]);
  }

  @Post('delegations/:id/steps')
  @HttpCode(HttpStatus.OK)
  recordStep(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ step: z.string(), ...evidence }).strict(), body);
    return this.run(a, 'vx_delegation_step', [id, b.step, b.evidenceKey, b.evidenceSha256]);
  }

  /** Như `delegations/:id/steps` nhưng tải thẳng tệp bằng chứng của bước; bước đi theo query. */
  @Post('delegations/:id/step-files')
  @HttpCode(HttpStatus.OK)
  recordStepFile(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: RawBody,
  ) {
    const q = parse(z.object({ step: z.string() }).strict(), query);
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/vx/delegations/${id}/${randomUUID()}.${f.extension}`,
      (key, f) => this.run(a, 'vx_delegation_step', [id, q.step, key, f.sha256]),
    );
  }

  /** Nguồn của hồ sơ kèm nhật ký mở. Không trả khoá hay hash tệp. Ngoài phạm vi xem thì rỗng. */
  @Get('cases/:id/sources')
  async caseSources(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.repo.rows<{
      id: string;
      round_id: string;
      round_seq: number;
      kind: string;
      confidentiality: string;
      purpose: string;
      recorded_by: string;
      at: Date;
      accesses: unknown;
    }>(a.tenantId, 'vx_list_sources', [a.tenantId, a.userId, id]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        roundId: r.round_id,
        roundSeq: r.round_seq,
        kind: r.kind,
        confidentiality: r.confidentiality,
        purpose: r.purpose,
        recordedBy: r.recorded_by,
        at: r.at,
        accesses: r.accesses,
      })),
    };
  }

  /** Ủy quyền của hồ sơ kèm các bước đã ghi. */
  @Get('cases/:id/delegations')
  async caseDelegations(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const rows = await this.repo.rows<{
      id: string;
      delegate_user_id: string;
      status: string;
      requested_by: string;
      created_at: Date;
      activated_at: Date | null;
      steps: unknown;
    }>(a.tenantId, 'vx_list_delegations', [a.tenantId, a.userId, id]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        delegateUserId: r.delegate_user_id,
        status: r.status,
        requestedBy: r.requested_by,
        createdAt: r.created_at,
        activatedAt: r.activated_at,
        steps: r.steps,
      })),
    };
  }

  /** Quyết định N-06 của hồ sơ (số, ngày ký, người ký); chưa có thì `decision: null`. */
  @Get('cases/:id/decision')
  async caseDecision(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const [r] = await this.repo.rows<{
      decision_no: string;
      signed_on: string;
      signer_user_id: string;
      recorded_at: Date;
    }>(a.tenantId, 'vx_get_decision', [a.tenantId, a.userId, id]);
    return {
      decision: r
        ? {
            decisionNo: r.decision_no,
            signedOn: r.signed_on,
            signerUserId: r.signer_user_id,
            recordedAt: r.recorded_at,
          }
        : null,
    };
  }

  /** Ghi quyết định N-06 kèm tệp quyết định đã ký; số và ngày ký đi theo query. Chỉ Trưởng VP/Admin có quyền ký pháp lý. */
  @Post('cases/:id/decision-file')
  @HttpCode(HttpStatus.OK)
  recordDecisionFile(
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
          decisionNo: z.string().max(200),
          signedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .strict(),
      query,
    );
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/vx/cases/${id}/decision/${randomUUID()}.${f.extension}`,
      (key, f) => this.run(a, 'vx_record_decision', [id, q.decisionNo, q.signedOn, key, f.sha256]),
    );
  }

  @Post('delegations/:id/activation')
  @HttpCode(HttpStatus.OK)
  activate(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'vx_delegation_activate', [id]);
  }
}
