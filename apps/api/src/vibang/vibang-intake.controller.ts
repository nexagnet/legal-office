import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  ParseIntPipe,
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
import { statusFor } from './status';
import { VibangRepo, type Op } from './vibang.repo';

const uuid = z.string().uuid();
const text = (max: number) => z.string().max(max);

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

interface CaseRow {
  readonly id: string;
  readonly office_id: string;
  readonly branch_id: string;
  readonly customer_id: string;
  readonly contract_id: string | null;
  readonly status: string;
  readonly title: string;
  readonly description: string;
  readonly responsible_thv_user_id: string | null;
  readonly created_at: Date;
  readonly version: number;
  readonly branch_name: string;
  readonly customer_name: string | null;
  readonly thv_label: string | null;
  readonly number_label: string | null;
  readonly number_allocated_at: Date | null;
  readonly next_step: string | null;
  readonly handover_recipient: string | null;
  readonly handover_on: string | null;
  readonly intake_no: string | null;
  readonly created_by: string | null;
  readonly created_by_label: string | null;
  readonly customer_phone: string | null;
  readonly customer_id_number: string | null;
}
const toCase = (r: CaseRow) => ({
  id: r.id,
  officeId: r.office_id,
  branchId: r.branch_id,
  customerId: r.customer_id,
  contractId: r.contract_id,
  status: r.status,
  title: r.title,
  description: r.description,
  responsibleThvUserId: r.responsible_thv_user_id,
  createdAt: r.created_at,
  version: r.version,
  branchName: r.branch_name,
  customerName: r.customer_name,
  thvLabel: r.thv_label,
  numberLabel: r.number_label,
  numberAllocatedAt: r.number_allocated_at,
  nextStep: r.next_step,
  handoverRecipient: r.handover_recipient,
  handoverOn: r.handover_on,
  intakeNo: r.intake_no,
  createdBy: r.created_by,
  createdByLabel: r.created_by_label,
  customerPhone: r.customer_phone,
  customerIdNumber: r.customer_id_number,
});

/**
 * Tiếp nhận hồ sơ Vi bằng và đọc hồ sơ theo quyền. Quyền (vai, chi nhánh, THV phụ trách) do hàm `vb_*` trong DB quyết định.
 */
@Controller('vibang')
@UseGuards(ActorGuard)
export class VibangIntakeController {
  constructor(
    @Inject(VibangRepo) private readonly repo: VibangRepo,
    @Optional() @Inject(FILE_STORE) private readonly store: FileStore | null,
  ) {}

  private run(actor: AuthenticatedActor, fn: string, args: readonly unknown[]): Promise<Reply> {
    return this.repo
      .call(actor.tenantId, fn, [actor.tenantId, actor.userId, ...args])
      .then(respond);
  }

  @Post('customers')
  @HttpCode(HttpStatus.OK)
  createCustomer(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z.object({ kind: z.enum(['PERSON', 'ORGANIZATION']), externalRef: text(200) }).strict(),
      body,
    );
    return this.run(a, 'vb_create_customer', [b.kind, b.externalRef]);
  }

  @Post('customers/:id/contracts')
  @HttpCode(HttpStatus.OK)
  createContract(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ externalRef: text(200) }).strict(), body);
    return this.run(a, 'vb_create_contract', [id, b.externalRef]);
  }

  @Post('customers/:id/profile')
  @HttpCode(HttpStatus.OK)
  updateCustomer(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          displayName: text(300),
          idNumber: text(100).optional(),
          address: text(500).optional(),
          phone: text(50).optional(),
          taxCode: text(100).optional(),
          representative: text(300).optional(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'vb_update_customer', [
      id,
      b.displayName,
      b.idNumber ?? null,
      b.address ?? null,
      b.phone ?? null,
      b.taxCode ?? null,
      b.representative ?? null,
    ]);
  }

  /** Tải bản scan hợp đồng (PDF/JPEG/PNG). Máy chủ tự tính hash và khoá lưu. */
  @Post('contracts/:id/attachment-files')
  @HttpCode(HttpStatus.OK)
  attachContractFile(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: RawBody,
  ) {
    const q = parse(z.object({ name: text(200).optional() }).strict(), query);
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/vb/contracts/${id}/${randomUUID()}.${f.extension}`,
      (key, f) => this.run(a, 'vb_add_contract_attachment', [id, q.name ?? '', key, f.sha256]),
    );
  }

  /**
   * Thêm phụ lục hợp đồng kèm bản scan đã ký (bắt buộc). Máy chủ lưu tệp và ghi phụ lục trong một giao dịch.
   * Giả định nghiệp vụ ở docs/architecture/contract-addenda.md; không có số tiền kế toán.
   */
  @Post('contracts/:id/addendum-files')
  @HttpCode(HttpStatus.OK)
  addContractAddendum(
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
          kind: z.enum(['EXTEND', 'SCOPE', 'PARTIES', 'OTHER']),
          effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          summary: text(2000),
          name: text(200).optional(),
        })
        .strict(),
      query,
    );
    return recordWithUpload(
      this.store,
      { contentType, contentLength, body: req },
      (f) => `t/${a.tenantId}/vb/contracts/${id}/${randomUUID()}.${f.extension}`,
      (key, f) =>
        this.run(a, 'vb_add_contract_addendum', [
          id,
          q.kind,
          q.summary,
          q.effectiveFrom,
          q.name ?? '',
          key,
          f.sha256,
        ]),
    );
  }

  @Get('contracts/:id/addenda')
  async listContractAddenda(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const rows = await this.repo.rows<{
      id: string;
      seq: number;
      kind: string;
      summary: string;
      effective_from: string;
      attachment_id: string;
      added_at: string;
    }>(a.tenantId, 'vb_list_contract_addenda', [a.tenantId, a.userId, id]);
    return rows.map((r) => ({
      id: Number(r.id),
      seq: r.seq,
      kind: r.kind,
      summary: r.summary,
      effectiveFrom: r.effective_from,
      attachmentId: Number(r.attachment_id),
      addedAt: r.added_at,
    }));
  }

  @Get('contracts/:id/attachments')
  async listContractAttachments(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const rows = await this.repo.rows<{ id: string; name: string; added_at: string }>(
      a.tenantId,
      'vb_list_contract_attachments',
      [a.tenantId, a.userId, id],
    );
    return rows.map((r) => ({ id: Number(r.id), name: r.name, addedAt: r.added_at }));
  }

  @Get('contracts/:id/attachments/:attId')
  async downloadContractAttachment(
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
    const rows = await this.repo.rows<{ id: string; name: string; key: string }>(
      a.tenantId,
      'vb_list_contract_attachments',
      [a.tenantId, a.userId, id],
    );
    const att = rows.find((r) => Number(r.id) === attId);
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

  @Get('contracts/:id/parties')
  async listContractParties(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const rows = await this.repo.rows<Record<string, string | null>>(
      a.tenantId,
      'vb_list_contract_parties',
      [a.tenantId, a.userId, id],
    );
    return rows.map((r) => ({
      customerId: r.customer_id,
      role: r.role,
      displayName: r.display_name,
      externalRef: r.external_ref,
    }));
  }

  @Put('contracts/:id/parties/:customerId')
  @HttpCode(HttpStatus.OK)
  setContractParty(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ role: z.enum(['REPRESENTATIVE', 'BENEFICIARY', 'WITNESS', 'OTHER']) }).strict(),
      body,
    );
    return this.run(a, 'vb_set_contract_party', [id, customerId, b.role]);
  }

  @Post('contracts/:id/parties/:customerId/remove')
  @HttpCode(HttpStatus.OK)
  removeContractParty(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.run(a, 'vb_remove_contract_party', [id, customerId]);
  }

  @Post('contracts/:id')
  @HttpCode(HttpStatus.OK)
  updateContract(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    const b = parse(
      z
        .object({
          serviceKind: z
            .enum(['VI_BANG', 'TONG_DAT', 'XAC_MINH', 'THI_HANH_AN'])
            .nullable()
            .optional(),
          signedOn: day.nullable().optional(),
          validFrom: day.nullable().optional(),
          validTo: day.nullable().optional(),
          status: z.enum(['ACTIVE', 'ENDED']),
          note: text(2000).optional(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'vb_update_contract', [
      id,
      b.serviceKind ?? null,
      b.signedOn ?? null,
      b.validFrom ?? null,
      b.validTo ?? null,
      b.status,
      b.note ?? null,
    ]);
  }

  /** Danh bạ chủ thể (có PII): chỉ vai tiếp nhận; vai khác nhận danh sách rỗng. */
  @Get('customers')
  async listCustomers(@CurrentActor() a: AuthenticatedActor, @Query('q') q?: string) {
    const rows = await this.repo.rows<Record<string, string | null>>(
      a.tenantId,
      'vb_list_customers',
      [a.tenantId, a.userId, q ?? null],
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      externalRef: r.external_ref,
      displayName: r.display_name,
      idNumber: r.id_number,
      address: r.address,
      phone: r.phone,
      taxCode: r.tax_code,
      representative: r.representative,
    }));
  }

  /** Các vi bằng đã cấp số của một khách (danh bạ khách là PII: chỉ vai tiếp nhận; hồ sơ vẫn qua cổng xem). */
  @Get('customers/:id/numbers')
  async customerNumbers(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const rows = await this.repo.rows<{
      case_id: string;
      number_label: string;
      allocated_at: Date;
      case_status: string;
      title: string;
      branch_id: string;
      branch_name: string | null;
    }>(a.tenantId, 'vb_list_customer_numbers', [a.tenantId, a.userId, id]);
    return {
      total: rows.length,
      items: rows.map((r) => ({
        caseId: r.case_id,
        numberLabel: r.number_label,
        allocatedAt: r.allocated_at,
        status: r.case_status,
        title: r.title,
        branchId: r.branch_id,
        branchName: r.branch_name,
      })),
    };
  }

  @Get('contracts')
  async listContracts(
    @CurrentActor() a: AuthenticatedActor,
    @Query('customerId') customerId?: string,
  ) {
    const cust = customerId === undefined || customerId === '' ? null : parse(uuid, customerId);
    const rows = await this.repo.rows<Record<string, string | null>>(
      a.tenantId,
      'vb_list_contracts',
      [a.tenantId, a.userId, cust],
    );
    return rows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      externalRef: r.external_ref,
      serviceKind: r.service_kind,
      signedOn: r.signed_on,
      validFrom: r.valid_from,
      validTo: r.valid_to,
      status: r.status,
      note: r.note,
    }));
  }

  @Post('cases')
  @HttpCode(HttpStatus.OK)
  createCase(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          branchId: uuid,
          customerId: uuid,
          contractId: uuid.nullable().optional(),
          title: text(300),
          description: text(5000).optional(),
        })
        .strict(),
      body,
    );
    return this.run(a, 'vb_create_case', [
      b.officeId,
      b.branchId,
      b.customerId,
      b.contractId ?? null,
      b.title,
      b.description ?? '',
    ]);
  }

  @Put('cases/:id/responsible-thv')
  assignThv(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ thvUserId: uuid, reason: text(2000).optional() }).strict(), body);
    return this.run(a, 'vb_assign_thv', [id, b.thvUserId, b.reason ?? null]);
  }

  @Put('cases/:id/details')
  editDetails(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ title: text(300).optional(), description: text(5000).optional() }).strict(),
      body,
    );
    return this.run(a, 'vb_edit_case', [id, b.title ?? null, b.description ?? null]);
  }

  @Post('cases/:id/change-requests')
  @HttpCode(HttpStatus.OK)
  requestChange(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({ field: z.enum(['title', 'description']), value: text(5000), reason: text(2000) })
        .strict(),
      body,
    );
    return this.run(a, 'vb_request_change', [id, b.field, b.value, b.reason]);
  }

  @Post('change-requests/:id/decision')
  @HttpCode(HttpStatus.OK)
  decideChange(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ accept: z.boolean() }).strict(), body);
    return this.run(a, 'vb_decide_change', [id, b.accept]);
  }

  @Post('cases/:id/cancellation')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ reason: text(2000) }).strict(), body);
    return this.run(a, 'vb_cancel_case', [id, b.reason]);
  }

  @Post('cases/:id/rejection')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          clause: z.number().int().min(1).max(8),
          basis: text(2000).optional(),
          reason: text(2000),
        })
        .strict(),
      body,
    );
    return this.run(a, 'vb_reject_case', [id, b.clause, b.basis ?? '', b.reason]);
  }

  @Post('cases/:id/copies')
  @HttpCode(HttpStatus.OK)
  issueCopy(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          kind: z.enum(['AUTHORITY', 'PARTICIPANT']),
          requester: text(500),
          basis: text(2000),
          copies: z.number().int().min(1).max(50),
          receivedBy: text(500),
        })
        .strict(),
      body,
    );
    return this.run(a, 'vb_issue_copy', [id, b.kind, b.requester, b.basis, b.copies, b.receivedBy]);
  }

  @Get('cases/:id/change-requests')
  async changes(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.repo.rows<{
      id: string;
      case_id: string;
      requested_by: string;
      reason: string;
      before: unknown;
      after: unknown;
      status: string;
      created_at: Date;
      decided_by: string | null;
      decided_at: Date | null;
    }>(a.tenantId, 'vb_list_changes', [a.tenantId, a.userId, id]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        caseId: r.case_id,
        requestedBy: r.requested_by,
        reason: r.reason,
        before: r.before,
        after: r.after,
        status: r.status,
        createdAt: r.created_at,
        decidedBy: r.decided_by,
        decidedAt: r.decided_at,
      })),
    };
  }

  @Get('cases/:id/progress')
  async progress(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.repo.rows<{
      misa_status: string | null;
      misa_revoke_status: string | null;
      number_label: string | null;
      signed_at: Date | null;
      stamped_at: Date | null;
      has_final_scan: boolean;
    }>(a.tenantId, 'vb_case_progress', [a.tenantId, a.userId, id]);
    if (!rows[0]) throw new NotFoundException({ code: 'CASE_NOT_FOUND', label: null });
    const r = rows[0];
    return {
      misaStatus: r.misa_status ?? 'NOT_CONFIRMED',
      misaRevokeStatus: r.misa_revoke_status ?? 'NONE',
      numberLabel: r.number_label,
      signedAt: r.signed_at,
      stampedAt: r.stamped_at,
      hasFinalScan: r.has_final_scan,
    };
  }

  @Get('thv')
  async thvList(@CurrentActor() a: AuthenticatedActor) {
    const rows = await this.repo.rows<{ user_id: string; office_id: string; label: string }>(
      a.tenantId,
      'vb_list_thv',
      [a.tenantId, a.userId],
    );
    return {
      items: rows.map((r) => ({ userId: r.user_id, officeId: r.office_id, label: r.label })),
    };
  }

  @Get('cases')
  async list(@CurrentActor() a: AuthenticatedActor, @Query('limit') limit?: string) {
    const n = limit === undefined ? 50 : Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > 200) throw new BadRequestException('limit: 1-200');
    const rows = await this.repo.rows<CaseRow>(a.tenantId, 'vb_list_case_view', [
      a.tenantId,
      a.userId,
      null,
      n,
    ]);
    return { items: rows.map(toCase) };
  }

  @Get('cases/:id')
  async get(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.repo.rows<CaseRow>(a.tenantId, 'vb_list_case_view', [
      a.tenantId,
      a.userId,
      id,
      1,
    ]);
    // Không phân biệt "không tồn tại" và "không được xem" để không lộ hồ sơ của người khác.
    if (!rows[0]) throw new NotFoundException({ code: 'CASE_NOT_FOUND', label: null });
    return toCase(rows[0]);
  }
}
