import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
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
import { FILE_STORE, isDirectTransferStore, type FileStore } from '../storage/file-store';
import { VibangRepo } from '../vibang/vibang.repo';
import { parse, respond, uuid } from './dms-http';
import { LEGACY_MAX_BYTES, legacyObjectKey } from './legacy';

const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,60}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,60}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const UPLOAD_TTL_SECONDS = 3600;
const DOWNLOAD_TTL_SECONDS = 300;

const fileBody = z
  .object({
    relPath: z
      .string()
      .min(1)
      .max(1000)
      .refine(
        (p) => !p.startsWith('/') && !p.endsWith('/') && !p.includes('\\') && !p.includes('\0'),
        'relPath',
      )
      .refine((p) => !p.split('/').some((seg) => seg === '..' || seg === ''), 'relPath'),
    size: z.number().int().min(0),
    sha256: z.string().regex(SHA256),
    mime: z.string().regex(MIME).default('application/octet-stream'),
    mtime: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

interface BatchRow {
  readonly id: string;
  readonly office_id: string;
  readonly label: string;
  readonly status: 'OPEN' | 'CLOSED';
  readonly created_at: string;
  readonly closed_at: string | null;
  readonly file_count: string;
  readonly total_bytes: string;
  readonly unique_objects: string;
}

const fail = (status: HttpStatus, code: string): never => {
  throw new HttpException({ code, label: null }, status);
};

/**
 * Nhập hàng loạt TÀI LIỆU CŨ (chỉ lưu tệp + đánh dấu "tài liệu cũ", không tạo hồ sơ nghiệp vụ). Quyền do DB quyết định theo
 * Nhóm quyền (dms.legacy.import / dms.legacy.read). Tệp không đi qua API: client xin liên kết tải lên có thời hạn, tải thẳng
 * lên kho (kho tự kiểm tra sha256 và kích thước), rồi gọi `complete` để API kiểm tra tệp đã tới nơi và đăng ký bản ghi.
 * Cố ý KHÔNG có DELETE/PUT: bản ghi và tệp tài liệu cũ không xoá, không ghi đè, không sửa.
 */
@Controller('dms/legacy')
@UseGuards(ActorGuard)
export class DmsLegacyController {
  constructor(
    @Inject(VibangRepo) private readonly repo: VibangRepo,
    @Optional() @Inject(FILE_STORE) private readonly store: FileStore | null,
  ) {}

  private async batch(a: AuthenticatedActor, id: string): Promise<BatchRow> {
    const rows = await this.repo.rows<BatchRow>(a.tenantId, 'dms_legacy_batch_report', [
      a.tenantId,
      a.userId,
      id,
    ]);
    return rows[0] ?? fail(HttpStatus.NOT_FOUND, 'BATCH_NOT_FOUND');
  }

  @Post('batches')
  open(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          label: z.string().trim().min(1).max(200),
          sourceRoot: z.string().max(300).optional(),
        })
        .strict(),
      body,
    );
    return this.repo
      .call(a.tenantId, 'dms_legacy_batch_open', [
        a.tenantId,
        a.userId,
        b.officeId,
        b.label,
        b.sourceRoot ?? null,
      ])
      .then(respond);
  }

  @Get('batches/:id')
  async report(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const b = await this.batch(a, id);
    return {
      id: b.id,
      officeId: b.office_id,
      label: b.label,
      status: b.status,
      createdAt: b.created_at,
      closedAt: b.closed_at,
      fileCount: Number(b.file_count),
      totalBytes: Number(b.total_bytes),
      uniqueObjects: Number(b.unique_objects),
    };
  }

  @Post('batches/:id/close')
  close(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.repo
      .call(a.tenantId, 'dms_legacy_batch_close', [a.tenantId, a.userId, id])
      .then(respond);
  }

  /**
   * Bước 1 cho từng tệp. Nội dung này đã có trong văn phòng (cùng sha256) thì đăng ký ngay, KHÔNG tải lại;
   * ngược lại trả liên kết tải lên có thời hạn.
   */
  @Post('batches/:id/files/prepare')
  async prepare(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const f = parse(fileBody, body);
    const b = await this.batch(a, id);
    if (b.status !== 'OPEN') return fail(HttpStatus.CONFLICT, 'BATCH_CLOSED');
    const key = legacyObjectKey(a.tenantId, b.office_id, f.sha256);

    const known = await this.repo.rows(a.tenantId, 'dms_legacy_known_hashes', [
      a.tenantId,
      a.userId,
      b.office_id,
      [f.sha256],
    ]);
    if (known.length > 0) {
      const r = await this.register(a, id, f, key).then(respond);
      return { status: 'REGISTERED', deduplicated: true, fileId: r.label ?? null, code: r.code };
    }

    if (!this.store) return fail(HttpStatus.SERVICE_UNAVAILABLE, 'FILE_STORE_NOT_CONFIGURED');
    if (!isDirectTransferStore(this.store))
      return fail(HttpStatus.NOT_IMPLEMENTED, 'DIRECT_UPLOAD_NOT_SUPPORTED');
    if (f.size > LEGACY_MAX_BYTES) return fail(HttpStatus.PAYLOAD_TOO_LARGE, 'FILE_TOO_LARGE');
    const up = await this.store.presignPut(key, {
      sha256Hex: f.sha256,
      size: f.size,
      mime: f.mime,
      ttlSeconds: UPLOAD_TTL_SECONDS,
    });
    return {
      status: 'UPLOAD',
      deduplicated: false,
      url: up.url,
      headers: up.headers,
      expiresAt: up.expiresAt.toISOString(),
    };
  }

  /** Bước 2: kiểm tra tệp đã nằm trong kho với đúng kích thước rồi đăng ký bản ghi "tài liệu cũ". Gọi lại an toàn. */
  @Post('batches/:id/files/complete')
  async complete(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const f = parse(fileBody, body);
    const b = await this.batch(a, id);
    if (b.status !== 'OPEN') return fail(HttpStatus.CONFLICT, 'BATCH_CLOSED');
    if (!this.store) return fail(HttpStatus.SERVICE_UNAVAILABLE, 'FILE_STORE_NOT_CONFIGURED');
    if (!isDirectTransferStore(this.store))
      return fail(HttpStatus.NOT_IMPLEMENTED, 'DIRECT_UPLOAD_NOT_SUPPORTED');
    const key = legacyObjectKey(a.tenantId, b.office_id, f.sha256);
    const head = await this.store.head(key);
    if (!head) return fail(HttpStatus.CONFLICT, 'UPLOAD_NOT_COMPLETE');
    if (head.size !== f.size) return fail(HttpStatus.UNPROCESSABLE_ENTITY, 'UPLOAD_SIZE_MISMATCH');
    const r = await this.register(a, id, f, key).then(respond);
    return { status: 'REGISTERED', fileId: r.label ?? null, code: r.code };
  }

  private register(
    a: AuthenticatedActor,
    batchId: string,
    f: z.infer<typeof fileBody>,
    key: string,
  ) {
    return this.repo.call(a.tenantId, 'dms_legacy_register', [
      a.tenantId,
      a.userId,
      batchId,
      f.relPath,
      f.size,
      f.sha256,
      f.mime,
      f.mtime ?? null,
      key,
    ]);
  }

  @Get('files')
  async list(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(
      z
        .object({
          officeId: uuid,
          prefix: z.string().max(1000).default(''),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .strict(),
      query,
    );
    const rows = await this.repo.rows(a.tenantId, 'dms_legacy_list', [
      a.tenantId,
      a.userId,
      q.officeId,
      q.prefix,
      q.limit,
      q.offset,
    ]);
    return { rows, limit: q.limit, offset: q.offset };
  }

  /** Mở/tải một tệp: DB kiểm quyền xem và ghi nhật ký. Kho S3/R2 trả liên kết ngắn hạn; kho đĩa trả thẳng nội dung. */
  @Get('files/:id/download')
  async download(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
  ) {
    if (!this.store) return fail(HttpStatus.SERVICE_UNAVAILABLE, 'FILE_STORE_NOT_CONFIGURED');
    const rows = await this.repo.rows<{
      ok: boolean;
      object_key: string | null;
      mime: string | null;
      file_name: string | null;
    }>(a.tenantId, 'dms_legacy_open', [a.tenantId, a.userId, id]);
    const file = rows[0];
    if (!file?.ok || !file.object_key || !file.mime || !file.file_name)
      return fail(HttpStatus.NOT_FOUND, 'FILE_NOT_FOUND');
    if (!file.object_key.startsWith(`t/${a.tenantId}/`))
      return fail(HttpStatus.NOT_FOUND, 'FILE_NOT_FOUND');
    res.set({ 'cache-control': 'private, no-store' });
    if (isDirectTransferStore(this.store)) {
      const url = await this.store.presignGet(file.object_key, {
        ttlSeconds: DOWNLOAD_TTL_SECONDS,
        fileName: file.file_name,
        mime: file.mime,
      });
      return {
        url,
        fileName: file.file_name,
        expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000).toISOString(),
      };
    }
    const bytes = await this.store.get(file.object_key);
    if (!bytes) return fail(HttpStatus.NOT_FOUND, 'FILE_NOT_FOUND');
    res.set({
      'content-type': file.mime,
      'content-disposition': `attachment; filename="${file.file_name.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
    });
    return new StreamableFile(bytes);
  }
}
