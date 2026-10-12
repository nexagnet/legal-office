import { decide } from '../authz/decide';
import type { Actor, Decision, Resource } from '../authz/types';

/** Sự kiện audit. Cố ý chỉ chứa định danh và mã; không tên, không nội dung hồ sơ (không PII). */
export interface AuditEvent {
  readonly at: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly action: string;
  readonly outcome: 'allow' | 'deny';
  readonly reason: string;
  readonly officeId: string;
  readonly branchId: string | null;
}

export interface AuditSink {
  record(event: AuditEvent): void | Promise<void>;
}

export class InMemoryAuditSink implements AuditSink {
  private readonly rows: AuditEvent[] = [];

  record(event: AuditEvent): void {
    this.rows.push(event);
  }

  all(): readonly AuditEvent[] {
    return [...this.rows];
  }
}

/** Quyết định + ghi audit cho MỌI kết quả, kể cả từ chối. Nếu ghi audit lỗi thì lỗi nổi lên (fail-closed). */
export async function authorize(
  actor: Actor,
  action: string,
  resource: Resource,
  sink: AuditSink,
  now: () => Date = () => new Date(),
): Promise<Decision> {
  const decision = decide(actor, action, resource);
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
