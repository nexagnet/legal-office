import type { AuditEvent, AuditSink } from '../audit/audit';
import type { Actor, Decision, Role } from '../authz/types';
import { decideCaseAction, decideCreate, type CaseAction, type CaseScope } from './policy';
import {
  INTERNAL_FIELDS,
  type CaseStatus,
  type ChangeRequest,
  type CustomerKind,
  type InternalFields,
  type Proof,
  type ViBangCase,
} from './types';
import { isWithinEditWindow } from './window';

export type CaseErrorCode =
  | 'DENIED'
  | 'VERSION_CONFLICT'
  | 'CASE_FINAL'
  | 'EMPTY_PATCH'
  | 'NOT_INTERNAL_FIELD'
  | 'EDIT_WINDOW_CLOSED'
  | 'EDIT_WINDOW_STILL_OPEN'
  | 'REASON_REQUIRED'
  | 'INVALID_ASSIGNEE'
  | 'INVALID_TRANSITION'
  | 'RESPONSIBLE_THV_REQUIRED'
  | 'MISSING_PROOF'
  | 'CHANGE_REQUEST_NOT_PENDING';

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: CaseErrorCode; readonly decision?: Decision };

export interface Ctx {
  readonly sink: AuditSink;
  readonly now: () => Date;
}

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (code: CaseErrorCode, decision?: Decision): Result<never> => ({
  ok: false,
  code,
  decision,
});

const TERMINAL: readonly CaseStatus[] = ['RETURNED', 'CANCELLED'];

async function audit(
  ctx: Ctx,
  actor: Actor,
  action: string,
  scope: CaseScope,
  outcome: AuditEvent['outcome'],
  reason: string,
): Promise<void> {
  await ctx.sink.record({
    at: ctx.now().toISOString(),
    tenantId: actor.tenantId,
    actorId: actor.userId,
    action: `vibang.${action}`,
    outcome,
    reason,
    officeId: scope.officeId,
    branchId: scope.branchId,
  });
}

/** Chặn bằng chính sách rồi ghi audit cho mọi kết quả, kể cả từ chối. */
async function guard(
  ctx: Ctx,
  actor: Actor,
  action: CaseAction,
  c: ViBangCase,
): Promise<Result<void>> {
  const decision = decideCaseAction(actor, action, c);
  if (!decision.allow) {
    await audit(ctx, actor, action, c, 'deny', decision.reason);
    return fail('DENIED', decision);
  }
  return ok(undefined);
}

async function reject(
  ctx: Ctx,
  actor: Actor,
  action: string,
  c: CaseScope,
  code: CaseErrorCode,
): Promise<Result<never>> {
  await audit(ctx, actor, action, c, 'deny', code);
  return fail(code);
}

const commit = async (
  ctx: Ctx,
  actor: Actor,
  action: string,
  next: ViBangCase,
): Promise<Result<ViBangCase>> => {
  const stored = { ...next, version: next.version + 1 };
  await audit(ctx, actor, action, stored, 'allow', 'ALLOWED');
  return ok(stored);
};

export interface CreateInput {
  readonly id: string;
  readonly scope: CaseScope;
  readonly customerKind: CustomerKind;
  readonly customerId: string;
  readonly contractId: string | null;
  readonly fields: InternalFields;
}

export async function createCase(
  ctx: Ctx,
  actor: Actor,
  input: CreateInput,
): Promise<Result<ViBangCase>> {
  const decision = decideCreate(actor, input.scope);
  if (!decision.allow) {
    await audit(ctx, actor, 'create', input.scope, 'deny', decision.reason);
    return fail('DENIED', decision);
  }
  const created: ViBangCase = {
    ...input.scope,
    id: input.id,
    customerKind: input.customerKind,
    customerId: input.customerId,
    contractId: input.contractId,
    status: 'INTAKE',
    responsibleThvId: null,
    fields: input.fields,
    proofs: [],
    cancelReason: null,
    createdAt: ctx.now().toISOString(),
    version: 1,
  };
  await audit(ctx, actor, 'create', created, 'allow', 'ALLOWED');
  return ok(created);
}

export interface Assignee {
  readonly userId: string;
  readonly role: Role;
  readonly tenantId: string;
  readonly officeId: string;
}

/** Chỉ Admin gán, đúng một THV chịu trách nhiệm; cho phép gán lại khi hồ sơ chưa qua bước ký. */
export async function assignResponsibleThv(
  ctx: Ctx,
  actor: Actor,
  c: ViBangCase,
  assignee: Assignee,
  expectedVersion: number,
): Promise<Result<ViBangCase>> {
  const guarded = await guard(ctx, actor, 'assign', c);
  if (!guarded.ok) return guarded;
  if (c.version !== expectedVersion) return reject(ctx, actor, 'assign', c, 'VERSION_CONFLICT');
  if (c.status !== 'INTAKE' && c.status !== 'ASSIGNED')
    return reject(ctx, actor, 'assign', c, 'INVALID_TRANSITION');
  if (
    assignee.role !== 'THV' ||
    assignee.tenantId !== c.tenantId ||
    assignee.officeId !== c.officeId
  ) {
    return reject(ctx, actor, 'assign', c, 'INVALID_ASSIGNEE');
  }
  return commit(ctx, actor, 'assign', {
    ...c,
    responsibleThvId: assignee.userId,
    status: 'ASSIGNED',
  });
}

const pickInternal = (patch: Partial<Record<string, string>>): Partial<InternalFields> | null => {
  const keys = Object.keys(patch);
  if (keys.length === 0) return {};
  if (!keys.every((k) => (INTERNAL_FIELDS as readonly string[]).includes(k))) return null;
  return patch as Partial<InternalFields>;
};

const snapshot = (c: ViBangCase, patch: Partial<InternalFields>): Partial<InternalFields> =>
  Object.fromEntries(Object.keys(patch).map((k) => [k, c.fields[k as keyof InternalFields]]));

/** Sửa trực tiếp trường nội bộ, chỉ trong 48 giờ đầu. Sau đó phải qua Change Request. */
export async function editInternalFields(
  ctx: Ctx,
  actor: Actor,
  c: ViBangCase,
  patch: Partial<Record<string, string>>,
  expectedVersion: number,
): Promise<Result<ViBangCase>> {
  const guarded = await guard(ctx, actor, 'edit_internal', c);
  if (!guarded.ok) return guarded;
  if (TERMINAL.includes(c.status)) return reject(ctx, actor, 'edit_internal', c, 'CASE_FINAL');
  if (c.version !== expectedVersion)
    return reject(ctx, actor, 'edit_internal', c, 'VERSION_CONFLICT');
  const internal = pickInternal(patch);
  if (internal === null) return reject(ctx, actor, 'edit_internal', c, 'NOT_INTERNAL_FIELD');
  if (Object.keys(internal).length === 0)
    return reject(ctx, actor, 'edit_internal', c, 'EMPTY_PATCH');
  if (!isWithinEditWindow(c.createdAt, ctx.now()))
    return reject(ctx, actor, 'edit_internal', c, 'EDIT_WINDOW_CLOSED');
  return commit(ctx, actor, 'edit_internal', { ...c, fields: { ...c.fields, ...internal } });
}

/** Sau 48 giờ: lập Change Request (trước/sau/lý do). Nội dung pháp lý cuối đi đường N-11, không qua đây. */
export async function requestChange(
  ctx: Ctx,
  actor: Actor,
  c: ViBangCase,
  patch: Partial<Record<string, string>>,
  reason: string,
  requestId: string,
): Promise<Result<ChangeRequest>> {
  const guarded = await guard(ctx, actor, 'request_change', c);
  if (!guarded.ok) return guarded;
  if (TERMINAL.includes(c.status)) return reject(ctx, actor, 'request_change', c, 'CASE_FINAL');
  if (reason.trim() === '') return reject(ctx, actor, 'request_change', c, 'REASON_REQUIRED');
  const internal = pickInternal(patch);
  if (internal === null) return reject(ctx, actor, 'request_change', c, 'NOT_INTERNAL_FIELD');
  if (Object.keys(internal).length === 0)
    return reject(ctx, actor, 'request_change', c, 'EMPTY_PATCH');
  if (isWithinEditWindow(c.createdAt, ctx.now())) {
    return reject(ctx, actor, 'request_change', c, 'EDIT_WINDOW_STILL_OPEN');
  }
  const request: ChangeRequest = {
    id: requestId,
    tenantId: c.tenantId,
    caseId: c.id,
    requestedBy: actor.userId,
    reason,
    before: snapshot(c, internal),
    after: internal,
    status: 'PENDING',
    createdAt: ctx.now().toISOString(),
    decidedBy: null,
    decidedAt: null,
  };
  await audit(ctx, actor, 'request_change', c, 'allow', 'ALLOWED');
  return ok(request);
}

/** Chỉ Admin duyệt/từ chối. Duyệt thì áp dụng `after` lên hồ sơ (kiểm tra khoá lạc quan). */
export async function decideChange(
  ctx: Ctx,
  actor: Actor,
  c: ViBangCase,
  request: ChangeRequest,
  approve: boolean,
  expectedVersion: number,
): Promise<Result<{ readonly case: ViBangCase; readonly request: ChangeRequest }>> {
  const guarded = await guard(ctx, actor, 'decide_change', c);
  if (!guarded.ok) return guarded;
  if (request.caseId !== c.id || request.tenantId !== c.tenantId || request.status !== 'PENDING') {
    return reject(ctx, actor, 'decide_change', c, 'CHANGE_REQUEST_NOT_PENDING');
  }
  if (TERMINAL.includes(c.status)) return reject(ctx, actor, 'decide_change', c, 'CASE_FINAL');
  if (c.version !== expectedVersion)
    return reject(ctx, actor, 'decide_change', c, 'VERSION_CONFLICT');
  const decided: ChangeRequest = {
    ...request,
    status: approve ? 'APPROVED' : 'REJECTED',
    decidedBy: actor.userId,
    decidedAt: ctx.now().toISOString(),
  };
  const next = approve ? { ...c, fields: { ...c.fields, ...request.after } } : c;
  const stored = approve ? await commit(ctx, actor, 'decide_change', next) : ok(c);
  if (!approve) await audit(ctx, actor, 'decide_change', c, 'allow', 'REJECTED');
  if (!stored.ok) return stored;
  return ok({ case: stored.value, request: decided });
}

/** Chuyển trạng thái được bảo vệ. Bằng chứng (#7/#8) phải có sẵn; không bước nào được bỏ qua. */
interface Rule {
  readonly from: readonly CaseStatus[];
  readonly roles: readonly Role[];
  readonly proofs: readonly Proof[];
}
const RULES: Readonly<Partial<Record<CaseStatus, Rule>>> = {
  SIGNED: { from: ['ASSIGNED'], roles: ['THV'], proofs: ['NUMBER_ALLOCATED'] },
  STAMPED: { from: ['SIGNED'], roles: ['VAN_THU'], proofs: [] },
  RETURNED: {
    from: ['STAMPED'],
    roles: ['VAN_THU', 'THV'],
    proofs: ['MISA_CONFIRMED_FULL', 'FINAL_SCAN_WITH_SIGNATURE_AND_STAMP'],
  },
  CANCELLED: { from: ['INTAKE', 'ASSIGNED', 'SIGNED', 'STAMPED'], roles: ['ADMIN'], proofs: [] },
};

export async function transitionCase(
  ctx: Ctx,
  actor: Actor,
  c: ViBangCase,
  to: CaseStatus,
  expectedVersion: number,
  reason?: string,
): Promise<Result<ViBangCase>> {
  const guarded = await guard(ctx, actor, 'transition', c);
  if (!guarded.ok) return guarded;
  const rule = RULES[to];
  if (!rule) return reject(ctx, actor, 'transition', c, 'INVALID_TRANSITION'); // INTAKE/ASSIGNED không phải đích hợp lệ
  if (TERMINAL.includes(c.status)) return reject(ctx, actor, 'transition', c, 'CASE_FINAL');
  if (c.version !== expectedVersion) return reject(ctx, actor, 'transition', c, 'VERSION_CONFLICT');
  if (!rule.from.includes(c.status))
    return reject(ctx, actor, 'transition', c, 'INVALID_TRANSITION');
  if (!rule.roles.includes(actor.role)) {
    await audit(ctx, actor, 'transition', c, 'deny', 'ROLE_LACKS_PERMISSION');
    return fail('DENIED', { allow: false, reason: 'ROLE_LACKS_PERMISSION' });
  }
  if (to !== 'CANCELLED' && c.responsibleThvId === null) {
    return reject(ctx, actor, 'transition', c, 'RESPONSIBLE_THV_REQUIRED');
  }
  if (!rule.proofs.every((p) => c.proofs.includes(p)))
    return reject(ctx, actor, 'transition', c, 'MISSING_PROOF');
  if (to === 'CANCELLED') {
    if (!reason || reason.trim() === '')
      return reject(ctx, actor, 'transition', c, 'REASON_REQUIRED');
    return commit(ctx, actor, 'transition', { ...c, status: to, cancelReason: reason });
  }
  return commit(ctx, actor, 'transition', { ...c, status: to });
}

/** Ghi nhận bằng chứng do lát #7/#8 cung cấp (ở đây chỉ là bộ thêm bất biến, không phải nguồn sự thật). */
export const withProof = (c: ViBangCase, proof: Proof): ViBangCase =>
  c.proofs.includes(proof) ? c : { ...c, proofs: [...c.proofs, proof] };
