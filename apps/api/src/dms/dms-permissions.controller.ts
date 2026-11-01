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
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { buildXlsx, XLSX_MIME } from '../office/xlsx-export';
import { VibangRepo } from '../vibang/vibang.repo';
import { parse, respond, uuid } from './dms-http';

const KINDS = ['GRANT', 'REVOKE', 'ADD_MEMBER', 'REMOVE_MEMBER'] as const;

const KIND_LABEL: Readonly<Record<string, string>> = {
  GRANT: 'Thêm quyền cho nhóm',
  REVOKE: 'Thu hồi quyền của nhóm',
  ADD_MEMBER: 'Gán người vào nhóm',
  REMOVE_MEMBER: 'Gỡ người khỏi nhóm',
};
const when = (v: Date | string | null): string =>
  v === null
    ? ''
    : new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(v));

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

  /** Quyền riêng của từng người (đang hiệu lực + lịch sử). Cần quyền đề xuất hoặc duyệt thay đổi quyền; ngoài ra nhận rỗng. */
  @Get('user-overrides')
  async userOverrides(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(z.object({ officeId: uuid, userId: uuid.optional() }).strict(), query);
    const rows = await this.repo.rows<{
      id: string;
      user_id: string;
      permission: string;
      effect: 'GRANT' | 'REVOKE';
      set_by: string;
      set_at: Date;
      reason: string;
      ended_by: string | null;
      ended_at: Date | null;
      end_reason: string | null;
    }>(a.tenantId, 'dms_list_user_overrides', [a.tenantId, a.userId, q.officeId, q.userId ?? null]);
    return { rows };
  }

  /**
   * Đặt quyền chi tiết cho một tài khoản: gửi TẬP quyền mong muốn (đã tick/bỏ tick), máy chủ suy ra cấp riêng / thu riêng so với nền
   * của các nhóm. Chỉ Admin (quyền duyệt phân quyền); áp dụng ngay, bắt buộc lý do, có nhật ký; không tự đặt cho chính mình.
   */
  @Post('user-overrides')
  @HttpCode(HttpStatus.OK)
  setUserOverrides(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          userId: uuid,
          permissions: z.array(z.string().trim().min(1).max(80)).max(200),
          reason: z.string().trim().min(1).max(1000),
        })
        .strict(),
      body,
    );
    return this.run(a, 'dms_user_overrides_apply', [b.officeId, b.userId, b.permissions, b.reason]);
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

  /**
   * Xuất bản sao nhật ký phân quyền (Figma P10). Quyền riêng `dms.audit.export`; chính việc xuất được ghi vào nhật ký
   * (ai, lúc nào, bao nhiêu dòng) TRƯỚC khi trả dữ liệu. Bị từ chối cũng được ghi.
   */
  @Get('permission-log/export')
  async exportPermissionLog(
    @CurrentActor() a: AuthenticatedActor,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
  ) {
    const q = parse(z.object({ officeId: uuid }).strict(), query);
    await this.run(a, 'dms_audit_export_log', [q.officeId, 'xlsx']);
    const rows = await this.repo.rows<{
      id: string;
      kind: string;
      group_name: string;
      permission: string | null;
      target_label: string | null;
      reason: string;
      status: string;
      auto_applied: boolean;
      proposed_by_label: string | null;
      proposed_at: Date;
      reviewed_by_label: string | null;
      reviewed_at: Date | null;
      review_reason: string | null;
    }>(a.tenantId, 'dms_audit_export_rows', [a.tenantId, a.userId, q.officeId]);
    const result = (r: (typeof rows)[number]) =>
      r.status === 'PENDING'
        ? 'Chờ duyệt'
        : r.status === 'REJECTED'
          ? 'Bị từ chối'
          : r.auto_applied
            ? 'Đã áp dụng (Admin tự đề xuất)'
            : 'Đã áp dụng';
    const buf = await buildXlsx({
      name: 'Nhật ký phân quyền',
      title: 'Nhật ký phân quyền',
      notice: `Bản sao xuất ngày ${when(new Date())}. Nhật ký chỉ thêm, không sửa hay xóa; việc xuất bản sao này cũng được ghi lại.`,
      columns: [
        'Mã yêu cầu',
        'Thời điểm đề xuất',
        'Người đề xuất',
        'Loại thay đổi',
        'Nhóm quyền',
        'Quyền',
        'Người bị tác động',
        'Lý do đề xuất',
        'Người duyệt',
        'Thời điểm duyệt',
        'Kết quả',
        'Lý do từ chối',
      ],
      rows: rows.map((r) => [
        `PQ-${r.id.replace(/-/g, '').slice(-4).toUpperCase()}`,
        when(r.proposed_at),
        r.proposed_by_label,
        KIND_LABEL[r.kind] ?? r.kind,
        r.group_name,
        r.permission,
        r.target_label,
        r.reason,
        r.reviewed_by_label,
        when(r.reviewed_at),
        result(r),
        r.review_reason,
      ]),
    });
    res.set({
      'Content-Type': XLSX_MIME,
      'Content-Disposition': 'attachment; filename="nhat-ky-phan-quyen.xlsx"',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(buf);
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
