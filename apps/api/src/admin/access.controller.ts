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

const uuid = z.string().uuid();
const role = z.enum(['ADMIN', 'TRUONG_VP', 'THV', 'THU_KY', 'VAN_THU', 'KE_TOAN']);

const proposal = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('GRANT_ROLE'), role }),
  z.object({ kind: z.literal('REVOKE_ROLE'), role }),
  z.object({ kind: z.literal('SET_LEGAL_SIGNER'), flag: z.boolean() }),
  z.object({ kind: z.literal('GRANT_BRANCH'), branchId: uuid }),
  z.object({ kind: z.literal('REVOKE_BRANCH'), branchId: uuid }),
]);
const proposalBody = z
  .object({ officeId: uuid, targetUserId: uuid, reason: z.string().min(1).max(1000) })
  .and(proposal);

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }
  return result.data;
}

/**
 * Cấp / đổi quyền thành viên theo nguyên tắc hai người: Admin đề xuất, Trưởng văn phòng duyệt (khác người).
 * Quyền, kiểm tra nội dung và việc áp thay đổi đều do hàm `ad_access_*` trong DB quyết định và audit.
 */
@Controller('admin/access-requests')
@UseGuards(ActorGuard)
export class AccessController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  private async run(actor: AuthenticatedActor, fn: string, args: readonly unknown[]) {
    const op = await this.repo.call(actor.tenantId, fn, [actor.tenantId, actor.userId, ...args]);
    const reply = { code: op.code, label: op.label };
    if (statusFor(op) >= 400) throw new HttpException(reply, statusFor(op));
    return reply;
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  propose(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(proposalBody, body);
    return this.run(a, 'ad_access_propose', [
      b.officeId,
      b.targetUserId,
      b.kind,
      'role' in b ? b.role : null,
      'flag' in b ? b.flag : null,
      'branchId' in b ? b.branchId : null,
      b.reason,
    ]);
  }

  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  decide(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ approve: z.boolean(), note: z.string().max(1000).optional() }).strict(),
      body,
    );
    return this.run(a, 'ad_access_decide', [id, b.approve, b.note ?? null]);
  }

  @Post(':id/withdrawal')
  @HttpCode(HttpStatus.OK)
  withdraw(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'ad_access_withdraw', [id]);
  }

  @Get()
  async list(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    const rows = await this.repo.rows<{
      id: string;
      target_user_id: string;
      target_label: string;
      kind: string;
      role: string | null;
      flag: boolean | null;
      branch_name: string | null;
      status: string;
      reason: string;
      proposed_by: string;
      proposed_at: Date;
      decided_by: string | null;
      decision_note: string | null;
    }>(a.tenantId, 'of_search_access_requests', [a.tenantId, a.userId, officeId]);
    return rows.map((r) => ({
      id: r.id,
      targetUserId: r.target_user_id,
      targetLabel: r.target_label,
      kind: r.kind,
      role: r.role,
      flag: r.flag,
      branchName: r.branch_name,
      status: r.status,
      reason: r.reason,
      proposedBy: r.proposed_by,
      proposedAt: r.proposed_at,
      decidedBy: r.decided_by,
      decisionNote: r.decision_note,
    }));
  }
}
