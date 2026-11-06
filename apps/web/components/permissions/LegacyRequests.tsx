import { AccessRequestActions } from '../AccessRequestActions';
import { describeRequest } from '../../lib/admin-describe';
import type { AccessRow } from '../../lib/admin-api';
import { ACCESS_KIND_LABEL, ACCESS_STATUS_LABEL } from '../../lib/messages';
import { PersonLabel } from '../ui/avatar';

/**
 * Đề xuất cấp VAI cũ (trước khi chuyển sang nhóm quyền). Chỉ hiện khi còn đề xuất, để việc đã gửi không bị bỏ rơi;
 * đề xuất mới đều lập theo nhóm quyền ở các tab phía trên.
 */
export function LegacyRequests({
  rows,
  roles,
}: {
  readonly rows: readonly AccessRow[];
  readonly roles: readonly string[];
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="legacy-t" className="grid gap-3">
      <h2 id="legacy-t" className="font-serif text-lg">
        Đề xuất theo vai (cũ)
      </h2>
      <p className="muted">
        Các đề xuất cấp vai lập trước khi hệ thống chuyển sang nhóm quyền. Xử lý nốt tại đây; đề
        xuất mới dùng nhóm quyền.
      </p>
      {rows.map((r) => (
        <article key={r.id} className="req-card" data-status={r.status}>
          <div className="req-body">
            <p className="req-head">
              <span className="kind-chip">{ACCESS_KIND_LABEL[r.kind] ?? r.kind}</span>
              <strong className="req-name inline-flex items-center gap-2">
                <PersonLabel label={r.targetLabel} id={r.targetUserId} size="md" />
              </strong>
            </p>
            <p className="req-what">{describeRequest(r)}</p>
            <p className="req-why">
              Lý do: {r.reason}
              {r.decisionNote ? ` · ${r.decisionNote}` : ''}
            </p>
            <p className="req-by">
              <PersonLabel label={r.proposedBy} /> đề xuất
              {r.status === 'PENDING' ? '' : ` · ${ACCESS_STATUS_LABEL[r.status] ?? r.status}`}
            </p>
          </div>
          {r.status === 'PENDING' ? <AccessRequestActions id={r.id} roles={roles} /> : null}
        </article>
      ))}
    </section>
  );
}
