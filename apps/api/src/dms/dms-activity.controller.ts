import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { VibangRepo } from '../vibang/vibang.repo';
import { parse, uuid } from './dms-http';

/**
 * Lịch sử hoạt động của DMS (Figma "Lịch sử hoạt động"): ai làm gì, lúc nào, trên hồ sơ/tài liệu/file/bản trình nào. Đọc từ
 * nhật ký chỉ-thêm-không-sửa. CHỈ ADMIN của văn phòng đọc được; người khác nhận danh sách rỗng (DB quyết định, không phải
 * controller). Chỉ đọc: không có đường ghi hay xóa nhật ký.
 */
@Controller('dms')
@UseGuards(ActorGuard)
export class DmsActivityController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  @Get('activity')
  list(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(
      z
        .object({
          officeId: uuid,
          group: z.enum(['case', 'document', 'file', 'submission', 'permission']).optional(),
          q: z.string().max(200).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .strict(),
      query,
    );
    return this.repo
      .rows<{ total: string | number }>(a.tenantId, 'dms_activity_list', [
        a.tenantId,
        a.userId,
        q.officeId,
        q.group ?? null,
        q.q?.trim() || null,
        q.limit,
        q.offset,
      ])
      .then((rows) => ({
        rows: rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'total'))),
        total: rows[0] ? Number(rows[0].total) : 0,
      }));
  }
}
