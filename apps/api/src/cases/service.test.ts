import { describe, expect, it } from 'vitest';
import { InMemoryAuditSink } from '../audit/audit';
import type { Actor, Role } from '../authz/types';
import {
  assignResponsibleThv,
  createCase,
  decideChange,
  editInternalFields,
  requestChange,
  transitionCase,
  withProof,
  type Ctx,
} from './service';
import type { ViBangCase } from './types';
import { EDIT_WINDOW_MS, isWithinEditWindow } from './window';

const T0 = new Date('2026-10-10T08:00:00.000Z'); // thứ Bảy: cửa sổ vẫn tính liên tục
const at = (ms: number) => new Date(T0.getTime() + ms);

const actor = (role: Role, over: Partial<Actor> = {}): Actor => ({
  userId: `${role.toLowerCase()}-1`,
  tenantId: 'tenant-a',
  officeId: 'office-1',
  role,
  branchIds: ['branch-1'],
  legalSigner: false,
  ...over,
});

const harness = (now: Date = T0) => {
  const sink = new InMemoryAuditSink();
  const ctx: Ctx = { sink, now: () => now };
  return { sink, ctx, at: (ms: number): Ctx => ({ sink, now: () => at(ms) }) };
};

const baseCase = async (ctx: Ctx, creator = actor('THU_KY')): Promise<ViBangCase> => {
  const r = await createCase(ctx, creator, {
    id: 'case-1',
    scope: { tenantId: 'tenant-a', officeId: 'office-1', branchId: 'branch-1' },
    customerKind: 'PERSON',
    customerId: 'cust-1',
    contractId: null,
    fields: { title: 'Lập vi bằng A', description: 'mô tả', contactNote: '' },
  });
  if (!r.ok) throw new Error('setup failed');
  return r.value;
};
const assignee = {
  userId: 'thv-1',
  role: 'THV' as Role,
  tenantId: 'tenant-a',
  officeId: 'office-1',
};

describe('48h edit window', () => {
  it('is inclusive of 47:59:59 and closed at exactly 48:00:00, across weekends', () => {
    const created = T0.toISOString();
    expect(isWithinEditWindow(created, at(EDIT_WINDOW_MS - 1000))).toBe(true);
    expect(isWithinEditWindow(created, at(EDIT_WINDOW_MS - 1))).toBe(true);
    expect(isWithinEditWindow(created, at(EDIT_WINDOW_MS))).toBe(false);
    expect(isWithinEditWindow('not-a-date', T0)).toBe(false);
  });
});

describe('create', () => {
  it.each(['ADMIN', 'THV', 'THU_KY', 'VAN_THU'] as Role[])('lets %s create', async (role) => {
    const { ctx } = harness();
    const r = await createCase(ctx, actor(role), {
      id: 'c',
      scope: { tenantId: 'tenant-a', officeId: 'office-1', branchId: 'branch-1' },
      customerKind: 'ORGANIZATION',
      customerId: 'cust',
      contractId: 'contract-1',
      fields: { title: 't', description: 'd', contactNote: '' },
    });
    expect(r.ok).toBe(true);
  });

  it('denies Kế toán, other tenants and ungranted branches for branch-bound roles', async () => {
    const { ctx, sink } = harness();
    const scope = { tenantId: 'tenant-a', officeId: 'office-1', branchId: 'branch-9' };
    const input = {
      id: 'c',
      scope,
      customerKind: 'PERSON' as const,
      customerId: 'x',
      contractId: null,
      fields: { title: 't', description: '', contactNote: '' },
    };
    expect((await createCase(ctx, actor('KE_TOAN'), input)).ok).toBe(false);
    expect(await createCase(ctx, actor('VAN_THU'), input)).toMatchObject({
      ok: false,
      decision: { reason: 'BRANCH_NOT_GRANTED' },
    });
    expect(await createCase(ctx, actor('THU_KY', { tenantId: 'tenant-b' }), input)).toMatchObject({
      ok: false,
      decision: { reason: 'TENANT_MISMATCH' },
    });
    expect(sink.all().every((e) => e.outcome === 'deny')).toBe(true);
  });
});

describe('assignment', () => {
  it('only Admin assigns, exactly one responsible THV', async () => {
    const { ctx } = harness();
    const c = await baseCase(ctx);
    for (const role of ['THV', 'THU_KY', 'VAN_THU', 'TRUONG_VP', 'KE_TOAN'] as Role[]) {
      const r = await assignResponsibleThv(ctx, actor(role), c, assignee, 1);
      expect(r).toMatchObject({ ok: false, decision: { reason: 'ADMIN_ONLY' } });
    }
    const r = await assignResponsibleThv(ctx, actor('ADMIN'), c, assignee, 1);
    expect(r).toMatchObject({
      ok: true,
      value: { responsibleThvId: 'thv-1', status: 'ASSIGNED', version: 2 },
    });
  });

  it('rejects assignees that are not THV of the same tenant and office', async () => {
    const { ctx } = harness();
    const c = await baseCase(ctx);
    for (const bad of [
      { ...assignee, role: 'THU_KY' as Role },
      { ...assignee, tenantId: 'tenant-b' },
      { ...assignee, officeId: 'office-2' },
    ]) {
      expect(await assignResponsibleThv(ctx, actor('ADMIN'), c, bad, 1)).toMatchObject({
        ok: false,
        code: 'INVALID_ASSIGNEE',
      });
    }
  });

  it('keeps responsible-THV steps blocked until assigned', async () => {
    const { ctx } = harness();
    const c = await baseCase(ctx);
    const r = await transitionCase(ctx, actor('ADMIN'), c, 'SIGNED', 1);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' });
  });
});

describe('THV scope', () => {
  it('lets any THV view across branches but act only on assigned cases', async () => {
    const { ctx } = harness();
    const assigned = (await assignResponsibleThv(
      ctx,
      actor('ADMIN'),
      await baseCase(ctx),
      assignee,
      1,
    )) as { ok: true; value: ViBangCase };
    const other = actor('THV', { userId: 'thv-2', branchIds: [] });
    const { decideCaseAction } = await import('./policy');
    expect(decideCaseAction(other, 'view', assigned.value).allow).toBe(true);
    for (const op of ['edit_internal', 'request_change', 'transition'] as const) {
      expect(decideCaseAction(other, op, assigned.value)).toEqual({
        allow: false,
        reason: 'NOT_RESPONSIBLE_THV',
      });
    }
    const mine = actor('THV', { userId: 'thv-1' });
    expect(decideCaseAction(mine, 'edit_internal', assigned.value).allow).toBe(true);
  });

  it('denies other tenants and ungranted branches for branch-bound roles', async () => {
    const { ctx } = harness();
    const c = await baseCase(ctx);
    const { decideCaseAction } = await import('./policy');
    expect(decideCaseAction(actor('THU_KY', { tenantId: 'tenant-b' }), 'view', c).reason).toBe(
      'TENANT_MISMATCH',
    );
    expect(decideCaseAction(actor('VAN_THU', { branchIds: [] }), 'view', c).reason).toBe(
      'BRANCH_NOT_GRANTED',
    );
    expect(decideCaseAction(actor('KE_TOAN', { branchIds: [] }), 'view', c).reason).toBe(
      'BRANCH_NOT_GRANTED',
    );
    expect(decideCaseAction(actor('KE_TOAN'), 'view', c).allow).toBe(true);
    expect(decideCaseAction(actor('KE_TOAN'), 'edit_internal', c).reason).toBe(
      'ROLE_LACKS_PERMISSION',
    );
  });
});

describe('edit window and change requests', () => {
  it('allows direct edits at 47:59:59 and refuses them at 48:00:00', async () => {
    const h = harness();
    const c = await baseCase(h.ctx);
    const early = await editInternalFields(
      h.at(EDIT_WINDOW_MS - 1000),
      actor('THU_KY'),
      c,
      { title: 'Mới' },
      1,
    );
    expect(early).toMatchObject({ ok: true, value: { fields: { title: 'Mới' }, version: 2 } });
    const late = await editInternalFields(
      h.at(EDIT_WINDOW_MS),
      actor('THU_KY'),
      c,
      { title: 'Muộn' },
      1,
    );
    expect(late).toMatchObject({ ok: false, code: 'EDIT_WINDOW_CLOSED' });
  });

  it('refuses non-internal fields (legal final content goes through N-11, never an ordinary edit)', async () => {
    const h = harness();
    const c = await baseCase(h.ctx);
    expect(
      await editInternalFields(h.ctx, actor('THU_KY'), c, { number: '9/2026/VB-THV' }, 1),
    ).toMatchObject({ ok: false, code: 'NOT_INTERNAL_FIELD' });
    const lateCtx = h.at(EDIT_WINDOW_MS + 1);
    expect(
      await requestChange(lateCtx, actor('THU_KY'), c, { signedContent: 'x' }, 'sửa', 'cr-1'),
    ).toMatchObject({ ok: false, code: 'NOT_INTERNAL_FIELD' });
  });

  it('detects optimistic-concurrency conflicts', async () => {
    const h = harness();
    const c = await baseCase(h.ctx);
    expect(await editInternalFields(h.ctx, actor('THU_KY'), c, { title: 'X' }, 7)).toMatchObject({
      ok: false,
      code: 'VERSION_CONFLICT',
    });
  });

  it('after 48h requires an Admin-approved Change Request with before/after/reason', async () => {
    const h = harness();
    const c = await baseCase(h.ctx);
    const late = h.at(EDIT_WINDOW_MS);
    expect(
      await requestChange(h.at(60_000), actor('THU_KY'), c, { title: 'X' }, 'lý do', 'cr-1'),
    ).toMatchObject({ ok: false, code: 'EDIT_WINDOW_STILL_OPEN' });
    expect(
      await requestChange(late, actor('THU_KY'), c, { title: 'X' }, '  ', 'cr-1'),
    ).toMatchObject({ ok: false, code: 'REASON_REQUIRED' });
    const req = await requestChange(
      late,
      actor('THU_KY'),
      c,
      { title: 'Sửa sau' },
      'khách đổi nội dung',
      'cr-1',
    );
    expect(req).toMatchObject({
      ok: true,
      value: {
        status: 'PENDING',
        before: { title: 'Lập vi bằng A' },
        after: { title: 'Sửa sau' },
        reason: 'khách đổi nội dung',
        requestedBy: 'thu_ky-1',
      },
    });
    if (!req.ok) return;
    // Không phải Admin thì không duyệt được.
    for (const role of ['TRUONG_VP', 'THV', 'THU_KY'] as Role[]) {
      expect(await decideChange(late, actor(role), c, req.value, true, 1)).toMatchObject({
        ok: false,
        decision: { reason: 'ADMIN_ONLY' },
      });
    }
    const approved = await decideChange(late, actor('ADMIN'), c, req.value, true, 1);
    expect(approved).toMatchObject({
      ok: true,
      value: {
        case: { fields: { title: 'Sửa sau' }, version: 2 },
        request: { status: 'APPROVED', decidedBy: 'admin-1' },
      },
    });
    const rejected = await decideChange(late, actor('ADMIN'), c, req.value, false, 1);
    expect(rejected).toMatchObject({
      ok: true,
      value: {
        case: { fields: { title: 'Lập vi bằng A' }, version: 1 },
        request: { status: 'REJECTED' },
      },
    });
    if (approved.ok) {
      expect(
        await decideChange(late, actor('ADMIN'), c, approved.value.request, true, 1),
      ).toMatchObject({ ok: false, code: 'CHANGE_REQUEST_NOT_PENDING' });
    }
    expect(await decideChange(late, actor('ADMIN'), c, req.value, true, 5)).toMatchObject({
      ok: false,
      code: 'VERSION_CONFLICT',
    });
  });
});

describe('lifecycle', () => {
  const ready = async (h: ReturnType<typeof harness>) => {
    const created = await baseCase(h.ctx);
    const assigned = await assignResponsibleThv(h.ctx, actor('ADMIN'), created, assignee, 1);
    if (!assigned.ok) throw new Error('setup');
    return assigned.value; // version 2
  };

  it('cannot skip required legal proofs', async () => {
    const h = harness();
    const c = await ready(h);
    const thv = actor('THV', { userId: 'thv-1' });
    expect(await transitionCase(h.ctx, thv, c, 'SIGNED', 2)).toMatchObject({
      ok: false,
      code: 'MISSING_PROOF',
    });
    expect(await transitionCase(h.ctx, thv, c, 'STAMPED', 2)).toMatchObject({
      ok: false,
      code: 'INVALID_TRANSITION',
    });
    expect(await transitionCase(h.ctx, thv, c, 'RETURNED', 2)).toMatchObject({
      ok: false,
      code: 'INVALID_TRANSITION',
    });
  });

  it('walks the protected path with the right actors and ends immutable', async () => {
    const h = harness();
    const c = await ready(h);
    const thv = actor('THV', { userId: 'thv-1' });
    const numbered = withProof(c, 'NUMBER_ALLOCATED');
    expect(await transitionCase(h.ctx, actor('VAN_THU'), numbered, 'SIGNED', 2)).toMatchObject({
      ok: false,
      decision: { reason: 'ROLE_LACKS_PERMISSION' },
    });
    const signed = await transitionCase(h.ctx, thv, numbered, 'SIGNED', 2);
    expect(signed).toMatchObject({ ok: true, value: { status: 'SIGNED', version: 3 } });
    if (!signed.ok) return;
    const stamped = await transitionCase(h.ctx, actor('VAN_THU'), signed.value, 'STAMPED', 3);
    expect(stamped).toMatchObject({ ok: true, value: { status: 'STAMPED' } });
    if (!stamped.ok) return;
    expect(
      await transitionCase(h.ctx, actor('VAN_THU'), stamped.value, 'RETURNED', 4),
    ).toMatchObject({ ok: false, code: 'MISSING_PROOF' });
    const proven = withProof(
      withProof(stamped.value, 'MISA_CONFIRMED_FULL'),
      'FINAL_SCAN_WITH_SIGNATURE_AND_STAMP',
    );
    const returned = await transitionCase(h.ctx, actor('VAN_THU'), proven, 'RETURNED', 4);
    expect(returned).toMatchObject({ ok: true, value: { status: 'RETURNED' } });
    if (!returned.ok) return;
    expect(
      await transitionCase(h.ctx, actor('ADMIN'), returned.value, 'CANCELLED', 5, 'x'),
    ).toMatchObject({ ok: false, code: 'CASE_FINAL' });
    expect(
      await editInternalFields(h.ctx, actor('ADMIN'), returned.value, { title: 'x' }, 5),
    ).toMatchObject({ ok: false, code: 'CASE_FINAL' });
  });

  it('cancels only by Admin with a reason, including before assignment', async () => {
    const h = harness();
    const c = await baseCase(h.ctx);
    expect(await transitionCase(h.ctx, actor('THU_KY'), c, 'CANCELLED', 1, 'sai')).toMatchObject({
      ok: false,
      decision: { reason: 'ROLE_LACKS_PERMISSION' },
    });
    expect(await transitionCase(h.ctx, actor('ADMIN'), c, 'CANCELLED', 1)).toMatchObject({
      ok: false,
      code: 'REASON_REQUIRED',
    });
    expect(
      await transitionCase(h.ctx, actor('ADMIN'), c, 'CANCELLED', 1, 'khách huỷ'),
    ).toMatchObject({ ok: true, value: { status: 'CANCELLED', cancelReason: 'khách huỷ' } });
  });

  it('records an audit row for every outcome without any customer content', async () => {
    const h = harness();
    const c = await baseCase(h.ctx);
    await editInternalFields(h.ctx, actor('KE_TOAN'), c, { title: 'x' }, 1);
    await editInternalFields(h.ctx, actor('THU_KY'), c, { title: 'x' }, 1);
    const rows = h.sink.all();
    expect(rows.map((r) => [r.action, r.outcome, r.reason])).toEqual([
      ['vibang.create', 'allow', 'ALLOWED'],
      ['vibang.edit_internal', 'deny', 'ROLE_LACKS_PERMISSION'],
      ['vibang.edit_internal', 'allow', 'ALLOWED'],
    ]);
    expect(JSON.stringify(rows)).not.toContain('Lập vi bằng');
  });
});
