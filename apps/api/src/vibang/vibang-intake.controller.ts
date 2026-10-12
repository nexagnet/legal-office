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
