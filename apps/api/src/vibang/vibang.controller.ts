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
import { statusFor } from './status';
import { VibangRepo, type Op } from './vibang.repo';

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
const toReply = (op: Op): Reply => ({ code: op.code, label: op.label });

/** Mọi lỗi nghiệp vụ trả JSON `{code, label}` cùng mã HTTP phù hợp; quyết định quyền nằm trong DB. */
function respond(op: Op): Reply {
  const status = statusFor(op);
  if (status >= 400) throw new HttpException(toReply(op), status);
  return toReply(op);
}

@Controller('vibang')
@UseGuards(ActorGuard)
export class VibangController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  private run(actor: AuthenticatedActor, fn: string, args: readonly unknown[]): Promise<Reply> {
    return this.repo.call(actor.tenantId, fn, [actor.tenantId, ...args]).then(respond);
  }

  @Put('cases/:id/misa')
  recordMisa(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ status: z.string(), reference: z.string().max(200).nullish() }).strict(),
      body,
    );
    return this.run(a, 'vibang_record_misa', [id, a.userId, b.status, b.reference ?? null]);
  }

  @Post('cases/:id/misa/revoke-proposals')
  @HttpCode(HttpStatus.OK)
  proposeRevoke(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ reason: z.string().max(2000) }).strict(), body);
    return this.run(a, 'vibang_propose_revoke', [id, a.userId, b.reason]);
  }

  @Post('cases/:id/misa/revoke-decisions')
  @HttpCode(HttpStatus.OK)
  decideRevoke(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ accept: z.boolean() }).strict(), body);
    return this.run(a, 'vibang_decide_revoke', [id, a.userId, b.accept]);
  }

  @Post('cases/:id/number')
  @HttpCode(HttpStatus.OK)
  allocateNumber(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'vibang_allocate_number', [id, a.userId]);
  }

  @Post('offices/:officeId/number-imports')
  @HttpCode(HttpStatus.OK)
  importLastNumber(
    @CurrentActor() a: AuthenticatedActor,
    @Param('officeId', ParseUUIDPipe) officeId: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ year: z.number().int(), lastNumber: z.number().int() }).strict(),
      body,
    );
    return this.run(a, 'vibang_import_last_number', [officeId, a.userId, b.year, b.lastNumber]);
  }

  @Post('cases/:id/documents')
  @HttpCode(HttpStatus.OK)
  addDocument(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          kind: z.string(),
          source: z.string(),
          objectKey: z.string().max(500),
          sha256: z.string().max(64),
          mime: z.string().max(200),
          sizeBytes: z.number().int().max(Number.MAX_SAFE_INTEGER),
        })
        .strict(),
      body,
    );
    return this.run(a, 'vibang_add_document', [
      id,
      a.userId,
      b.kind,
      b.source,
      b.objectKey,
      b.sha256,
      b.mime,
      b.sizeBytes,
    ]);
  }

  @Post('cases/:id/signature-confirmations')
  @HttpCode(HttpStatus.OK)
  confirmSigned(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'vibang_confirm_signed', [id, a.userId]);
  }

  @Post('cases/:id/stamp-confirmations')
  @HttpCode(HttpStatus.OK)
  confirmStamped(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'vibang_confirm_stamped', [id, a.userId]);
  }

  @Post('cases/:id/return')
  @HttpCode(HttpStatus.OK)
  returnCase(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'vibang_return_case', [id, a.userId]);
  }

  @Put('cases/:id/registration')
  setRegistration(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ status: z.string(), deadlineAt: iso, reasonCode: z.string().nullish() }).strict(),
      body,
    );
    return this.run(a, 'vibang_set_registration', [
      id,
      a.userId,
      b.status,
      b.deadlineAt,
      b.reasonCode ?? null,
    ]);
  }

  @Post('cases/:id/contacts')
  @HttpCode(HttpStatus.OK)
  logContact(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ kind: z.string(), outcome: z.string() }).strict(), body);
    return this.run(a, 'vibang_log_contact', [id, a.userId, b.kind, b.outcome]);
  }

  @Post('cases/:id/n11-corrections')
  @HttpCode(HttpStatus.OK)
  proposeN11(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ reason: z.string().max(2000) }).strict(), body);
    return this.run(a, 'vibang_propose_n11', [id, a.userId, b.reason]);
  }

  @Post('n11-corrections/:id/applications')
  @HttpCode(HttpStatus.OK)
  applyN11(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ documentId: uuid }).strict(), body);
    return this.run(a, 'vibang_apply_n11', [id, a.userId, b.documentId]);
  }
}
