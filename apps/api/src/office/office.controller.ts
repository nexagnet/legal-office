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
import { recordWithUpload } from '../storage/evidence';
import { FILE_STORE, type FileStore } from '../storage/file-store';
import type { RawBody } from '../storage/upload';
import { statusFor } from '../vibang/status';
import { VibangRepo, type Op } from '../vibang/vibang.repo';

const uuid = z.string().uuid();

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
          refNo: z.string().max(200),
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
        this.run(a, 'of_corr_issue', [id, q.refNo, q.issuedOn, q.sendMethod, key, f.sha256]),
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
          refNo: z.string().max(200),
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
      b.refNo,
      b.issuedOn,
      b.sendMethod,
      b.proofKey ?? null,
      b.proofSha256 ?? null,
    ]);
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

  /** Báo cáo tổng hợp theo kỳ (ngày tạo, giờ Việt Nam). Mỗi dòng là một đơn vị đếm riêng; không có số tiền. */
  @Get('report')
  async report(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
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
}
