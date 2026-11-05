import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { VibangRepo } from '../vibang/vibang.repo';
import { parse, respond, uuid } from './dms-http';

/** 4 sổ DMS và bộ đếm số hồ sơ Tống đạt (CASE-TD). Khớp ràng buộc của bảng dms_number_imports. */
export const NUMBER_KINDS = ['S-01', 'S-02', 'S-04', 'S-05', 'CASE-TD'] as const;
const kind = z.enum(NUMBER_KINDS);

/** Năm hiện tại theo giờ Việt Nam, cùng cách tính với dms_vn_year trong DB. */
function vnYear(): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(
      new Date(),
    ),
  );
}

/**
 * Số cuối sổ giấy của DMS. Chỉ Admin xem và nhập (DB ép); chỉ tiến, không lùi; mỗi lần nhập được ghi lại.
 * Số kế tiếp mà hệ thống cấp luôn là số cuối cộng một.
 */
@Controller('dms')
@UseGuards(ActorGuard)
export class DmsNumbersController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  @Get('number-status')
  async status(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(
      z
        .object({ officeId: uuid, year: z.coerce.number().int().min(2000).max(2100).optional() })
        .strict(),
      query,
    );
    const year = q.year ?? vnYear();
    const rows = await this.repo.rows<{
      kind: string;
      last_value: number;
      imported_value: number | null;
      imported_at: Date | null;
    }>(a.tenantId, 'dms_number_status', [a.tenantId, a.userId, q.officeId, year]);
    if (rows.length === 0) {
      throw new HttpException({ code: 'ADMIN_ONLY', label: null }, HttpStatus.FORBIDDEN);
    }
    return {
      year,
      rows: rows.map((r) => ({
        kind: r.kind,
        lastValue: r.last_value,
        importedValue: r.imported_value,
        importedAt: r.imported_at,
      })),
    };
  }

  @Post('number-imports')
  @HttpCode(HttpStatus.OK)
  async importLast(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          kind,
          year: z.number().int(),
          lastNumber: z.number().int(),
        })
        .strict(),
      body,
    );
    const op = await this.repo.call(a.tenantId, 'dms_import_last_number', [
      a.tenantId,
      a.userId,
      b.officeId,
      b.kind,
      b.year,
      b.lastNumber,
    ]);
    return respond(op);
  }
}
