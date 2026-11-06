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
    /**
     * Quyền chi tiết MONG MUỐN (sau khi tick/bỏ tick trên cây quyền). Thiếu = chỉ theo nhóm. Máy chủ tự suy ra cấp riêng / thu riêng
     * so với nền của các nhóm và kiểm lại từng mã quyền.
     */
    permissions: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
    /** Chi nhánh được xem, cấp ngay lúc tạo (cùng giao dịch). */
    branchIds: z.array(uuid).max(100).optional(),
    /** Mật khẩu ban đầu: BẮT BUỘC (tối thiểu 12 ký tự); người dùng phải đổi ở lần đăng nhập đầu. */
    password: z.string().min(1).max(200),
    /** Số CCCD 12 chữ số (không bắt buộc, không trùng trong tenant); đăng nhập được bằng email hoặc CCCD. */
    cccd: z
      .string()
      .trim()
      .regex(/^\d{12}$/)
      .optional()
      .or(z.literal('')),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();
const nameBody = z.object({ officeId: uuid, fullName: z.string().trim().min(1).max(200) }).strict();
const suspendBody = z
  .object({ officeId: uuid, suspended: z.boolean(), reason: z.string().trim().min(1).max(1000) })
  .strict();
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
    // Mật khẩu ban đầu bắt buộc, đủ mạnh; tài khoản mới phải đổi mật khẩu ở lần đăng nhập đầu (DB đặt cờ).
    const weak = passwordPolicyError(b.password);
    if (weak)
      throw new HttpException(
        { code: 'WEAK_PASSWORD', label: weak },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const cccd = b.cccd || null;
    if (cccd) {
      const used = await this.repo.rows<{ au_cccd_in_use: boolean }>(a.tenantId, 'au_cccd_in_use', [
        a.tenantId,
        cccd,
      ]);
      if (used[0]?.au_cccd_in_use)
        throw new HttpException(
          { code: 'CCCD_IN_USE', label: null },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
    }
    const hash = await hashPassword(b.password);
    const created = await this.run(a, 'ad_member_create', [
      b.officeId,
      b.email,
      b.fullName,
      b.groupIds,
      hash,
      b.reason?.trim() || 'Tạo tài khoản mới',
      b.permissions ?? null,
      b.branchIds ?? null,
    ]);
    if (cccd && created.label) await this.run(a, 'au_set_cccd', [b.officeId, created.label, cccd]);
    return created;
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

  /** Tạm khóa / mở khóa tài khoản: thu hồi phiên và quyền hiệu lực, giữ nguyên lịch sử. Admin áp dụng ngay, có lý do và nhật ký. */
  @Post('members/:id/suspension')
  @HttpCode(HttpStatus.OK)
  suspendMember(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(suspendBody, body);
    return this.run(a, 'ad_member_suspend', [b.officeId, id, b.suspended, b.reason]);
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
