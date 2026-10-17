import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Get,
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
import { addWorkingDays } from '../deadlines/working-days';
import { LEDGER_BY_CODE, shapeLedgerRow } from './ledgers';
import { buildPdf, PDF_MIME } from './pdf-export';
import { buildXlsx, XLSX_MIME, type SheetSpec } from './xlsx-export';
import { recordWithUpload } from '../storage/evidence';
import { FILE_STORE, type FileStore } from '../storage/file-store';
import type { RawBody } from '../storage/upload';
import { statusFor } from '../vibang/status';
import { VibangRepo, type Op } from '../vibang/vibang.repo';

const uuid = z.string().uuid();
const LEDGER_NOTICE = 'Bản điện tử hỗ trợ theo dõi, không phải biểu mẫu chính thức.';

function parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }
  return result.data;
}

interface Reply {
  readonly code: string;
  readonly label: string | null;
}
function respond(op: Op): Reply {
  const status = statusFor(op);
  const reply = { code: op.code, label: op.label };
  if (status >= 400) throw new HttpException(reply, status);
  return reply;
}

const evidence = { evidenceKey: z.string().max(500), evidenceSha256: z.string().max(64) };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const caseLink = {
  caseKind: z.string().nullish(),
  caseId: uuid.nullish(),
};

/**
 * Quản lý văn phòng: công văn đi/đến, sổ quyết định, thư viện TT06 (chỉ tải), vật tư FIFO, nguồn S-06. Quyền do hàm
 * `of_*` trong DB quyết định và audit. Đọc/tìm kiếm cũng đi qua hàm DB để quyền theo vai/chi nhánh áp dụng đúng.
 * Không có giá/giá vốn; TT06 chỉ trả khoá tệp để tải, không có thao tác điền/ký/phát hành.
 */
@Controller('office')
@UseGuards(ActorGuard)
export class OfficeController {
  constructor(
    @Inject(VibangRepo) private readonly repo: VibangRepo,
    @Optional() @Inject(FILE_STORE) private readonly store: FileStore | null,
  ) {}

  private run(actor: AuthenticatedActor, fn: string, args: readonly unknown[]): Promise<Reply> {
    return this.repo
      .call(actor.tenantId, fn, [actor.tenantId, actor.userId, ...args])
      .then(respond);
  }

  private read<T = Record<string, unknown>>(
    actor: AuthenticatedActor,
    fn: string,
    args: readonly unknown[],
  ) {
    return this.repo.rows<T>(actor.tenantId, fn, [actor.tenantId, actor.userId, ...args]);
  }

  @Post('correspondence')
  @HttpCode(HttpStatus.OK)
  createCorrespondence(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          branchId: uuid,
          direction: z.string(),
          docType: z.string().max(200),
          counterparty: z.string().max(300),
          subject: z.string().max(1000),
          refNo: z.string().max(200).nullish(),
          issuedOn: isoDate.nullish(),
          receivedOn: isoDate.nullish(),
          dueAt: z.string().datetime({ offset: true }).nullish(),
          handlerUserId: uuid.nullish(),
          ...caseLink,
        })
        .strict(),
      body,
    );
    return this.run(a, 'of_corr_create', [
      b.officeId,
      b.branchId,
      b.direction,
      b.docType,
      b.counterparty,
      b.subject,
      b.refNo ?? null,
      b.issuedOn ?? null,
      b.receivedOn ?? null,
      b.dueAt ?? null,
      b.handlerUserId ?? null,
      b.caseKind ?? null,
      b.caseId ?? null,
    ]);
  }

  @Get('correspondence')
  searchCorrespondence(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
    @Query('q') q?: string,
    @Query('direction') direction?: string,
    @Query('caseId') caseId?: string,
  ) {
    const parsedCase = caseId === undefined ? null : parse(uuid, caseId);
    return this.read(a, 'of_search_correspondence', [
      officeId,
      q ?? null,
      direction ?? null,
      parsedCase,
    ]);
  }

  /** Danh sách công văn đầy đủ cột (hạn, người xử lý, ngày nhận/ban hành, kết quả, nơi lưu) + cờ quá hạn, có bộ lọc. */
  @Get('correspondence/list')
  async listCorrespondence(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    const q = parse(
      z.object({
        direction: z.enum(['INBOUND', 'OUTBOUND']).optional(),
        status: z
          .enum(['RECEIVED', 'HANDLED', 'DRAFT', 'SUBMITTED', 'APPROVED', 'ISSUED'])
          .optional(),
        overdue: z.enum(['true', 'false']).optional(),
        handler: uuid.optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
      }),
      { ...query, officeId: undefined },
    );
    const rows = await this.read<Record<string, unknown>>(a, 'of_list_correspondence', [
      officeId,
      q.direction ?? null,
      q.status ?? null,
      q.overdue === 'true',
      q.handler ?? null,
      q.from ?? null,
      q.to ?? null,
      q.limit ?? null,
    ]);
    return rows.map((r) => ({
      id: r.id,
      direction: r.direction,
      status: r.status,
      refNo: r.ref_no,
      docType: r.doc_type,
      counterparty: r.counterparty,
      subject: r.subject,
      branchId: r.branch_id,
      caseKind: r.case_kind,
      caseId: r.case_id,
      receivedOn: r.received_on,
      issuedOn: r.issued_on,
      dueAt: r.due_at,
      handlerUserId: r.handler_user_id,
      resultNote: r.result_note,
      archiveRef: r.archive_ref,
      overdue: r.overdue,
      createdAt: r.created_at,
    }));
  }

  private async getCorrespondence(a: AuthenticatedActor, id: string) {
    const [r] = await this.read<Record<string, unknown>>(a, 'of_get_correspondence', [id]);
    if (!r)
      throw new HttpException(
        { code: 'CORRESPONDENCE_NOT_FOUND', label: null },
        HttpStatus.NOT_FOUND,
      );
    return r;
  }

  /** Chi tiết một công văn + tệp đính kèm + lịch sử. Không đọc được thì 404. */
  @Get('correspondence/:id')
  async correspondenceDetail(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const r = await this.getCorrespondence(a, id);
    return {
      id: r.id,
      officeId: r.office_id,
      direction: r.direction,
      status: r.status,
      refNo: r.ref_no,
      docType: r.doc_type,
      counterparty: r.counterparty,
      subject: r.subject,
      branchId: r.branch_id,
      caseKind: r.case_kind,
      caseId: r.case_id,
      receivedOn: r.received_on,
      issuedOn: r.issued_on,
      dueAt: r.due_at,
      handlerUserId: r.handler_user_id,
      resultNote: r.result_note,
      archiveRef: r.archive_ref,
      sendMethod: r.send_method,
      overdue: r.overdue,
      createdAt: r.created_at,
      attachments: r.attachments,
      events: r.events,
    };
  }

  /** Tải một tệp đính kèm: DB kiểm quyền đọc công văn và audit; máy chủ đọc tệp từ kho. */
  @Get('correspondence/:id/files/:attId')
  async correspondenceFile(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attId', ParseIntPipe) attId: number,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
  ) {
    if (!this.store)
      throw new HttpException(
        { code: 'FILE_STORE_NOT_CONFIGURED', label: null },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const r = await this.getCorrespondence(a, id);
    const att = (r.attachments as { id: number; key: string; name: string }[]).find(
      (x) => x.id === attId,
    );
    const bytes =
      att && att.key.startsWith(`t/${a.tenantId}/`) ? await this.store.get(att.key) : null;
    if (!att || !bytes)
      throw new HttpException({ code: 'FILE_NOT_FOUND', label: null }, HttpStatus.NOT_FOUND);
    const ext = (att.key.split('.').pop() ?? '').toLowerCase();
    const type = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';
    res.set({
      'content-type': type,
      'content-disposition': `attachment; filename="${att.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'cache-control': 'private, no-store',
    });
    return new StreamableFile(bytes);
  }

  /** Giao/đổi người xử lý công văn đến (Admin/Trưởng VP/Thư ký), chỉ khi chưa xử lý. */
  @Post('correspondence/:id/assign')
  @HttpCode(HttpStatus.OK)
  assign(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ handlerUserId: uuid }).strict(), body);
    return this.run(a, 'of_corr_assign', [id, b.handlerUserId]);
  }

  @Post('correspondence/:id/attachments')
  @HttpCode(HttpStatus.OK)
  attach(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ role: z.string(), ...evidence }).strict(), body);
    return this.run(a, 'of_corr_attach', [id, b.role, b.evidenceKey, b.evidenceSha256]);
  }

  /** Đính kèm tệp (PDF/JPEG/PNG) vào công văn; vai trò đính kèm đi theo query. Máy chủ tự tính hash và khoá. */
  @Post('correspondence/:id/attachment-files')
  @HttpCode(HttpStatus.OK)
  attachFile(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: RawBody,
  ) {
    const q = parse(z.object({ role: z.string() }).strict(), query);
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/of/correspondence/${id}/${randomUUID()}.${f.extension}`,
      (key, f) => this.run(a, 'of_corr_attach', [id, q.role, key, f.sha256]),
    );
  }

  /** Ban hành công văn đi kèm chứng từ gửi đi (tệp). Số, ngày và hình thức gửi đi theo query. */
  @Post('correspondence/:id/issuance-file')
  @HttpCode(HttpStatus.OK)
  issueWithProof(
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
          refNo: z.string().max(200).optional(),
          issuedOn: isoDate,
          sendMethod: z.string().max(200),
        })
        .strict(),
      query,
    );
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/of/correspondence/${id}/proof/${randomUUID()}.${f.extension}`,
      (key, f) =>
        this.run(a, 'of_corr_issue', [
          id,
          q.refNo ?? null,
          q.issuedOn,
          q.sendMethod,
          key,
          f.sha256,
        ]),
    );
  }

  @Post('correspondence/:id/result')
  @HttpCode(HttpStatus.OK)
  handle(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({ result: z.string().max(4000), archiveRef: z.string().max(500).nullish() })
        .strict(),
      body,
    );
    return this.run(a, 'of_corr_handle', [id, b.result, b.archiveRef ?? null]);
  }

  @Post('correspondence/:id/submission')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'of_corr_submit', [id]);
  }

  @Post('correspondence/:id/approval')
  @HttpCode(HttpStatus.OK)
  approve(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(a, 'of_corr_approve', [id]);
  }

  @Post('correspondence/:id/issuance')
  @HttpCode(HttpStatus.OK)
  issue(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          refNo: z.string().max(200).optional(),
          issuedOn: isoDate,
          sendMethod: z.string().max(200),
          proofKey: z.string().max(500).nullish(),
          proofSha256: z.string().max(64).nullish(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'of_corr_issue', [
      id,
      b.refNo ?? null,
      b.issuedOn,
      b.sendMethod,
      b.proofKey ?? null,
      b.proofSha256 ?? null,
    ]);
  }

  /** Gắn/đổi/bỏ hồ sơ liên quan của công văn (bỏ cả hai trường = bỏ liên kết). Chỉ khi chưa hoàn tất. */
  @Post('correspondence/:id/link')
  @HttpCode(HttpStatus.OK)
  linkCorrespondence(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          caseKind: z.enum(['VIBANG', 'SERVICE', 'VERIFICATION', 'ENFORCEMENT']).nullish(),
          caseId: uuid.nullish(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'of_corr_link_case', [id, b.caseKind ?? null, b.caseId ?? null]);
  }

  @Post('decisions')
  @HttpCode(HttpStatus.OK)
  recordDecision(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          branchId: uuid,
          decisionNo: z.string().max(200),
          docType: z.string().max(200),
          title: z.string().max(1000),
          signerUserId: uuid,
          signedOn: isoDate,
          ...caseLink,
          evidenceKey: z.string().max(500).nullish(),
          evidenceSha256: z.string().max(64).nullish(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'of_decision_record', [
      b.officeId,
      b.branchId,
      b.decisionNo,
      b.docType,
      b.title,
      b.signerUserId,
      b.signedOn,
      b.caseKind ?? null,
      b.caseId ?? null,
      b.evidenceKey ?? null,
      b.evidenceSha256 ?? null,
    ]);
  }

  @Get('decisions')
  searchDecisions(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
    @Query('q') q?: string,
    @Query('docType') docType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('signer') signer?: string,
    @Query('caseId') caseId?: string,
  ) {
    return this.read(a, 'of_search_decisions', [
      officeId,
      q ?? null,
      docType ?? null,
      from === undefined ? null : parse(isoDate, from),
      to === undefined ? null : parse(isoDate, to),
      signer === undefined ? null : parse(uuid, signer),
      caseId === undefined ? null : parse(uuid, caseId),
    ]);
  }

  /** Người có quyền ký pháp lý của văn phòng (để chọn người ký khi vào sổ quyết định). */
  @Get('signers')
  async signers(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    const rows = await this.read<{ user_id: string; label: string }>(a, 'of_list_signers', [
      officeId,
    ]);
    return { items: rows.map((r) => ({ userId: r.user_id, label: r.label })) };
  }

  /**
   * Vào sổ một quyết định kèm tệp bản đã ký (PDF/JPEG/PNG; DB đòi có chứng cứ). Các trường đi theo query vì thân yêu cầu
   * là chính tệp. Máy chủ tự tính hash và khoá.
   */
  @Post('decision-files')
  @HttpCode(HttpStatus.OK)
  recordDecisionFile(
    @CurrentActor() a: AuthenticatedActor,
    @Query() query: unknown,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: RawBody,
  ) {
    const q = parse(
      z
        .object({
          officeId: uuid,
          branchId: uuid,
          decisionNo: z.string().max(200),
          docType: z.string().max(200),
          title: z.string().max(1000),
          signerUserId: uuid,
          signedOn: isoDate,
        })
        .strict(),
      query,
    );
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/of/decisions/${randomUUID()}.${f.extension}`,
      (key, f) =>
        this.run(a, 'of_decision_record', [
          q.officeId,
          q.branchId,
          q.decisionNo,
          q.docType,
          q.title,
          q.signerUserId,
          q.signedOn,
          null,
          null,
          key,
          f.sha256,
        ]),
    );
  }

  @Post('tt06-forms')
  @HttpCode(HttpStatus.OK)
  registerForm(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({ officeId: uuid, code: z.string(), title: z.string().max(500), ...evidence })
        .strict(),
      body,
    );
    return this.run(a, 'of_tt06_register', [
      b.officeId,
      b.code,
      b.title,
      b.evidenceKey,
      b.evidenceSha256,
    ]);
  }

  @Post('tt06-forms/:code/download')
  @HttpCode(HttpStatus.OK)
  downloadForm(
    @CurrentActor() a: AuthenticatedActor,
    @Param('code') code: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ officeId: uuid }).strict(), body);
    return this.run(a, 'of_tt06_download', [b.officeId, code]);
  }

  @Get('tt06-forms')
  async tt06List(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    const rows = await this.read<{
      code: string;
      version: number;
      title: string;
      registered_at: Date;
    }>(a, 'of_search_tt06', [officeId]);
    return rows.map((r) => ({
      code: r.code,
      version: r.version,
      title: r.title,
      registeredAt: r.registered_at,
    }));
  }

  /** Đăng ký bản mới của một biểu mẫu TT06 kèm tệp (Admin/Trưởng VP). Tiêu đề và mã đi theo query. */
  @Post('tt06-form-files')
  @HttpCode(HttpStatus.OK)
  registerFormFile(
    @CurrentActor() a: AuthenticatedActor,
    @Query() query: unknown,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: RawBody,
  ) {
    const q = parse(
      z.object({ officeId: uuid, code: z.string().max(10), title: z.string().max(500) }).strict(),
      query,
    );
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/of/tt06/${randomUUID()}.${f.extension}`,
      (key, f) => this.run(a, 'of_tt06_register', [q.officeId, q.code, q.title, key, f.sha256]),
    );
  }

  /** Tải bản mới nhất của một biểu mẫu: DB kiểm quyền, audit và trả khoá; máy chủ đọc tệp từ kho. */
  @Get('tt06-forms/:code/file')
  async downloadFormFile(
    @CurrentActor() a: AuthenticatedActor,
    @Param('code') code: string,
    @Query('officeId', ParseUUIDPipe) officeId: string,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
  ) {
    if (!this.store)
      throw new HttpException(
        { code: 'FILE_STORE_NOT_CONFIGURED', label: null },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const reply = await this.run(a, 'of_tt06_download', [officeId, code]);
    const key = reply.label ?? '';
    const bytes = key.startsWith(`t/${a.tenantId}/`) ? await this.store.get(key) : null;
    if (!bytes)
      throw new HttpException({ code: 'FILE_NOT_FOUND', label: null }, HttpStatus.NOT_FOUND);
    const ext = key.split('.').pop() ?? '';
    const type = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';
    res.set({
      'content-type': type,
      'content-disposition': `attachment; filename="tt06-${code.replace(/[^A-Z]/g, '')}.${ext}"`,
      'cache-control': 'private, no-store',
    });
    return new StreamableFile(bytes);
  }

  /** Lịch làm việc của văn phòng: ngày làm việc trong tuần + ngày nghỉ/lễ. Mọi thành viên đọc được. */
  @Get('calendar')
  async calendar(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    return this.loadCalendar(a, officeId);
  }

  private async loadCalendar(a: AuthenticatedActor, officeId: string) {
    const rows = await this.read<{
      kind: string;
      day: string | null;
      label: string | null;
      weekdays: number[] | null;
    }>(a, 'of_search_calendar', [officeId]);
    const weekdays = rows.find((r) => r.kind === 'WEEKDAYS')?.weekdays ?? [1, 2, 3, 4, 5];
    const holidays = rows
      .filter((r) => r.kind === 'HOLIDAY' && r.day !== null)
      .map((r) => ({
        day: r.day as string,
        label: r.label ?? '',
      }));
    return { workingWeekdays: weekdays, holidays };
  }

  @Put('calendar/weekdays')
  @HttpCode(HttpStatus.OK)
  setWeekdays(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
        })
        .strict(),
      body,
    );
    return this.run(a, 'of_set_work_weekdays', [b.officeId, b.weekdays]);
  }

  @Post('calendar/holidays')
  @HttpCode(HttpStatus.OK)
  addHoliday(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z.object({ officeId: uuid, day: isoDate, label: z.string().min(1).max(200) }).strict(),
      body,
    );
    return this.run(a, 'of_add_holiday', [b.officeId, b.day, b.label]);
  }

  @Post('calendar/holidays/remove')
  @HttpCode(HttpStatus.OK)
  removeHoliday(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(z.object({ officeId: uuid, day: isoDate }).strict(), body);
    return this.run(a, 'of_remove_holiday', [b.officeId, b.day]);
  }

  /** Hạn dự kiến sau N ngày làm việc theo lịch của văn phòng (chỉ để nhắc; không đổi trạng thái hồ sơ). */
  @Get('deadlines/compute')
  async computeDeadline(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
    @Query('from') from: string,
    @Query('days') days: string,
  ) {
    const start = parse(isoDate, from);
    const n = parse(z.coerce.number().int().min(0).max(366), days);
    const cal = await this.loadCalendar(a, officeId);
    const due = addWorkingDays(new Date(`${start}T00:00:00+07:00`), n, {
      workingWeekdays: cal.workingWeekdays,
      holidays: cal.holidays.map((h) => h.day),
    });
    return { dueDate: new Date(due.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10) };
  }

  /** Hạn sắp tới/quá hạn để nhắc trong ứng dụng (không tự gửi ra ngoài). */
  @Get('deadlines')
  async deadlines(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
    @Query('withinDays') withinDays?: string,
  ) {
    const d = parse(z.coerce.number().int().min(0).max(90), withinDays ?? '7');
    const until = new Date(Date.now() + d * 24 * 3600 * 1000).toISOString();
    const rows = await this.read<{
      domain: string;
      ref_id: string;
      case_id: string;
      label: string;
      deadline_at: Date;
      status: string;
      overdue: boolean;
    }>(a, 'of_search_deadlines', [officeId, until]);
    return rows.map((r) => ({
      domain: r.domain,
      refId: r.ref_id,
      caseId: r.case_id,
      label: r.label,
      deadlineAt: r.deadline_at,
      status: r.status,
      overdue: r.overdue,
    }));
  }

  /** Cấu hình văn phòng (đọc: mọi thành viên): tên pháp lý, tên hiển thị trên văn bản, quy tắc số Vi bằng, chi nhánh. */
  @Get('settings')
  async settings(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    const [r] = await this.read<{
      office_name: string;
      legal_name: string;
      display_name: string;
      number_rule: string;
      branches: { id: string; name: string }[];
    }>(a, 'of_search_office_settings', [officeId]);
    if (!r) throw new HttpException({ code: 'ROLE_LACKS_PERMISSION', label: null }, 403);
    return {
      officeName: r.office_name,
      legalName: r.legal_name,
      displayName: r.display_name,
      numberRule: r.number_rule,
      branches: r.branches,
    };
  }

  /** Sửa tên pháp lý/tên hiển thị (chỉ Admin). Bỏ trường nào thì giữ nguyên trường đó. */
  @Put('settings')
  @HttpCode(HttpStatus.OK)
  setSettings(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          legalName: z.string().max(300).optional(),
          displayName: z.string().max(300).optional(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'of_set_office_settings', [
      b.officeId,
      b.legalName ?? null,
      b.displayName ?? null,
    ]);
  }

  /** Người nhận bàn giao: các Thừa hành viên của văn phòng (Admin/Trưởng VP/Thư ký/Thừa hành viên xem được). */
  @Get('receivers')
  async receivers(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    const rows = await this.read<{ user_id: string; label: string }>(a, 'of_search_receivers', [
      officeId,
    ]);
    return { items: rows.map((r) => ({ userId: r.user_id, label: r.label })) };
  }

  /** Việc được giao cho chính người gọi, xuyên nghiệp vụ (màn điện thoại ngoài hiện trường). Chỉ đọc. */
  @Get('my-work')
  async myWork(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    const rows = await this.read<{
      domain: string;
      ref_id: string;
      label: string;
      status: string;
      deadline_at: Date | null;
      created_at: Date;
      overdue: boolean;
    }>(a, 'of_search_my_work', [officeId]);
    return {
      items: rows.map((r) => ({
        domain: r.domain,
        refId: r.ref_id,
        label: r.label,
        status: r.status,
        deadlineAt: r.deadline_at,
        createdAt: r.created_at,
        overdue: r.overdue,
      })),
    };
  }

  /** Thông báo nhắc hạn của chính người gọi (sinh lười từ hạn họ được xem; không gửi ra ngoài). */
  @Get('notifications')
  async notifications(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
    @Query('unread') unread?: string,
    @Query('limit') limit?: string,
  ) {
    const lim = parse(z.coerce.number().int().min(1).max(200), limit ?? '50');
    const rows = await this.read<{
      id: string;
      kind: string;
      domain: string;
      ref_id: string;
      case_id: string | null;
      label: string;
      deadline_at: Date;
      created_at: Date;
      read_at: Date | null;
      overdue: boolean;
    }>(a, 'of_search_notifications', [officeId, unread === 'true', lim]);
    const items = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      domain: r.domain,
      refId: r.ref_id,
      caseId: r.case_id,
      label: r.label,
      deadlineAt: r.deadline_at,
      createdAt: r.created_at,
      readAt: r.read_at,
      overdue: r.overdue,
    }));
    return { unreadCount: items.filter((i) => i.readAt === null).length, items };
  }

  /** Đánh dấu đã đọc một thông báo (`id`) hoặc tất cả thông báo chưa đọc của mình (bỏ `id`). */
  @Post('notifications/read')
  @HttpCode(HttpStatus.OK)
  markNotificationsRead(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(z.object({ officeId: uuid, id: uuid.optional() }).strict(), body);
    return this.run(a, 'of_notifications_read', [b.officeId, b.id ?? null]);
  }

  private async loadReport(
    a: AuthenticatedActor,
    officeId: string,
    from: string,
    to: string,
    branchId?: string,
  ) {
    const rows = await this.read<{ domain: string; unit: string; status: string; total: number }>(
      a,
      'of_search_report',
      [
        officeId,
        parse(isoDate, from),
        parse(isoDate, to),
        branchId === undefined || branchId === '' ? null : parse(uuid, branchId),
      ],
    );
    return rows.map((r) => ({ domain: r.domain, unit: r.unit, status: r.status, total: r.total }));
  }

  /** Báo cáo tổng hợp theo kỳ (ngày tạo, giờ Việt Nam). Mỗi dòng là một đơn vị đếm riêng; không có số tiền. */
  @Get('report')
  report(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.loadReport(a, officeId, from, to, branchId);
  }

  /** Báo cáo tổng hợp theo kỳ CHIA THEO Thừa hành viên (`groupBy=thv`) hoặc chi nhánh/địa điểm (`groupBy=branch`). */
  @Get('report/by')
  async reportBy(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') groupBy: string,
    @Query('branchId') branchId?: string,
  ) {
    const g = parse(z.enum(['thv', 'branch']), (groupBy ?? '').toLowerCase());
    const rows = await this.read<{
      group_id: string | null;
      group_label: string;
      domain: string;
      unit: string;
      status: string;
      total: number;
    }>(a, 'of_search_report_by', [
      officeId,
      parse(isoDate, from),
      parse(isoDate, to),
      branchId === undefined || branchId === '' ? null : parse(uuid, branchId),
      g.toUpperCase(),
    ]);
    return rows.map((r) => ({
      groupId: r.group_id,
      groupLabel: r.group_label,
      domain: r.domain,
      unit: r.unit,
      status: r.status,
      total: r.total,
    }));
  }

  /** Xuất báo cáo tổng hợp theo kỳ ra Excel. Cùng phạm vi quyền với `GET report`; không số tiền. */
  @Get('report/export')
  async reportExport(
    @CurrentActor() a: AuthenticatedActor,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
    @Query('officeId', ParseUUIDPipe) officeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('format') format?: string,
  ) {
    const rows = await this.loadReport(a, officeId, from, to, branchId);
    const spec: SheetSpec = {
      name: 'Báo cáo',
      title: `Báo cáo tổng hợp từ ${from} đến ${to}`,
      notice:
        'Bản điện tử hỗ trợ theo dõi, không phải biểu mẫu chính thức. Mỗi dòng là một đơn vị đếm riêng; không có số tiền.',
      columns: ['Nghiệp vụ', 'Đơn vị đếm', 'Trạng thái', 'Số lượng'],
      rows: rows.map((r) => [r.domain, r.unit, r.status, r.total]),
    };
    return this.sendSheet(res, spec, format, `bao-cao-${from}_${to}`);
  }

  /** Danh bạ thành viên văn phòng (chỉ đọc, chỉ Admin). Không trả băm mật khẩu. */
  @Get('members')
  async members(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    const rows = await this.read<{
      user_id: string;
      label: string;
      role: string | null;
      legal_signer: boolean;
      has_login: boolean;
      branches: string[];
    }>(a, 'of_search_members', [officeId]);
    return rows.map((r) => ({
      userId: r.user_id,
      label: r.label,
      role: r.role,
      legalSigner: r.legal_signer,
      hasLogin: r.has_login,
      branches: r.branches,
    }));
  }

  @Get('stock')
  async stock(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    const rows = await this.read<{
      item_id: string;
      name: string;
      unit: string;
      branch_id: string | null;
      branch_name: string | null;
      on_hand: number | null;
      batches: number | null;
    }>(a, 'of_search_stock', [officeId]);
    return rows.map((r) => ({
      itemId: r.item_id,
      name: r.name,
      unit: r.unit,
      branchId: r.branch_id,
      branchName: r.branch_name,
      onHand: r.on_hand,
      batches: r.batches,
    }));
  }

  /** Lịch sử nhập/xuất/kiểm kê vật tư kèm nguồn lô; cùng phạm vi đọc với tồn kho. Không có giá. */
  @Get('movements')
  async movements(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    const q = parse(
      z.object({
        itemId: uuid.optional(),
        branchId: uuid.optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
        limit: z.coerce.number().int().min(1).max(1000).optional(),
      }),
      { ...query, officeId: undefined },
    );
    const rows = await this.read<Record<string, unknown>>(a, 'of_search_movements', [
      officeId,
      q.itemId ?? null,
      q.branchId ?? null,
      q.from ?? null,
      q.to ?? null,
      q.limit ?? null,
    ]);
    return rows.map((r) => ({
      movementId: r.movement_id,
      at: r.at,
      kind: r.kind,
      delta: r.delta,
      purpose: r.purpose,
      actorUserId: r.actor_user_id,
      itemId: r.item_id,
      itemName: r.item_name,
      unit: r.unit,
      branchId: r.branch_id,
      batchId: r.batch_id,
      receiptRef: r.receipt_ref,
      batchReceivedAt: r.batch_received_at,
    }));
  }

  @Get('batches')
  async batches(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    const rows = await this.read<{
      batch_id: string;
      item_name: string;
      branch_id: string;
      receipt_ref: string;
      qty_received: number;
      qty_remaining: number;
      received_at: Date;
    }>(a, 'of_search_batches', [officeId]);
    return rows.map((r) => ({
      batchId: r.batch_id,
      itemName: r.item_name,
      branchId: r.branch_id,
      receiptRef: r.receipt_ref,
      qtyReceived: r.qty_received,
      qtyRemaining: r.qty_remaining,
      receivedAt: r.received_at,
    }));
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  addItem(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z.object({ officeId: uuid, name: z.string().max(300), unit: z.string().max(50) }).strict(),
      body,
    );
    return this.run(a, 'of_item_add', [b.officeId, b.name, b.unit]);
  }

  @Post('items/:id/receipts')
  @HttpCode(HttpStatus.OK)
  receive(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({ branchId: uuid, quantity: z.number().int(), receiptRef: z.string().max(200) })
        .strict(),
      body,
    );
    return this.run(a, 'of_receive', [id, b.branchId, b.quantity, b.receiptRef]);
  }

  @Post('items/:id/issues')
  @HttpCode(HttpStatus.OK)
  issueStock(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({ branchId: uuid, quantity: z.number().int(), purpose: z.string().max(500) })
        .strict(),
      body,
    );
    return this.run(a, 'of_issue', [id, b.branchId, b.quantity, b.purpose]);
  }

  @Post('batches/:id/adjustment')
  @HttpCode(HttpStatus.OK)
  adjust(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ newRemaining: z.number().int(), reason: z.string().max(500) }).strict(),
      body,
    );
    return this.run(a, 'of_adjust', [id, b.newRemaining, b.reason]);
  }

  @Get('stocktakes')
  async stocktakes(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    const rows = await this.read<Record<string, unknown>>(a, 'of_search_stocktakes', [officeId]);
    return rows.map((r) => ({
      id: r.id,
      branchId: r.branch_id,
      branchName: r.branch_name,
      note: r.note,
      status: r.status,
      createdBy: r.created_by,
      createdAt: r.created_at,
      decidedBy: r.decided_by,
      decidedAt: r.decided_at,
      lines: r.lines,
      varianceLines: r.variance_lines,
    }));
  }

  @Get('stocktakes/:id/lines')
  async stocktakeLines(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    const rows = await this.read<Record<string, unknown>>(a, 'of_search_stocktake_lines', [
      officeId,
      id,
    ]);
    return rows.map((r) => ({
      batchId: r.batch_id,
      itemId: r.item_id,
      itemName: r.item_name,
      receiptRef: r.receipt_ref,
      systemQty: r.system_qty,
      countedQty: r.counted_qty,
      diff: r.diff,
      reason: r.reason,
    }));
  }

  @Post('stocktakes')
  @HttpCode(HttpStatus.OK)
  openStocktake(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z.object({ officeId: uuid, branchId: uuid, note: z.string().max(500).nullish() }).strict(),
      body,
    );
    return this.run(a, 'of_stocktake_open', [b.officeId, b.branchId, b.note ?? null]);
  }

  @Post('stocktakes/:id/counts')
  @HttpCode(HttpStatus.OK)
  countStocktake(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          batchId: uuid,
          countedQty: z.number().int(),
          reason: z.string().max(500).nullish(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'of_stocktake_count', [id, b.batchId, b.countedQty, b.reason ?? null]);
  }

  @Post('stocktakes/:id/decision')
  @HttpCode(HttpStatus.OK)
  decideStocktake(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ approve: z.boolean() }).strict(), body);
    return this.run(a, 'of_stocktake_decide', [id, b.approve]);
  }

  @Get('item-categories')
  async itemCategories(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    const rows = await this.read<{ item_id: string; category: string }>(
      a,
      'of_search_item_categories',
      [officeId],
    );
    return rows.map((r) => ({ itemId: r.item_id, category: r.category }));
  }

  @Put('items/:id/category')
  setItemCategory(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ category: z.string().max(100) }).strict(), body);
    return this.run(a, 'of_set_item_category', [id, b.category]);
  }

  @Put('personnel')
  savePersonnel(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          personId: uuid.nullish(),
          branchId: uuid,
          fullName: z.string().max(300),
          gender: z.string(),
          specialty: z.string().max(300).nullish(),
          bailiffDecisionRef: z.string().max(300).nullish(),
          executorDecisionRef: z.string().max(300).nullish(),
          isOfficeHead: z.boolean().optional(),
          isPartner: z.boolean().optional(),
          laborContractRef: z.string().max(300).nullish(),
          insurancePurchased: z.boolean().nullish(),
          insuranceNote: z.string().max(500).nullish(),
          contributing: z.boolean().nullish(),
          contributionNote: z.string().max(500).nullish(),
          note: z.string().max(1000).nullish(),
          workStatus: z.string(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'of_personnel_save', [
      b.officeId,
      b.personId ?? null,
      b.branchId,
      b.fullName,
      b.gender,
      b.specialty ?? null,
      b.bailiffDecisionRef ?? null,
      b.executorDecisionRef ?? null,
      b.isOfficeHead ?? false,
      b.isPartner ?? false,
      b.laborContractRef ?? null,
      b.insurancePurchased ?? null,
      b.insuranceNote ?? null,
      b.contributing ?? null,
      b.contributionNote ?? null,
      b.note ?? null,
      b.workStatus,
    ]);
  }

  @Get('personnel')
  readPersonnel(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    return this.read(a, 'of_s06_read', [officeId]);
  }

  /**
   * Sổ theo dõi Phụ lục I TT 08/2026/TT-BTP: S-01, S-02, S-04, S-05 (S-03 của Sở Tư pháp; S-06 ở `personnel`).
   * Trả danh sách cột đúng thứ tự mẫu và các dòng dựng từ dữ liệu đã có; cột chưa có nguồn là null. Quyền do DB quyết định.
   */
  @Get('ledgers/:code')
  async ledger(
    @CurrentActor() a: AuthenticatedActor,
    @Param('code') code: string,
    @Query('officeId', ParseUUIDPipe) officeId: string,
    @Query('year') year?: string,
    @Query('limit') limit?: string,
  ) {
    const { def, rows } = await this.loadLedger(a, code, officeId, year, limit);
    return {
      code: def.code,
      title: def.title,
      notice: LEDGER_NOTICE,
      columns: def.columns.map((c) => ({ no: c.no, key: c.key, label: c.label })),
      rows,
    };
  }

  /** Xuất sổ ra Excel đúng thứ tự cột mẫu (chỉ các cột của mẫu, không cột truy vết). Cùng phạm vi quyền với `GET ledgers/:code`. */
  @Get('ledgers/:code/export')
  async ledgerExport(
    @CurrentActor() a: AuthenticatedActor,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
    @Param('code') code: string,
    @Query('officeId', ParseUUIDPipe) officeId: string,
    @Query('year') year?: string,
    @Query('limit') limit?: string,
    @Query('format') format?: string,
  ) {
    const { def, rows } = await this.loadLedger(a, code, officeId, year, limit);
    const spec: SheetSpec = {
      name: def.code,
      title: `${def.title} (${def.code})`,
      notice: LEDGER_NOTICE,
      columns: def.columns.map((c) => c.label),
      rows: rows.map((r) =>
        def.columns.map((c) => {
          const v = r[c.key];
          return typeof v === 'string' || typeof v === 'number' ? v : null;
        }),
      ),
    };
    return this.sendSheet(res, spec, format, `so-${def.code.toLowerCase()}`);
  }

  /** `format=pdf` ra PDF khổ A4 ngang; mặc định (hoặc `xlsx`) ra Excel. Giá trị khác bị từ chối. */
  private async sendSheet(
    res: { set(headers: Record<string, string>): unknown },
    spec: SheetSpec,
    format: string | undefined,
    base: string,
  ) {
    if (format !== undefined && format !== 'xlsx' && format !== 'pdf')
      throw new HttpException({ code: 'INVALID_FORMAT', label: null }, 422);
    const pdf = format === 'pdf';
    const buf = pdf ? await buildPdf(spec) : await buildXlsx(spec);
    res.set({
      'Content-Type': pdf ? PDF_MIME : XLSX_MIME,
      'Content-Disposition': `attachment; filename="${base}.${pdf ? 'pdf' : 'xlsx'}"`,
    });
    return new StreamableFile(buf);
  }

  private async loadLedger(
    a: AuthenticatedActor,
    code: string,
    officeId: string,
    year?: string,
    limit?: string,
  ) {
    const def = LEDGER_BY_CODE.get(code.toLowerCase());
    if (!def) throw new HttpException({ code: 'LEDGER_NOT_FOUND', label: null }, 404);
    const y =
      year === undefined || year === ''
        ? null
        : parse(z.coerce.number().int().min(2000).max(2200), year);
    const l = parse(z.coerce.number().int().min(1).max(1000), limit ?? '500');
    const rows = await this.read(a, def.fn, [officeId, y, l]);
    return { def, rows: rows.map((r) => shapeLedgerRow(def, r)) };
  }
}
