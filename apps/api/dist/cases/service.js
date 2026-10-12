"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withProof = void 0;
exports.createCase = createCase;
exports.assignResponsibleThv = assignResponsibleThv;
exports.editInternalFields = editInternalFields;
exports.requestChange = requestChange;
exports.decideChange = decideChange;
exports.transitionCase = transitionCase;
const policy_1 = require("./policy");
const types_1 = require("./types");
const window_1 = require("./window");
const ok = (value) => ({ ok: true, value });
const fail = (code, decision) => ({
    ok: false,
    code,
    decision,
});
const TERMINAL = ['RETURNED', 'CANCELLED'];
async function audit(ctx, actor, action, scope, outcome, reason) {
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
async function guard(ctx, actor, action, c) {
    const decision = (0, policy_1.decideCaseAction)(actor, action, c);
    if (!decision.allow) {
        await audit(ctx, actor, action, c, 'deny', decision.reason);
        return fail('DENIED', decision);
    }
    return ok(undefined);
}
async function reject(ctx, actor, action, c, code) {
    await audit(ctx, actor, action, c, 'deny', code);
    return fail(code);
}
const commit = async (ctx, actor, action, next) => {
    const stored = { ...next, version: next.version + 1 };
    await audit(ctx, actor, action, stored, 'allow', 'ALLOWED');
    return ok(stored);
};
async function createCase(ctx, actor, input) {
    const decision = (0, policy_1.decideCreate)(actor, input.scope);
    if (!decision.allow) {
        await audit(ctx, actor, 'create', input.scope, 'deny', decision.reason);
        return fail('DENIED', decision);
    }
    const created = {
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
/** Chỉ Admin gán, đúng một THV chịu trách nhiệm; cho phép gán lại khi hồ sơ chưa qua bước ký. */
async function assignResponsibleThv(ctx, actor, c, assignee, expectedVersion) {
    const guarded = await guard(ctx, actor, 'assign', c);
    if (!guarded.ok)
        return guarded;
    if (c.version !== expectedVersion)
        return reject(ctx, actor, 'assign', c, 'VERSION_CONFLICT');
    if (c.status !== 'INTAKE' && c.status !== 'ASSIGNED')
        return reject(ctx, actor, 'assign', c, 'INVALID_TRANSITION');
    if (assignee.role !== 'THV' ||
        assignee.tenantId !== c.tenantId ||
        assignee.officeId !== c.officeId) {
        return reject(ctx, actor, 'assign', c, 'INVALID_ASSIGNEE');
    }
    return commit(ctx, actor, 'assign', {
        ...c,
        responsibleThvId: assignee.userId,
        status: 'ASSIGNED',
    });
}
const pickInternal = (patch) => {
    const keys = Object.keys(patch);
    if (keys.length === 0)
        return {};
    if (!keys.every((k) => types_1.INTERNAL_FIELDS.includes(k)))
        return null;
    return patch;
};
const snapshot = (c, patch) => Object.fromEntries(Object.keys(patch).map((k) => [k, c.fields[k]]));
/** Sửa trực tiếp trường nội bộ, chỉ trong 48 giờ đầu. Sau đó phải qua Change Request. */
async function editInternalFields(ctx, actor, c, patch, expectedVersion) {
    const guarded = await guard(ctx, actor, 'edit_internal', c);
    if (!guarded.ok)
        return guarded;
    if (TERMINAL.includes(c.status))
        return reject(ctx, actor, 'edit_internal', c, 'CASE_FINAL');
    if (c.version !== expectedVersion)
        return reject(ctx, actor, 'edit_internal', c, 'VERSION_CONFLICT');
    const internal = pickInternal(patch);
    if (internal === null)
        return reject(ctx, actor, 'edit_internal', c, 'NOT_INTERNAL_FIELD');
    if (Object.keys(internal).length === 0)
        return reject(ctx, actor, 'edit_internal', c, 'EMPTY_PATCH');
    if (!(0, window_1.isWithinEditWindow)(c.createdAt, ctx.now()))
        return reject(ctx, actor, 'edit_internal', c, 'EDIT_WINDOW_CLOSED');
    return commit(ctx, actor, 'edit_internal', { ...c, fields: { ...c.fields, ...internal } });
}
/** Sau 48 giờ: lập Change Request (trước/sau/lý do). Nội dung pháp lý cuối đi đường N-11, không qua đây. */
async function requestChange(ctx, actor, c, patch, reason, requestId) {
    const guarded = await guard(ctx, actor, 'request_change', c);
    if (!guarded.ok)
        return guarded;
    if (TERMINAL.includes(c.status))
        return reject(ctx, actor, 'request_change', c, 'CASE_FINAL');
    if (reason.trim() === '')
        return reject(ctx, actor, 'request_change', c, 'REASON_REQUIRED');
    const internal = pickInternal(patch);
    if (internal === null)
        return reject(ctx, actor, 'request_change', c, 'NOT_INTERNAL_FIELD');
    if (Object.keys(internal).length === 0)
        return reject(ctx, actor, 'request_change', c, 'EMPTY_PATCH');
    if ((0, window_1.isWithinEditWindow)(c.createdAt, ctx.now())) {
        return reject(ctx, actor, 'request_change', c, 'EDIT_WINDOW_STILL_OPEN');
    }
    const request = {
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
async function decideChange(ctx, actor, c, request, approve, expectedVersion) {
    const guarded = await guard(ctx, actor, 'decide_change', c);
    if (!guarded.ok)
        return guarded;
    if (request.caseId !== c.id || request.tenantId !== c.tenantId || request.status !== 'PENDING') {
        return reject(ctx, actor, 'decide_change', c, 'CHANGE_REQUEST_NOT_PENDING');
    }
    if (TERMINAL.includes(c.status))
        return reject(ctx, actor, 'decide_change', c, 'CASE_FINAL');
    if (c.version !== expectedVersion)
        return reject(ctx, actor, 'decide_change', c, 'VERSION_CONFLICT');
    // Một Change Request cũ không được ghi đè thay đổi đã duyệt sau nó: "trước" phải còn khớp hiện trạng.
    const stale = Object.entries(request.before).some(([k, v]) => c.fields[k] !== v);
    if (approve && stale)
        return reject(ctx, actor, 'decide_change', c, 'CHANGE_REQUEST_STALE');
    const decided = {
        ...request,
        status: approve ? 'APPROVED' : 'REJECTED',
        decidedBy: actor.userId,
        decidedAt: ctx.now().toISOString(),
    };
    const next = approve ? { ...c, fields: { ...c.fields, ...request.after } } : c;
    const stored = approve ? await commit(ctx, actor, 'decide_change', next) : ok(c);
    if (!approve)
        await audit(ctx, actor, 'decide_change', c, 'allow', 'REJECTED');
    if (!stored.ok)
        return stored;
    return ok({ case: stored.value, request: decided });
}
const RULES = {
    SIGNED: { from: ['ASSIGNED'], roles: ['THV'], proofs: ['NUMBER_ALLOCATED'] },
    STAMPED: { from: ['SIGNED'], roles: ['VAN_THU'], proofs: [] },
    RETURNED: {
        from: ['STAMPED'],
        roles: ['VAN_THU', 'THV'],
        proofs: ['MISA_CONFIRMED_FULL', 'FINAL_SCAN_WITH_SIGNATURE_AND_STAMP'],
    },
    CANCELLED: { from: ['INTAKE', 'ASSIGNED', 'SIGNED', 'STAMPED'], roles: ['ADMIN'], proofs: [] },
};
async function transitionCase(ctx, actor, c, to, expectedVersion, reason) {
    const guarded = await guard(ctx, actor, 'transition', c);
    if (!guarded.ok)
        return guarded;
    const rule = RULES[to];
    if (!rule)
        return reject(ctx, actor, 'transition', c, 'INVALID_TRANSITION'); // INTAKE/ASSIGNED không phải đích hợp lệ
    if (TERMINAL.includes(c.status))
        return reject(ctx, actor, 'transition', c, 'CASE_FINAL');
    if (c.version !== expectedVersion)
        return reject(ctx, actor, 'transition', c, 'VERSION_CONFLICT');
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
const withProof = (c, proof) => c.proofs.includes(proof) ? c : { ...c, proofs: [...c.proofs, proof] };
exports.withProof = withProof;
