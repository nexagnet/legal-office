import Link from 'next/link';
import { AccessRequestActions } from '../../../components/AccessRequestActions';
import { loadRequests } from '../../../lib/admin-api';
import { describeRequest } from '../../../lib/admin-describe';
import { ACCESS_STATUS_LABEL } from '../../../lib/messages';
import { currentSession, requestCookie } from '../../../lib/server';

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
  const isHead = session.roles.includes('TRUONG_VP');
  const list =
    requests === 'error' ? [] : requests.filter((r) => (r.status !== 'PENDING') === done);
  const pending = requests === 'error' ? 0 : requests.filter((r) => r.status === 'PENDING').length;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Phân quyền và đề xuất</h1>
          <p className="muted">
            Mọi thay đổi vai, quyền ký và địa điểm cần Trưởng văn phòng duyệt.{' '}
            {isHead
              ? 'Bạn duyệt hoặc từ chối đề xuất do Admin lập.'
              : 'Admin đề xuất, không tự duyệt.'}
          </p>
        </div>
        {session.roles.includes('ADMIN') ? (
          <Link className="primary btn-link" href="/quan-tri/phan-quyen/de-xuat">
            + Đề xuất đổi quyền
          </Link>
        ) : null}
      </div>
      <div className="admin-toolbar">
        <div className="seg" role="tablist" aria-label="Lọc đề xuất">
          <Link href="/quan-tri/phan-quyen" aria-current={done ? undefined : 'page'}>
            Chờ duyệt {pending}
          </Link>
          <Link href="/quan-tri/phan-quyen?tab=da-xu-ly" aria-current={done ? 'page' : undefined}>
            Đã xử lý
          </Link>
        </div>
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
          <article key={r.id} className="req-card">
            <h3>{r.targetLabel}</h3>
            <p>
              <strong>{describeRequest(r)}</strong>
            </p>
            <p className="muted">
              Lý do: {r.reason}
              {r.decisionNote ? ` · ${r.decisionNote}` : ''}
            </p>
            <p>{ACCESS_STATUS_LABEL[r.status] ?? r.status}</p>
            {r.status === 'PENDING' ? (
              <AccessRequestActions id={r.id} roles={session.roles} />
            ) : null}
          </article>
        ))
      )}
    </>
  );
}
