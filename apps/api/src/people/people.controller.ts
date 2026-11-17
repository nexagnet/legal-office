import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { FILE_STORE, type FileStore } from '../storage/file-store';
import type { RawBody } from '../storage/upload';
import { statusFor } from '../vibang/status';
import { VibangRepo } from '../vibang/vibang.repo';
import { receiveAvatar } from './avatar';

const ids = z.array(z.string().uuid()).min(1).max(200);

/**
 * Tên hiển thị của người (avatar và tên trên hồ sơ). Chỉ trả tên của người cùng văn phòng với người hỏi và chỉ khi biết mã;
 * không có endpoint liệt kê danh bạ. Quyền do hàm `of_people_names` trong DB quyết định.
 */
@Controller('people')
@UseGuards(ActorGuard)
export class PeopleController {
  constructor(
    @Inject(VibangRepo) private readonly repo: VibangRepo,
    @Optional() @Inject(FILE_STORE) private readonly store: FileStore | null,
  ) {}

  private requireStore(): FileStore {
    if (!this.store)
      throw new HttpException(
        { code: 'FILE_STORE_NOT_CONFIGURED', label: null },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    return this.store;
  }

  /**
   * Người đăng nhập TỰ đặt/đổi ảnh đại diện của mình (jpeg/png/webp, tối đa 2 MB). Không có đường cho người khác (kể cả
   * Admin) đổi hộ: mã người lấy từ phiên. Mỗi lần là một khóa mới trong kho; tệp cũ không bị ghi đè.
   */
  @Put('me/avatar')
  @HttpCode(HttpStatus.OK)
  async setMyAvatar(
    @CurrentActor() a: AuthenticatedActor,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: RawBody,
  ) {
    const store = this.requireStore();
    const file = await receiveAvatar(req, contentType, contentLength);
    const key = `t/${a.tenantId}/avatars/${a.userId}/${randomBytes(12).toString('hex')}.${file.extension}`;
    await store.put(key, file.bytes, file.mime);
    return this.apply(a, key, file.mime);
  }

  /** Người đăng nhập tự gỡ ảnh đại diện của mình (chỉ bỏ liên kết; tệp trong kho giữ nguyên). */
  @Delete('me/avatar')
  @HttpCode(HttpStatus.OK)
  clearMyAvatar(@CurrentActor() a: AuthenticatedActor) {
    return this.apply(a, null, null);
  }

  private async apply(a: AuthenticatedActor, key: string | null, mime: string | null) {
    const op = await this.repo.call(a.tenantId, 'ad_self_set_avatar', [
      a.tenantId,
      a.userId,
      key,
      mime,
    ]);
    const reply = { code: op.code, label: op.label };
    if (statusFor(op) >= 400) throw new HttpException(reply, statusFor(op));
    return reply;
  }

  /** Ảnh đại diện của một người: chính chủ hoặc người cùng văn phòng xem được. Chưa có ảnh = 404. */
  @Get(':id/avatar')
  async avatar(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: { set(h: Record<string, string>): unknown },
  ) {
    const store = this.requireStore();
    const rows = await this.repo.rows<{ object_key: string; mime: string }>(
      a.tenantId,
      'of_avatar_get',
      [a.tenantId, a.userId, id],
    );
    const row = rows[0];
    const bytes =
      row && row.object_key.startsWith(`t/${a.tenantId}/avatars/${id}/`)
        ? await store.get(row.object_key)
        : null;
    if (!row || !bytes)
      throw new HttpException({ code: 'FILE_NOT_FOUND', label: null }, HttpStatus.NOT_FOUND);
    res.set({
      'content-type': row.mime,
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
      // Khóa đổi mỗi lần tải lên và web thêm ?v=<phiên bản>, nên cache riêng tư được.
      'cache-control': 'private, max-age=86400',
    });
    return new StreamableFile(bytes);
  }

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
