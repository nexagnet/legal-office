import { randomUUID } from 'node:crypto';
import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
  Body,
} from '@nestjs/common';
import { z } from 'zod';
import { parse, respond, uuid } from '../dms/dms-http';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { recordWithUpload } from '../storage/evidence';
import { FILE_STORE, type FileStore } from '../storage/file-store';
import type { RawBody } from '../storage/upload';
import { VibangRepo } from '../vibang/vibang.repo';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Ngày không hợp lệ');

/**
 * Vòng đời Thẻ thừa hành viên (Figma Q7). Quyết định owner 2026-11-01: không có bước xác nhận; Admin làm trực tiếp, có hiệu lực
 * ngay, không ai duyệt Admin. Quyền do hàm `of_thv_card_*` quyết định (chỉ Admin văn phòng). Ngừng hiệu lực không xoá gì.
 */
@Controller('office/thv-cards')
@UseGuards(ActorGuard)
export class ThvCardsController {
  constructor(
    @Inject(VibangRepo) private readonly repo: VibangRepo,
    @Optional() @Inject(FILE_STORE) private readonly store: FileStore | null,
  ) {}

  /**
   * Lưu thẻ đầy đủ căn cứ. Thông tin nằm trên query; bản scan quyết định (PDF/JPEG/PNG) là thân yêu cầu. Bản scan bắt buộc khi cấp
   * mới hoặc đổi số quyết định; nếu không đổi quyết định thì có thể bỏ thân yêu cầu để giữ bản scan cũ.
   */
  @Post(':userId')
  @HttpCode(HttpStatus.OK)
  save(
    @CurrentActor() a: AuthenticatedActor,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: unknown,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: RawBody,
  ) {
    const q = parse(
      z
        .object({
          officeId: uuid,
          fullName: z.string().trim().max(200),
          cardNo: z.string().trim().max(50),
          decisionNo: z.string().trim().max(100),
          decisionDate: day,
          effectiveFrom: day,
        })
        .strict(),
      query,
    );
    const base = [
      a.tenantId,
      a.userId,
      q.officeId,
      userId,
      q.fullName,
      q.cardNo,
      q.decisionNo,
      q.decisionDate,
      q.effectiveFrom,
    ];
    const withoutScan = !contentType || contentLength === '0';
    if (withoutScan)
      return this.repo
        .call(a.tenantId, 'of_thv_card_save', [...base, null, null, null, null])
        .then(respond);
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/thv-cards/${randomUUID()}.${f.extension}`,
      (key, f) =>
        this.repo
          .call(a.tenantId, 'of_thv_card_save', [...base, key, f.sha256, f.mime, f.bytes.length])
          .then(respond),
    );
  }

  /** Ngừng hiệu lực (giữ thẻ và lịch sử, không xoá). */
  @Post(':userId/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(
    @CurrentActor() a: AuthenticatedActor,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ officeId: uuid }).strict(), body);
    return this.repo
      .call(a.tenantId, 'of_thv_card_suspend', [a.tenantId, a.userId, b.officeId, userId])
      .then(respond);
  }

  @Get(':userId/history')
  async history(
    @CurrentActor() a: AuthenticatedActor,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: unknown,
  ) {
    const q = parse(z.object({ officeId: uuid }).strict(), query);
    const rows = await this.repo.rows<{
      id: string;
      event: string;
      full_name: string;
      card_no: string;
      status: string;
      decision_no: string | null;
      decision_date: string | null;
      effective_from: string | null;
      effective_to: string | null;
      has_scan: boolean;
      actor_id: string;
      at: Date;
    }>(a.tenantId, 'of_thv_card_history_list', [a.tenantId, a.userId, q.officeId, userId]);
    return {
      rows: rows.map((r) => ({
        id: Number(r.id),
        event: r.event,
        fullName: r.full_name,
        cardNo: r.card_no,
        status: r.status,
        decisionNo: r.decision_no,
        decisionDate: r.decision_date,
        effectiveFrom: r.effective_from,
        effectiveTo: r.effective_to,
        hasScan: r.has_scan,
        actorId: r.actor_id,
        at: new Date(r.at).toISOString(),
      })),
    };
  }

  /** Tải bản scan quyết định: hiện tại, hoặc của một dòng lịch sử (`historyId`). Chỉ Admin. */
  @Get(':userId/scan')
  async scan(
    @CurrentActor() a: AuthenticatedActor,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
  ) {
    if (!this.store)
      throw new HttpException(
        { code: 'FILE_STORE_NOT_CONFIGURED', label: null },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const q = parse(
      z
        .object({ officeId: uuid, historyId: z.coerce.number().int().positive().optional() })
        .strict(),
      query,
    );
    const rows = await this.repo.rows<{ object_key: string; mime: string }>(
      a.tenantId,
      'of_thv_card_scan',
      [a.tenantId, a.userId, q.officeId, userId, q.historyId ?? null],
    );
    const file = rows[0];
    const bytes =
      file && file.object_key.startsWith(`t/${a.tenantId}/`)
        ? await this.store.get(file.object_key)
        : null;
    if (!file || !bytes)
      throw new HttpException({ code: 'FILE_NOT_FOUND', label: null }, HttpStatus.NOT_FOUND);
    res.set({
      'content-type': file.mime,
      'content-disposition': 'inline; filename="quyet-dinh-the-thv"',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    });
    return new StreamableFile(bytes);
  }
}
