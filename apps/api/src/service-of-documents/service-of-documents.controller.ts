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
 * (không nhận từ client). Chưa có endpoint đọc: sổ S-01 là view `td_s01_book`, cần chốt quyền đọc trước.
 */
@Controller('service-of-documents')
@UseGuards(ActorGuard)
export class ServiceOfDocumentsController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  private run(actor: AuthenticatedActor, fn: string, args: readonly unknown[]): Promise<Reply> {
    return this.repo
      .call(actor.tenantId, fn, [actor.tenantId, actor.userId, ...args])
      .then(respond);
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
        })
        .strict(),
      body,
    );
    return this.run(a, 'td_add_document', [id, b.recipientName, b.address, b.deadlineAt]);
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
}
