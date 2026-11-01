import { randomBytes } from 'node:crypto';
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
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { hashPassword, passwordPolicyError } from '../auth/password';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { statusFor } from '../vibang/status';
import { VibangRepo } from '../vibang/vibang.repo';

const uuid = z.string().uuid();
const memberBody = z
  .object({
    officeId: uuid,
    email: z.string().trim().min(3).max(254),
    fullName: z.string().trim().min(1).max(200),
    /** Nhóm quyền xếp vào ngay (có thể rỗng: tài khoản chưa có quyền). Không có "vai": quyền chỉ đến từ nhóm quyền. */
    groupIds: z.array(uuid).max(50).default([]),
    temporaryPassword: z.string().max(200).nullish(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
const nameBody = z.object({ officeId: uuid, fullName: z.string().trim().min(1).max(200) }).strict();
const branchBody = z.object({ officeId: uuid, name: z.string().trim().min(1).max(100) }).strict();

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
 * Admin thêm thành viên và quản lý chi nhánh. Thành viên mới có tư cách thành viên văn phòng KHÔNG kèm quyền nào và được xếp
 * vào các nhóm quyền đã chọn; Admin áp dụng ngay (đã duyệt tự động, có dấu và nhật ký phân quyền). Quyền và kiểm tra do hàm
 * `ad_*` trong DB quyết định và audit.
 */
@Controller('admin')
@UseGuards(ActorGuard)
export class MembersController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  private async run(actor: AuthenticatedActor, fn: string, args: readonly unknown[]) {
    const op = await this.repo.call(actor.tenantId, fn, [actor.tenantId, actor.userId, ...args]);
    const reply = { code: op.code, label: op.label };
    if (statusFor(op) >= 400) throw new HttpException(reply, statusFor(op));
    return reply;
  }

  @Post('members')
  @HttpCode(HttpStatus.OK)
  async addMember(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(memberBody, body);
    // Không đặt mật khẩu tạm: băm của một chuỗi ngẫu nhiên không ai biết, người dùng vào bằng link email.
    const temporary = b.temporaryPassword?.trim() ? b.temporaryPassword : null;
    if (temporary) {
      const weak = passwordPolicyError(temporary);
      if (weak) throw new BadRequestException(weak);
    }
    const hash = await hashPassword(temporary ?? randomBytes(32).toString('base64url'));
    return this.run(a, 'ad_member_create', [
      b.officeId,
      b.email,
      b.fullName,
      b.groupIds,
      hash,
      b.reason,
    ]);
  }

  /** Admin sửa họ tên hiển thị của một thành viên văn phòng (hiện ở avatar và tên trên hồ sơ). */
  @Patch('members/:id/name')
  renameMember(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(nameBody, body);
    return this.run(a, 'ad_member_set_name', [b.officeId, id, b.fullName]);
  }

  @Post('branches')
  @HttpCode(HttpStatus.OK)
  createBranch(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(branchBody, body);
    return this.run(a, 'ad_branch_create', [b.officeId, b.name]);
  }

  @Patch('branches/:id')
  renameBranch(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(branchBody, body);
    return this.run(a, 'ad_branch_rename', [b.officeId, id, b.name]);
  }
}
