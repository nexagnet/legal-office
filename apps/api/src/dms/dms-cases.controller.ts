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
import { BOOK_CODES, VANTHU_CODES, bookOf, toCsv, type BookRowRaw } from './books';
import { BOOK_PDF_MIME, buildBookPdf } from './book-pdf';
import { mergeBookCaseNumbers, mergeCaseExtras } from './dms-extras';
import { domain, parse, respond, uuid } from './dms-http';
import { attributePhoneCheck } from './dms-phone';

const attributes = z.record(z.string(), z.unknown());
/** Thuộc tính của hồ sơ: như `attributes` nhưng `so_dien_thoai` (nếu có) phải đúng dạng số điện thoại. */
const caseAttributes = attributes.superRefine(attributePhoneCheck());
/** Khi Admin sửa: null nghĩa là xóa khóa đó, nên cho phép null ở `so_dien_thoai`. */
const editAttributes = attributes.superRefine(attributePhoneCheck(true));
const status = z.enum(['DRAFT', 'RECORDED', 'CANCELLED']);
/** Trần số dòng của một bản PDF (một sổ cả năm ở 10-20 đơn/ngày còn xa mức này). */
const MAX_PDF_ROWS = 50_000;

/**
 * Hồ sơ DMS (4 nghiệp vụ). Quyền do hàm `dms_*` trong DB quyết định theo Nhóm quyền và ghi nhật ký; controller không
 * tự phán quyền. Cố ý KHÔNG có DELETE hồ sơ/tài liệu, và PUT chỉ có trên bản nháp. Sau khi ghi sổ chỉ ADMIN sửa được nội
 * dung (POST .../admin-edit, bắt buộc lý do, thêm một phiên bản mới chứ không ghi đè bản gốc); nhân viên chỉ tải thêm scan
 * và tích "đã trả kết quả". Tệp luôn là tệp MỚI, không ghi đè.
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
      .rows<{ id: string }>(a.tenantId, 'dms_list_cases', [
        a.tenantId,
        a.userId,
        q.officeId,
        q.domain ?? null,
        q.status ?? null,
        q.limit,
        q.offset,
      ])
      .then((rows) => mergeCaseExtras(this.repo, a, rows))
      .then((rows) => ({ rows }));
  }

  /** Dữ liệu phụ cho bộ lọc danh sách: người tạo, chi nhánh, loại tài liệu của từng hồ sơ. Cùng phạm vi hiển thị với danh sách. */
  @Get('case-facets')
  facets(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(z.object({ officeId: uuid, domain: domain.optional() }).strict(), query);
    return this.repo
      .rows(a.tenantId, 'dms_case_facets', [a.tenantId, a.userId, q.officeId, q.domain ?? null])
      .then((rows) => ({ rows }));
  }

  /** Các phiên bản của hồ sơ (bản gốc + sửa đổi đã duyệt) để so sánh trước/sau. Cùng phạm vi hiển thị với danh sách. */
  @Get('cases/:id/revisions')
  revisions(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.repo
      .rows(a.tenantId, 'dms_case_revision_list', [a.tenantId, a.userId, id])
      .then((rows) => ({ rows }));
  }

  /**
   * Lịch sử hồ sơ: ai làm gì, lúc nào, trên hồ sơ này (kể cả tài liệu và tệp của nó), mới nhất trước. Ai xem được hồ sơ thì
   * xem được lịch sử; người khác nhận danh sách rỗng (DB quyết định). Chỉ đọc.
   */
  @Get('cases/:id/history')
  history(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.repo
      .rows(a.tenantId, 'dms_case_history', [a.tenantId, a.userId, id])
      .then((rows) => ({ rows }));
  }

  /** Định nghĩa các sổ (tiêu đề + cột đúng mẫu) để giao diện dựng form nhập và bản xem trước. */
  @Get('books')
  books() {
    return {
      books: BOOK_CODES.map((c) => bookOf(c)),
      vanthu: VANTHU_CODES.map((c) => bookOf(c)),
    };
  }

  /**
   * Dòng sổ của một văn phòng/năm. `format=csv` trả tệp CSV, `format=pdf` trả bản in đúng mẫu (toàn bộ dòng của năm,
   * không phân trang); mặc định JSON. Chỉ thấy phần mình được quyền đọc.
   */
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
          format: z.enum(['json', 'csv', 'pdf']).default('json'),
          limit: z.coerce.number().int().min(1).max(2000).default(500),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .strict(),
      query,
    );
    if (q.format === 'pdf') {
      const [rows, officeName] = await Promise.all([
        this.allBookRows(a, q.officeId, spec.code, q.year),
        this.officeLegalName(a, q.officeId),
      ]);
      const pdf = await buildBookPdf({ spec, rows, year: q.year, officeName });
      res.set({
        'content-type': BOOK_PDF_MIME,
        'content-disposition': `attachment; filename="${spec.form}-${q.year}.pdf"`,
        'cache-control': 'private, no-store',
      });
      return new StreamableFile(pdf);
    }
    const rows = await mergeBookCaseNumbers(
      this.repo,
      a,
      await this.repo.rows<BookRowRaw & { case_id: string }>(a.tenantId, 'dms_book_rows', [
        a.tenantId,
        a.userId,
        q.officeId,
        spec.code,
        q.year,
        q.limit,
        q.offset,
      ]),
    );
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

  /** Mọi dòng sổ của năm, đọc từng lô để một sổ dài không bị cắt ở giới hạn của một lần gọi. */
  private async allBookRows(a: AuthenticatedActor, officeId: string, code: string, year: number) {
    const batch = 2000;
    const out: BookRowRaw[] = [];
    for (let offset = 0; offset < MAX_PDF_ROWS; offset += batch) {
      const rows = await mergeBookCaseNumbers(
        this.repo,
        a,
        await this.repo.rows<BookRowRaw & { case_id: string }>(a.tenantId, 'dms_book_rows', [
          a.tenantId,
          a.userId,
          officeId,
          code,
          year,
          batch,
          offset,
        ]),
      );
      out.push(...rows);
      if (rows.length < batch) return out;
    }
    throw new HttpException(
      { code: 'BOOK_TOO_LARGE', label: null },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  /** Tên pháp lý của văn phòng để in ở bìa; không đọc được thì để chấm chấm như mẫu giấy. */
  private async officeLegalName(a: AuthenticatedActor, officeId: string): Promise<string | null> {
    try {
      const rows = await this.repo.rows<{ legal_name: string | null }>(
        a.tenantId,
        'of_search_office_settings',
        [a.tenantId, a.userId, officeId],
      );
      return rows[0]?.legal_name ?? null;
    } catch {
      return null;
    }
  }

  /** Báo cáo tổng hợp số liệu theo miền và năm (không phải mẫu N-09/N-10 chính thức). Chỉ phần người xem được quyền đọc. */
  @Get('report')
  async report(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(
      z
        .object({
          officeId: uuid,
          year: z.coerce.number().int().min(2000).max(2100),
          branchId: uuid.optional(),
          half: z.enum(['1']).optional(),
        })
        .strict(),
      query,
    );
    const rows = await this.repo.rows(a.tenantId, 'dms_report_summary', [
      a.tenantId,
      a.userId,
      q.officeId,
      q.year,
      q.branchId ?? null,
      q.half === '1',
    ]);
    // Thẻ số "việc còn dở" của Tống đạt, Xác minh, Tổ chức (Figma DMS v2): domain -> số còn dở.
    // Thiếu hàm này (chưa chạy migration 0102) thì không được làm hỏng cả báo cáo.
    const pending = await this.repo
      .rows(a.tenantId, 'dms_domain_pending_counts', [a.tenantId, a.userId, q.officeId, q.year])
      .catch(() => []);
    // Thẻ số "Đã trả kết quả" (N2): domain -> số hồ sơ đã tích. Cùng cách xử lý như `pending`.
    const returned = await this.repo
      .rows(a.tenantId, 'dms_domain_returned_counts', [a.tenantId, a.userId, q.officeId, q.year])
      .catch(() => []);
    return { year: q.year, rows, pending, returned };
  }

  @Get('cases/:id')
  async one(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.repo.rows<{ id: string }>(a.tenantId, 'dms_get_case', [
      a.tenantId,
      a.userId,
      id,
    ]);
    if (!rows[0])
      throw new HttpException({ code: 'CASE_NOT_FOUND', label: null }, HttpStatus.NOT_FOUND);
    return (await mergeCaseExtras(this.repo, a, rows))[0];
  }

  @Post('cases')
  create(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          domain,
          title: z.string().min(1).max(500),
          attributes: caseAttributes.default({}),
          /** Chi nhánh của hồ sơ. Bỏ trống: có đúng một chi nhánh được cấp thì tự chọn; nhiều thì DB đòi chọn (BRANCH_REQUIRED). */
          branchId: uuid.optional(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'dms_case_create_draft', [
      b.officeId,
      b.domain,
      b.title,
      JSON.stringify(b.attributes),
      b.branchId ?? null,
    ]);
  }

  @Put('cases/:id/draft')
  updateDraft(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({ title: z.string().min(1).max(500), attributes: caseAttributes.default({}) })
        .strict(),
      body,
    );
    return this.run(a, 'dms_case_update_draft', [id, b.title, JSON.stringify(b.attributes)]);
  }

  /**
   * Tích / bỏ tích "Đã trả kết quả" (N2): chỉ là dấu hiệu nhìn, không đổi trạng thái hồ sơ, không chặn bước nào.
   * Chỉ hồ sơ đã ghi sổ; cần quyền thêm tài liệu. Mỗi lần đổi giá trị đều có nhật ký.
   */
  @Post('cases/:id/returned')
  @HttpCode(HttpStatus.OK)
  setReturned(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ returned: z.boolean() }).strict(), body);
    return this.run(a, 'dms_case_set_returned', [id, b.returned]);
  }

  /**
   * Admin sửa hồ sơ đã ghi sổ (N5). Thuộc tính gửi lên được gộp vào giá trị hiện hành (null = xóa khóa); bắt buộc lý do.
   * Thêm một phiên bản mới, bản gốc giữ nguyên. Người khác Admin nhận 403 ADMIN_ONLY.
   */
  @Post('cases/:id/admin-edit')
  @HttpCode(HttpStatus.OK)
  adminEdit(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          title: z.string().min(1).max(500).optional(),
          attributes: editAttributes.optional(),
          reason: z.string().trim().min(1).max(1000),
        })
        .strict(),
      body,
    );
    return this.run(a, 'dms_case_admin_edit', [
      id,
      b.title ?? null,
      b.attributes ? JSON.stringify(b.attributes) : null,
      b.reason,
    ]);
  }

  /** Admin sửa thuộc tính của một tài liệu đã ghi sổ. Cùng luật với `cases/:id/admin-edit`. */
  @Post('documents/:id/admin-edit')
  @HttpCode(HttpStatus.OK)
  adminEditDocument(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ attributes: editAttributes, reason: z.string().trim().min(1).max(1000) }).strict(),
      body,
    );
    return this.run(a, 'dms_document_admin_edit', [id, JSON.stringify(b.attributes), b.reason]);
  }

  /** Xem trước khi ghi sổ: cột bắt buộc còn thiếu hoặc ngày không có thật (cùng luật với `dms_case_record`). */
  @Get('cases/:id/record-check')
  async recordCheck(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.repo.rows<{ key: string; problem: string }>(
      a.tenantId,
      'dms_case_record_problems',
      [a.tenantId, a.userId, id],
    );
    return { problems: rows };
  }

  /** "Xác nhận lưu chính thức": từ đây hồ sơ và tài liệu của nó bất biến. */
  @Post('cases/:id/record')
  @HttpCode(HttpStatus.OK)
  async record(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    // Thiếu cột bắt buộc hoặc ngày không có thật thì không ghi sổ (hồ sơ đã ghi sổ không sửa trực tiếp được).
    const problems = await this.repo.rows(a.tenantId, 'dms_case_record_problems', [
      a.tenantId,
      a.userId,
      id,
    ]);
    if (problems.length > 0)
      throw new HttpException(
        { code: 'REQUIRED_COLUMNS_MISSING', label: null },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
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

  /**
   * Ô "Tài liệu khác" dùng chung cho cả 4 nghiệp vụ: trả tài liệu loại này của hồ sơ (chưa có thì tạo). Dùng được cả khi
   * hồ sơ đã ghi sổ, vì lúc đó chỉ tải thêm tệp được, không thêm tài liệu thủ công. Không vào Sổ S-01 của tống đạt.
   */
  @Post('cases/:id/other-document')
  otherDocument(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'dms_document_other_ensure', [id]);
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

  /** Tiến độ OCR của vài tệp (polling nhẹ, không ghi nhật ký). Chỉ trả tệp người gọi xem được. */
  @Get('files/ocr-status')
  ocrStatus(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(
      z
        .object({
          ids: z
            .string()
            .transform((v) => v.split(',').filter(Boolean))
            .pipe(z.array(z.string().uuid()).min(1).max(50)),
        })
        .strict(),
      query,
    );
    return this.repo
      .rows(a.tenantId, 'dms_ocr_status', [a.tenantId, a.userId, q.ids])
      .then((rows) => ({ rows }));
  }

  /** Thử lại OCR cho tệp mà OCR đã lỗi: chỉ đặt lại hàng đợi OCR, không đụng tệp/phiên bản. Cùng quyền thêm tài liệu. */
  @Post('files/:id/ocr-retry')
  @HttpCode(HttpStatus.OK)
  ocrRetry(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'dms_ocr_retry', [id]);
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
    @Query('inline') inline?: string,
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
    // `?inline=1` cho xem trước PDF/ảnh ngay trong trang; loại khác luôn tải về.
    const previewable = inline === '1' && /^(application\/pdf|image\/(png|jpeg))$/.test(file.mime);
    res.set({
      'content-type': file.mime,
      'content-disposition': `${previewable ? 'inline' : 'attachment'}; filename="${file.label.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'cache-control': 'private, no-store',
      ...(previewable
        ? {
            'x-content-type-options': 'nosniff',
            // Chỉ cho chính trang của mình nhúng bản xem trước (mặc định API cấm mọi khung).
            'x-frame-options': 'SAMEORIGIN',
            'content-security-policy': "frame-ancestors 'self'",
          }
        : {}),
    });
    return new StreamableFile(bytes);
  }
}
