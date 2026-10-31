import {
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
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { VibangRepo } from '../vibang/vibang.repo';
import { parse, respond, uuid } from './dms-http';

/**
 * Thừa hành viên (THV) được ghi tên trong hồ sơ phải tự bấm xác nhận (owner 2026-10-31). Người nhập liệu chỉ ghi tên (nháp);
 * hồ sơ có ghi tên THV chỉ ghi sổ được sau khi chính THV đó xác nhận nội dung hiện tại. Quyền do hàm `dms_*` quyết định.
 */
@Controller('dms')
@UseGuards(ActorGuard)
export class DmsThvController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  /** Ghi tên (hoặc bỏ tên) THV trên bản nháp. */
  @Put('cases/:id/thv')
  setThv(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ thvUserId: uuid.nullable() }).strict(), body);
    return this.repo
      .call(a.tenantId, 'dms_case_set_thv', [a.tenantId, a.userId, id, b.thvUserId])
      .then(respond);
  }

  /** Các bản nháp đang chờ chính người gọi xác nhận. */
  @Get('thv/pending')
  pending(@CurrentActor() a: AuthenticatedActor) {
    return this.repo
      .rows(a.tenantId, 'dms_list_thv_pending', [a.tenantId, a.userId])
      .then((rows) => ({ rows }));
  }

  /** Nội dung cần xác nhận (không có tệp). Chỉ THV được ghi tên, chỉ khi còn là nháp. */
  @Get('thv/cases/:id')
  async review(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.repo.rows(a.tenantId, 'dms_thv_review_case', [
      a.tenantId,
      a.userId,
      id,
    ]);
    if (!rows[0])
      throw new HttpException({ code: 'CASE_NOT_FOUND', label: null }, HttpStatus.NOT_FOUND);
    return rows[0];
  }

  @Post('thv/cases/:id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.repo.call(a.tenantId, 'dms_thv_confirm', [a.tenantId, a.userId, id]).then(respond);
  }
}
