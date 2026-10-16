import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
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
});

/**
 * Tiếp nhận hồ sơ Vi bằng và đọc hồ sơ theo quyền. Quyền (vai, chi nhánh, THV phụ trách) do hàm `vb_*` trong DB quyết định.
 */
@Controller('vibang')
@UseGuards(ActorGuard)
export class VibangIntakeController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

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
    const rows = await this.repo.rows<CaseRow>(a.tenantId, 'vb_list_cases', [
      a.tenantId,
      a.userId,
      null,
      n,
    ]);
    return { items: rows.map(toCase) };
  }

  @Get('cases/:id')
  async get(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.repo.rows<CaseRow>(a.tenantId, 'vb_list_cases', [
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
