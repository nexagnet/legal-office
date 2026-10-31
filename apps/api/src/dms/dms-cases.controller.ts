import { randomUUID } from 'node:crypto';
import {
  Body,
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
import { recordWithUpload } from '../storage/evidence';
import { FILE_STORE, type FileStore } from '../storage/file-store';
import type { RawBody } from '../storage/upload';
import { VibangRepo } from '../vibang/vibang.repo';
import { BOOK_CODES, bookOf, toCsv, type BookRowRaw } from './books';
import { domain, parse, respond, uuid } from './dms-http';

const attributes = z.record(z.string(), z.unknown());
const status = z.enum(['DRAFT', 'RECORDED', 'CANCELLED']);

/**
 * Hồ sơ DMS (4 nghiệp vụ). Quyền do hàm `dms_*` trong DB quyết định theo Nhóm quyền và ghi nhật ký; controller không
 * tự phán quyền. Cố ý KHÔNG có DELETE, và PUT chỉ có trên bản nháp: hồ sơ/tài liệu đã ghi sổ không có đường sửa trực tiếp
 * (đổi sau khi ghi sổ phải qua yêu cầu sửa đổi có duyệt, Phase 4). Tệp luôn là tệp MỚI, không ghi đè.
 */
@Controller('dms')
@UseGuards(ActorGuard)
export class DmsCasesController {
  constructor(
    @Inject(VibangRepo) private readonly repo: VibangRepo,
    @Optional() @Inject(FILE_STORE) private readonly store: FileStore | null,
  ) {}

  private run(a: AuthenticatedActor, fn: string, args: readonly unknown[]) {
    return this.repo.call(a.tenantId, fn, [a.tenantId, a.userId, ...args]).then(respond);
  }

  @Get('cases')
  list(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(
      z
        .object({
          officeId: uuid,
          domain: domain.optional(),
          status: status.optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .strict(),
      query,
    );
    return this.repo
      .rows(a.tenantId, 'dms_list_cases', [
        a.tenantId,
        a.userId,
        q.officeId,
        q.domain ?? null,
        q.status ?? null,
        q.limit,
        q.offset,
      ])
      .then((rows) => ({ rows }));
  }

  /** Định nghĩa các sổ (tiêu đề + cột đúng mẫu) để giao diện dựng form nhập và bản xem trước. */
  @Get('books')
  books() {
    return { books: BOOK_CODES.map((c) => bookOf(c)) };
  }

  /** Dòng sổ của một văn phòng/năm. `format=csv` trả tệp CSV; mặc định JSON. Chỉ thấy phần mình được quyền đọc. */
  @Get('books/:book')
  async bookRows(
    @CurrentActor() a: AuthenticatedActor,
    @Param('book') bookCode: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
  ) {
    const spec = bookOf(bookCode);
    if (!spec)
      throw new HttpException({ code: 'INVALID_INPUT', label: null }, HttpStatus.BAD_REQUEST);
    const q = parse(
      z
        .object({
          officeId: uuid,
          year: z.coerce.number().int().min(2000).max(2100),
          format: z.enum(['json', 'csv']).default('json'),
          limit: z.coerce.number().int().min(1).max(2000).default(500),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .strict(),
      query,
    );
    const rows = await this.repo.rows<BookRowRaw>(a.tenantId, 'dms_book_rows', [
      a.tenantId,
      a.userId,
      q.officeId,
      spec.code,
      q.year,
      q.limit,
      q.offset,
    ]);
    if (q.format === 'csv') {
      res.set({
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${spec.form}-${q.year}.csv"`,
        'cache-control': 'private, no-store',
      });
      return new StreamableFile(Buffer.from(toCsv(spec, rows), 'utf8'));
    }
    return { book: spec, year: q.year, rows };
  }

  @Get('cases/:id')
  async one(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.repo.rows(a.tenantId, 'dms_get_case', [a.tenantId, a.userId, id]);
    if (!rows[0])
      throw new HttpException({ code: 'CASE_NOT_FOUND', label: null }, HttpStatus.NOT_FOUND);
    return rows[0];
  }

  @Post('cases')
  create(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          domain,
          title: z.string().min(1).max(500),
          attributes: attributes.default({}),
        })
        .strict(),
      body,
    );
    return this.run(a, 'dms_case_create_draft', [
      b.officeId,
      b.domain,
      b.title,
      JSON.stringify(b.attributes),
    ]);
  }

  @Put('cases/:id/draft')
  updateDraft(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ title: z.string().min(1).max(500), attributes: attributes.default({}) }).strict(),
      body,
    );
    return this.run(a, 'dms_case_update_draft', [id, b.title, JSON.stringify(b.attributes)]);
  }

  /** "Xác nhận lưu chính thức": từ đây hồ sơ và tài liệu của nó bất biến. */
  @Post('cases/:id/record')
  @HttpCode(HttpStatus.OK)
  record(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'dms_case_record', [id]);
  }

  /** "Hủy nháp": giữ lịch sử, không xoá. */
  @Post('cases/:id/cancel-draft')
  @HttpCode(HttpStatus.OK)
  cancelDraft(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ reason: z.string().min(1).max(1000) }).strict(), body);
    return this.run(a, 'dms_case_cancel_draft', [id, b.reason]);
  }

  @Get('cases/:id/documents')
  documents(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.repo
      .rows(a.tenantId, 'dms_list_documents', [a.tenantId, a.userId, id])
      .then((rows) => ({ rows }));
  }

  @Post('cases/:id/documents')
  addDocument(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          kind: z.string().min(1).max(100),
          title: z.string().min(1).max(500),
          isOfficial: z.boolean().default(false),
          attributes: attributes.optional(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'dms_document_add', [
      id,
      b.kind,
      b.title,
      b.isOfficial,
      b.attributes ? JSON.stringify(b.attributes) : null,
    ]);
  }

  @Put('documents/:id/draft')
  updateDocumentDraft(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          kind: z.string().min(1).max(100),
          title: z.string().min(1).max(500),
          isOfficial: z.boolean().default(false),
          attributes: attributes.optional(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'dms_document_update_draft', [
      id,
      b.kind,
      b.title,
      b.isOfficial,
      b.attributes ? JSON.stringify(b.attributes) : null,
    ]);
  }

  @Get('documents/:id/files')
  files(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.repo
      .rows(a.tenantId, 'dms_list_files', [a.tenantId, a.userId, id])
      .then((rows) => ({ rows }));
  }

  /** Tải lên một tệp MỚI (PDF/JPEG/PNG). Máy chủ tự tính hash và khoá đối tượng; không có đường ghi đè. */
  @Post('documents/:id/files')
  @HttpCode(HttpStatus.OK)
  attachFile(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: RawBody,
  ) {
    const q = parse(
      z
        .object({
          label: z.string().min(1).max(200),
          isScan: z.enum(['true', 'false']).default('false'),
        })
        .strict(),
      query,
    );
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/dms/${id}/${randomUUID()}.${f.extension}`,
      (key, f) =>
        this.run(a, 'dms_file_attach', [
          id,
          q.label,
          q.isScan === 'true',
          key,
          f.sha256,
          f.mime,
          f.bytes.length,
        ]),
    );
  }

  /** Tải/xem một tệp: DB kiểm quyền tải theo Nhóm quyền và ghi nhật ký; máy chủ đọc tệp từ kho. */
  @Get('files/:id/download')
  async download(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
  ) {
    if (!this.store)
      throw new HttpException(
        { code: 'FILE_STORE_NOT_CONFIGURED', label: null },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const rows = await this.repo.rows<{
      object_key: string;
      mime: string;
      label: string;
    }>(a.tenantId, 'dms_file_download', [a.tenantId, a.userId, id]);
    const file = rows[0];
    const bytes =
      file && file.object_key.startsWith(`t/${a.tenantId}/`)
        ? await this.store.get(file.object_key)
        : null;
    if (!file || !bytes)
      throw new HttpException({ code: 'FILE_NOT_FOUND', label: null }, HttpStatus.NOT_FOUND);
    res.set({
      'content-type': file.mime,
      'content-disposition': `attachment; filename="${file.label.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'cache-control': 'private, no-store',
    });
    return new StreamableFile(bytes);
  }
}
