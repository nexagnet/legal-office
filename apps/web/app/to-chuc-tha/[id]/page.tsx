import { notFound } from 'next/navigation';
import { AssignHandler } from '../../../components/AssignHandler';
import { DetailFrame, DetailSignIn } from '../../../components/DetailFrame';
import { EnforcementActions } from '../../../components/EnforcementActions';
import { StatusPill } from '../../../components/StatusPill';
import { loadItems } from '../../../lib/load-items';
import {
  ENFORCEMENT_STATUS_LABEL,
  OBLIGATION_STATUS_LABEL,
  PARTY_ROLE_LABEL,
} from '../../../lib/messages';
import { currentSession, loadHandlerOptions, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

interface Party {
  readonly id: string;
  readonly displayName: string;
  readonly role: string;
}
interface Obligation {
  readonly id: string;
  readonly seq: number;
  readonly description: string;
  readonly status: string;
}
interface Item {
  readonly caseId: string;
  readonly caseRef: string;
  readonly agreementRef: string;
  readonly decisionRef: string;
  readonly status: string;
  readonly handlerUserId: string | null;
  readonly parties: Party[];
  readonly obligations: Obligation[];
}

export default async function EnforcementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return <DetailSignIn title="Hồ sơ tổ chức thi hành án" what="hồ sơ tổ chức thi hành án" />;
  }
  const cookie = await requestCookie();
  const items = await loadItems<Item>('/enforcement-cases', cookie);
  if (items === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Hồ sơ tổ chức thi hành án</h1>
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  const c = items.find((x) => x.caseId === id);
  if (!c) notFound();
  const handlers = session.roles.includes('ADMIN') ? await loadHandlerOptions(cookie) : [];
  const statusLabel = ENFORCEMENT_STATUS_LABEL[c.status] ?? c.status;
  return (
    <DetailFrame
      title={c.caseRef}
      meta={`${c.agreementRef} · ${c.decisionRef}`}
      status={c.status}
      statusLabel={statusLabel}
      backHref="/to-chuc-tha"
      backLabel="Tổ chức thi hành án"
    >
      <div className="grid gap-4">
        <section className="panel" aria-labelledby="parties-t">
          <h2 id="parties-t">Đương sự</h2>
          {c.parties.length === 0 ? (
            <p className="muted">Chưa có đương sự.</p>
          ) : (
            <ul className="m-0 grid list-none gap-3 p-0">
              {c.parties.map((p) => (
                <li key={p.id} className="grid border-b border-line pb-3 last:border-0 last:pb-0">
                  <strong>{p.displayName}</strong>
                  <span className="text-[13px] text-muted">
                    {PARTY_ROLE_LABEL[p.role] ?? p.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel" aria-labelledby="obl-t">
          <h2 id="obl-t">Nghĩa vụ</h2>
          {c.obligations.length === 0 ? (
            <p className="muted">Chưa có nghĩa vụ.</p>
          ) : (
            <ol className="m-0 grid list-none gap-3 p-0">
              {c.obligations.map((o) => (
                <li
                  key={o.id}
                  className="grid gap-1 border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <span>
                    {o.seq}. {o.description}
                  </span>
                  <span>
                    <StatusPill
                      status={o.status}
                      label={OBLIGATION_STATUS_LABEL[o.status] ?? o.status}
                    />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      <div className="grid gap-4">
        <section className="panel" aria-labelledby="act-t">
          <h2 id="act-t">Thao tác</h2>
          <p>
            <StatusPill status={c.status} label={statusLabel} />
          </p>
          <EnforcementActions caseId={c.caseId} status={c.status} obligations={c.obligations} />
        </section>
        {c.status === 'COMPLETED' ? null : (
          <section className="panel" aria-labelledby="assign-t">
            <h2 id="assign-t">Phân công</h2>
            <AssignHandler
              path={`enforcement-cases/${c.caseId}/handler`}
              options={handlers}
              currentId={c.handlerUserId}
            />
          </section>
        )}
      </div>
    </DetailFrame>
  );
}
