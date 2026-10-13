import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { statusFor } from '../vibang/status';
import { VibangRepo } from '../vibang/vibang.repo';

const body = z
  .object({
    decision: z.enum(['REJECT', 'RETURN', 'RESUBMIT']),
    reason: z.string().min(1).max(2000),
  })
  .strict();

/**
 * Quy trình duyệt dùng chung: từ chối / trả lại bổ sung / nộp lại cho chuyển giao hồ sơ và uỷ quyền xác minh.
 * Duyệt trong ứng dụng khác chữ ký pháp lý; quyền do hàm `ap_decide` trong DB quyết định và audit.
 */
@Controller('approvals')
@UseGuards(ActorGuard)
export class ApprovalController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  private async decide(
    actor: AuthenticatedActor,
    kind: 'TRANSFER' | 'DELEGATION',
    subject: string,
    raw: unknown,
  ) {
    const parsed = body.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      );
    }
    const op = await this.repo.call(actor.tenantId, 'ap_decide', [
      actor.tenantId,
      actor.userId,
      kind,
      subject,
      parsed.data.decision,
      parsed.data.reason,
    ]);
    const reply = { code: op.code, label: op.label };
    const status = statusFor(op);
    if (status >= 400) throw new HttpException(reply, status);
    return reply;
  }

  @Post('transfers/:id/decisions')
  @HttpCode(HttpStatus.OK)
  transfer(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.decide(a, 'TRANSFER', id, b);
  }

  @Post('delegations/:id/decisions')
  @HttpCode(HttpStatus.OK)
  delegation(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.decide(a, 'DELEGATION', id, b);
  }

  /** Hộp duyệt: đề xuất chưa hoàn tất trong phạm vi đọc của người gọi, kèm trạng thái duyệt hiện tại. */
  @Get('pending')
  async pending(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    const rows = await this.repo.rows<{
      kind: string;
      subject_id: string;
      case_id: string;
      branch_id: string;
      approval_state: string;
      last_reason: string | null;
      proposed_by: string;
      created_at: Date;
    }>(a.tenantId, 'of_search_approvals', [a.tenantId, a.userId, officeId]);
    return rows.map((r) => ({
      kind: r.kind,
      subjectId: r.subject_id,
      caseId: r.case_id,
      branchId: r.branch_id,
      state: r.approval_state,
      lastReason: r.last_reason,
      proposedBy: r.proposed_by,
      createdAt: r.created_at,
    }));
  }
}
