import Link from 'next/link';
import { NewVerificationForm } from '../../components/NewVerificationForm';
import { VerificationActions } from '../../components/VerificationActions';
import { AssignHandler } from '../../components/AssignHandler';
import { API_URL, currentSession, loadHandlerOptions, requestCookie } from '../../lib/server';
import { ROUND_STATUS_LABEL, VERIFICATION_STATUS_LABEL } from '../../lib/messages';

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

async function load(cookie: string | null): Promise<Item[] | 'error'> {
  try {
    const res = await fetch(`${API_URL}/verification/cases`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return ((await res.json()) as { items: Item[] }).items;
  } catch {
    return 'error';
  }
}

export default async function VerificationPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Xác minh</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem hồ sơ xác minh.
          </p>
        </div>
      </section>
    );
  }
  const cookie = await requestCookie();
  const items = await load(cookie);
  const handlers = session.roles.includes('ADMIN') ? await loadHandlerOptions(cookie) : [];
  return (
    <section aria-labelledby="t">
      <h1 id="t">Xác minh</h1>
      <p className="muted">Hồ sơ xác minh điều kiện thi hành án trong phạm vi quyền của bạn.</p>
      {items === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được danh sách</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="state" role="status">
          <h2>Chưa có hồ sơ xác minh</h2>
          <p>Chưa có hồ sơ nào trong phạm vi quyền của bạn.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Hồ sơ xác minh</caption>
            <thead>
              <tr>
                <th scope="col">Mã hồ sơ</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">THV phụ trách</th>
                <th scope="col">Các vòng</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.caseId}>
                  <th scope="row">{c.caseRef}</th>
                  <td>
                    {VERIFICATION_STATUS_LABEL[c.status] ?? c.status}
                    {c.conclusionText ? <span className="muted"> · {c.conclusionText}</span> : null}
                  </td>
                  <td>{c.handlerUserId ? 'Đã phân công' : 'Chưa phân công'}</td>
                  <td>
                    {c.rounds.length === 0 ? (
                      <span className="muted">Chưa có vòng</span>
                    ) : (
                      <ul>
                        {c.rounds.map((r) => (
                          <li key={r.id}>
                            {r.seq}. {r.partyName} · {ROUND_STATUS_LABEL[r.status] ?? r.status}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>
                    {c.status === 'CONCLUDED' ? null : (
                      <AssignHandler
                        path={`verification/cases/${c.caseId}/handler`}
                        options={handlers}
                        currentId={c.handlerUserId}
                      />
                    )}
                    <VerificationActions caseId={c.caseId} status={c.status} rounds={c.rounds} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">
        Hoàn thành vòng xác minh cần nguồn kèm tệp bằng chứng, chưa khả dụng trên giao diện (cần kho
        tệp).
      </p>
      <NewVerificationForm branches={session.branches} />
    </section>
  );
}
