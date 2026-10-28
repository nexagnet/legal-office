import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { VibangRepo } from '../vibang/vibang.repo';

const ids = z.array(z.string().uuid()).min(1).max(200);

/**
 * Tên hiển thị của người (avatar và tên trên hồ sơ). Chỉ trả tên của người cùng văn phòng với người hỏi và chỉ khi biết mã;
 * không có endpoint liệt kê danh bạ. Quyền do hàm `of_people_names` trong DB quyết định.
 */
@Controller('people')
@UseGuards(ActorGuard)
export class PeopleController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  @Get('names')
  async names(@CurrentActor() a: AuthenticatedActor, @Query('ids') raw?: string) {
    const parsed = ids.safeParse((raw ?? '').split(',').filter(Boolean));
    if (!parsed.success) throw new BadRequestException('ids: danh sách mã người không hợp lệ');
    const rows = await this.repo.rows<{ user_id: string; display_name: string }>(
      a.tenantId,
      'of_people_names',
      [a.tenantId, a.userId, parsed.data],
    );
    return { items: rows.map((r) => ({ userId: r.user_id, displayName: r.display_name })) };
  }
}
