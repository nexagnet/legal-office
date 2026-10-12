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
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
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
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  private run(actor: AuthenticatedActor, fn: string, args: readonly unknown[]): Promise<Reply> {
    return this.repo
      .call(actor.tenantId, fn, [actor.tenantId, actor.userId, ...args])
      .then(respond);
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

  @Post('delegations/:id/activation')
  @HttpCode(HttpStatus.OK)
  activate(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'vx_delegation_activate', [id]);
  }
}
