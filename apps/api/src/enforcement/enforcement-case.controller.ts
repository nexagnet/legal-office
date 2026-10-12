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
 * Tổ chức thi hành án: hồ sơ, đương sự, nghĩa vụ, kết quả từng phần. Quyền do hàm `th_*` trong DB quyết định và audit.
 * Không có số tiền hay sổ sách. Ghi kết quả dùng `Idempotency-Key` ở thân (`idempotencyKey`) để thử lại an toàn.
 */
@Controller('enforcement-cases')
@UseGuards(ActorGuard)
export class EnforcementCaseController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  private run(actor: AuthenticatedActor, fn: string, args: readonly unknown[]): Promise<Reply> {
    return this.repo
      .call(actor.tenantId, fn, [actor.tenantId, actor.userId, ...args])
      .then(respond);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  create(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          branchId: uuid,
          caseRef: z.string().max(200),
          agreementRef: z.string().max(200),
          decisionRef: z.string().max(300),
        })
        .strict(),
      body,
    );
    return this.run(a, 'th_create_case', [
      b.officeId,
      b.branchId,
      b.caseRef,
      b.agreementRef,
      b.decisionRef,
    ]);
  }

  @Put(':id/handler')
  assign(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ handlerUserId: uuid }).strict(), body);
    return this.run(a, 'th_assign', [id, b.handlerUserId]);
  }

  @Post(':id/parties')
  @HttpCode(HttpStatus.OK)
  addParty(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ displayName: z.string().max(300), kind: z.string(), role: z.string() }).strict(),
      body,
    );
    return this.run(a, 'th_add_party', [id, b.displayName, b.kind, b.role]);
  }

  @Post(':id/obligations')
  @HttpCode(HttpStatus.OK)
  addObligation(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ description: z.string().max(2000), obligorPartyId: uuid.nullish() }).strict(),
      body,
    );
    return this.run(a, 'th_add_obligation', [id, b.description, b.obligorPartyId ?? null]);
  }

  @Post('obligations/:id/events')
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
          evidenceKey: z.string().max(500).nullish(),
          evidenceSha256: z.string().max(64).nullish(),
          idempotencyKey: z.string().max(200),
        })
        .strict(),
      body,
    );
    return this.run(a, 'th_record_event', [
      id,
      b.kind,
      b.note,
      b.evidenceKey ?? null,
      b.evidenceSha256 ?? null,
      b.idempotencyKey,
    ]);
  }

  @Post(':id/completion')
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ evidenceKey: z.string().max(500), evidenceSha256: z.string().max(64) }).strict(),
      body,
    );
    return this.run(a, 'th_complete_case', [id, b.evidenceKey, b.evidenceSha256]);
  }
}
