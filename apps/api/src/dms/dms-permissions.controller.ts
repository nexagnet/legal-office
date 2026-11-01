import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { VibangRepo } from '../vibang/vibang.repo';
import { parse, respond, uuid } from './dms-http';

const KINDS = ['GRANT', 'REVOKE', 'ADD_MEMBER', 'REMOVE_MEMBER'] as const;

/**
 * Nhóm quyền DMS. Quyền trong nhóm và thành viên chỉ đổi qua yêu cầu đề xuất → duyệt; người đề xuất không tự duyệt
 * (DB ép). Không có endpoint ghi quyền trực tiếp.
 */
@Controller('dms')
@UseGuards(ActorGuard)
export class DmsPermissionsController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  private run(a: AuthenticatedActor, fn: string, args: readonly unknown[]) {
    return this.repo.call(a.tenantId, fn, [a.tenantId, a.userId, ...args]).then(respond);
  }

  /** Quyền hiệu lực của chính người gọi, để UI ẩn/hiện nút. Backend vẫn ép quyền ở từng thao tác. */
  @Get('me/permissions')
  async mine(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(z.object({ officeId: uuid }).strict(), query);
    const rows = await this.repo.rows<{ permission: string }>(a.tenantId, 'dms_my_permissions', [
      a.tenantId,
      a.userId,
      q.officeId,
    ]);
    return { permissions: rows.map((r) => r.permission) };
  }

  /** Chi nhánh người gọi được xem (người duyệt phân quyền: mọi chi nhánh). Form tạo hồ sơ dùng để chọn chi nhánh. */
  @Get('me/branches')
  async myBranches(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(z.object({ officeId: uuid }).strict(), query);
    const rows = await this.repo.rows<{ branch_id: string; branch_name: string }>(
      a.tenantId,
      'dms_my_branches',
      [a.tenantId, a.userId, q.officeId],
    );
    return { rows: rows.map((r) => ({ id: r.branch_id, name: r.branch_name })) };
  }

  /** Ai đang được xem chi nhánh nào (nguồn DMS thu hồi được; nguồn LEGACY là cấp phát cũ theo vai, chỉ hiển thị). */
  @Get('branch-access')
  async branchAccess(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(z.object({ officeId: uuid }).strict(), query);
    const rows = await this.repo.rows<{
      user_id: string;
      branch_id: string;
      branch_name: string;
      source: string;
    }>(a.tenantId, 'dms_branch_access_list', [a.tenantId, a.userId, q.officeId]);
    return {
      rows: rows.map((r) => ({
        userId: r.user_id,
        branchId: r.branch_id,
        branchName: r.branch_name,
        source: r.source,
      })),
    };
  }

  /** Cấp / thu hồi chi nhánh cho một người. Người có quyền duyệt phân quyền áp dụng ngay; lý do bắt buộc; có nhật ký. */
  @Post('branch-access')
  @HttpCode(HttpStatus.OK)
  setBranchAccess(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          userId: uuid,
          branchId: uuid,
          granted: z.boolean(),
          reason: z.string().trim().min(1).max(1000),
        })
        .strict(),
      body,
    );
    return this.run(a, 'dms_branch_access_set', [
      b.officeId,
      b.userId,
      b.branchId,
      b.granted,
      b.reason,
    ]);
  }

  /** Hồ sơ chưa có chi nhánh (dữ liệu trước ngày áp dụng phạm vi chi nhánh). Chỉ Admin thấy; người khác nhận danh sách rỗng. */
  @Get('cases-without-branch')
  async casesWithoutBranch(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(z.object({ officeId: uuid }).strict(), query);
    const rows = await this.repo.rows<{
      id: string;
      domain: string;
      title: string;
      status: string;
      created_at: string;
    }>(a.tenantId, 'dms_cases_without_branch', [a.tenantId, a.userId, q.officeId, 200]);
    const total = await this.repo.rows<{ dms_cases_without_branch_count: string }>(
      a.tenantId,
      'dms_cases_without_branch_count',
      [a.tenantId, a.userId, q.officeId],
    );
    return {
      total: Number(total[0]?.dms_cases_without_branch_count ?? 0),
      rows: rows.map((r) => ({
        id: r.id,
        domain: r.domain,
        title: r.title,
        status: r.status,
        createdAt: r.created_at,
      })),
    };
  }

  /** Admin gắn chi nhánh cho hồ sơ chưa có chi nhánh. Một lần, không đổi được sau đó; có nhật ký. */
  @Post('cases-without-branch/assign')
  @HttpCode(HttpStatus.OK)
  assignBranch(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z.object({ officeId: uuid, caseIds: z.array(uuid).min(1).max(500), branchId: uuid }).strict(),
      body,
    );
    return this.run(a, 'dms_cases_assign_branch', [b.officeId, b.caseIds, b.branchId]);
  }

  @Get('groups')
  groups(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(z.object({ officeId: uuid }).strict(), query);
    return this.repo
      .rows(a.tenantId, 'dms_list_groups', [a.tenantId, a.userId, q.officeId])
      .then((rows) => ({ rows }));
  }

  @Post('groups')
  createGroup(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(z.object({ officeId: uuid, name: z.string().min(1).max(200) }).strict(), body);
    return this.run(a, 'dms_group_create', [b.officeId, b.name]);
  }

  /** Sao chép nhóm thành nhóm tùy chỉnh mới (không chép quyền quản trị phân quyền, chưa có thành viên). */
  @Post('groups/:id/copy')
  @HttpCode(HttpStatus.OK)
  copyGroup(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ name: z.string().min(1).max(200) }).strict(), body);
    return this.run(a, 'dms_group_copy', [id, b.name]);
  }

  /** Ngừng dùng / dùng lại nhóm: người có quyền duyệt, áp dụng ngay, có lý do. Không xoá gì. */
  @Post('groups/:id/status')
  @HttpCode(HttpStatus.OK)
  setGroupStatus(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({ status: z.enum(['ACTIVE', 'RETIRED']), reason: z.string().min(1).max(1000) })
        .strict(),
      body,
    );
    return this.run(a, 'dms_group_set_status', [id, b.status, b.reason]);
  }

  @Post('groups/:id/requests')
  propose(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          kind: z.enum(KINDS),
          permission: z.string().max(100).nullish(),
          userId: uuid.nullish(),
          reason: z.string().min(1).max(1000),
        })
        .strict(),
      body,
    );
    return this.run(a, 'dms_permission_propose', [
      id,
      b.kind,
      b.permission ?? null,
      b.userId ?? null,
      b.reason,
    ]);
  }

  @Get('permission-requests')
  requests(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(
      z
        .object({ officeId: uuid, status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() })
        .strict(),
      query,
    );
    return this.repo
      .rows(a.tenantId, 'dms_list_permission_requests', [
        a.tenantId,
        a.userId,
        q.officeId,
        q.status ?? null,
      ])
      .then((rows) => ({ rows }));
  }

  @Post('permission-requests/:id/review')
  @HttpCode(HttpStatus.OK)
  review(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ approve: z.boolean(), reason: z.string().max(1000).nullish() }).strict(),
      body,
    );
    return this.run(a, 'dms_permission_review', [id, b.approve, b.reason ?? null]);
  }
}
