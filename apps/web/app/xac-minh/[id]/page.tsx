import { notFound } from 'next/navigation';
import { AssignHandler } from '../../../components/AssignHandler';
import { ContractDateForm } from '../../../components/ContractDateForm';
import { DetailFrame, DetailSignIn } from '../../../components/DetailFrame';
import { StatusPill } from '../../../components/StatusPill';
import { VerificationActions } from '../../../components/VerificationActions';
import { loadItems } from '../../../lib/load-items';
import { ROUND_STATUS_LABEL, VERIFICATION_STATUS_LABEL } from '../../../lib/messages';
import { currentSession, loadHandlerOptions, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

interface Round {
  readonly id: string;
  readonly seq: number;
  readonly partyName: string;
  readonly status: string;
  readonly result: string | null;
}
interface Item {
  readonly caseId: string;
  readonly caseRef: string;
  readonly status: string;
  readonly handlerUserId: string | null;
  readonly conclusionText: string | null;
  readonly rounds: Round[];
}

export default async function VerificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return <DetailSignIn title="Hồ sơ xác minh" what="hồ sơ xác minh" />;
  }
  const cookie = await requestCookie();
  const items = await loadItems<Item>('/verification/cases', cookie);
  if (items === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Hồ sơ xác minh</h1>
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  const c = items.find((x) => x.caseId === id);
  if (!c) notFound();
  const isAdmin = session.roles.includes('ADMIN');
  const handlers = isAdmin ? await loadHandlerOptions(cookie) : [];
  const concluded = c.status === 'CONCLUDED';
  const statusLabel = VERIFICATION_STATUS_LABEL[c.status] ?? c.status;
  return (
    <DetailFrame
      title={c.caseRef}
      meta="Xác minh điều kiện thi hành án"
      status={c.status}
      statusLabel={statusLabel}
      backHref="/xac-minh"
      backLabel="Xác minh điều kiện THA"
    >
      <section className="panel" aria-labelledby="rounds-t">
        <h2 id="rounds-t">Các vòng xác minh</h2>
        {c.rounds.length === 0 ? (
          <p className="muted">Chưa có vòng xác minh. Bắt đầu vòng ở thẻ thao tác bên cạnh.</p>
        ) : (
          <div className="table-wrap">
            <table className="table-cards">
              <caption className="sr-only">Các vòng xác minh</caption>
              <thead>
                <tr>
                  <th scope="col">Vòng</th>
                  <th scope="col">Bên được xác minh</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {c.rounds.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.seq}</th>
                    <td data-label="Bên được xác minh">{r.partyName}</td>
                    <td data-label="Trạng thái">
                      <StatusPill
                        status={r.status}
                        label={ROUND_STATUS_LABEL[r.status] ?? r.status}
                      />
                    </td>
                    <td data-label="Kết quả">
                      {r.result ?? <span className="muted">Chưa có</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="grid gap-4">
        <section className="panel" aria-labelledby="concl-t">
          <h2 id="concl-t">Kết luận và thao tác</h2>
          <p>
            <StatusPill status={c.status} label={statusLabel} />
          </p>
          {c.conclusionText ? <p>{c.conclusionText}</p> : null}
          <p className="muted">
            Thừa phát lại phụ trách: {c.handlerUserId ? 'Đã phân công' : 'Chưa phân công'}
          </p>
          <VerificationActions caseId={c.caseId} status={c.status} rounds={c.rounds} />
        </section>
        {concluded ? null : (
          <section className="panel" aria-labelledby="more-t">
            <h2 id="more-t">Phân công và hợp đồng</h2>
            <div className="stack">
              {isAdmin ? (
                <AssignHandler
                  path={`verification/cases/${c.caseId}/handler`}
                  options={handlers}
                  currentId={c.handlerUserId}
                />
              ) : null}
              <ContractDateForm caseId={c.caseId} />
            </div>
          </section>
        )}
      </div>
    </DetailFrame>
  );
}
