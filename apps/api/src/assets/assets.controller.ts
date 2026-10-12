import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
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
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

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
}
