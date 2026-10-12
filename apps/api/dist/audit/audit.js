"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryAuditSink = void 0;
exports.authorize = authorize;
const decide_1 = require("../authz/decide");
class InMemoryAuditSink {
    rows = [];
    record(event) {
        this.rows.push(event);
    }
    all() {
        return [...this.rows];
    }
}
exports.InMemoryAuditSink = InMemoryAuditSink;
/** Quyết định + ghi audit cho MỌI kết quả, kể cả từ chối. Nếu ghi audit lỗi thì lỗi nổi lên (fail-closed). */
async function authorize(actor, action, resource, sink, now = () => new Date()) {
    const decision = (0, decide_1.decide)(actor, action, resource);
    await sink.record({
        at: now().toISOString(),
        tenantId: actor.tenantId,
        actorId: actor.userId,
        action,
        outcome: decision.allow ? 'allow' : 'deny',
        reason: decision.reason,
        officeId: resource.officeId,
        branchId: resource.branchId,
    });
    return decision;
}
