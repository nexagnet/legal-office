import Link from 'next/link';
import { AccessRequestActions } from '../../../components/AccessRequestActions';
import { loadRequests } from '../../../lib/admin-api';
import { describeRequest } from '../../../lib/admin-describe';
import { ACCESS_KIND_LABEL, ACCESS_STATUS_LABEL } from '../../../lib/messages';
import { currentSession, requestCookie } from '../../../lib/server';
import { PersonLabel } from '../../../components/ui/avatar';

export const dynamic = 'force-dynamic';

export default async function AccessPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ tab?: string }>;
}) {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const done = (await searchParams).tab === 'da-xu-ly';
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  const requests = officeId ? await loadRequests(await requestCookie(), officeId) : [];
  const list =
    requests === 'error' ? [] : requests.filter((r) => (r.status !== 'PENDING') === done);
  const pending = requests === 'error' ? 0 : requests.filter((r) => r.status === 'PENDING').length;
  const processed = requests === 'error' ? 0 : requests.length - pending;
  return (
    <>
      <div className="member-bar">
        <div className="chip-row" role="group" aria-label="Lọc đề xuất">
          <Link
            className="chip"
            href="/quan-tri/phan-quyen"
            aria-pressed={!done}
            aria-current={done ? undefined : 'page'}
          >
            Chờ duyệt {pending}
          </Link>
          <Link
            className="chip"
            href="/quan-tri/phan-quyen?tab=da-xu-ly"
            aria-pressed={done}
            aria-current={done ? 'page' : undefined}
          >
            Đã xử lý {processed}
          </Link>
        </div>
        {session.roles.includes('ADMIN') ? (
          <Link className="primary btn-link" href="/quan-tri/phan-quyen/de-xuat">
            + Đề xuất đổi quyền
          </Link>
        ) : null}
      </div>
      {requests === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được đề xuất</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : list.length === 0 ? (
        <div className="state" role="status">
          <h2>{done ? 'Chưa có đề xuất đã xử lý' : 'Không có đề xuất chờ duyệt'}</h2>
        </div>
      ) : (
        list.map((r) => (
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
            {r.status === 'PENDING' ? (
              <AccessRequestActions id={r.id} roles={session.roles} />
            ) : null}
          </article>
        ))
      )}
    </>
  );
}
