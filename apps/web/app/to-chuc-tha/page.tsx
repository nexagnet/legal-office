import Link from 'next/link';
import { StatusPill } from '../../components/StatusPill';
import { EnforcementActions } from '../../components/EnforcementActions';
import { NewEnforcementForm } from '../../components/NewEnforcementForm';
import { AssignHandler } from '../../components/AssignHandler';
import { API_URL, currentSession, loadHandlerOptions, requestCookie } from '../../lib/server';
import {
  ENFORCEMENT_STATUS_LABEL,
  OBLIGATION_STATUS_LABEL,
  PARTY_ROLE_LABEL,
} from '../../lib/messages';

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

async function load(cookie: string | null): Promise<Item[] | 'error'> {
  try {
    const res = await fetch(`${API_URL}/enforcement-cases`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return ((await res.json()) as { items: Item[] }).items;
  } catch {
    return 'error';
  }
}

export default async function EnforcementPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Tổ chức THA</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem hồ sơ tổ chức thi hành án.
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
      <h1 id="t">Tổ chức THA</h1>
      <p className="muted">
        Hồ sơ tổ chức thi hành án trong phạm vi quyền của bạn. Không ghi số tiền; thanh toán do kế
        toán xác nhận từ MISA.
      </p>
      {items === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được danh sách</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="state" role="status">
          <h2>Chưa có hồ sơ</h2>
          <p>Chưa có hồ sơ nào trong phạm vi quyền của bạn.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table-cards">
            <caption className="sr-only">Hồ sơ tổ chức thi hành án</caption>
            <thead>
              <tr>
                <th scope="col">Mã hồ sơ</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Đương sự</th>
                <th scope="col">Nghĩa vụ</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.caseId}>
                  <th scope="row">
                    {c.caseRef}
                    <div className="muted">
                      {c.agreementRef} · {c.decisionRef}
                    </div>
                  </th>
                  <td data-label="Trạng thái">
                    <StatusPill
                      status={c.status}
                      label={ENFORCEMENT_STATUS_LABEL[c.status] ?? c.status}
                    />
                  </td>
                  <td data-label="Đương sự">
                    {c.parties.length === 0 ? (
                      <span className="muted">Chưa có</span>
                    ) : (
                      <ul>
                        {c.parties.map((p) => (
                          <li key={p.id}>
                            {p.displayName} · {PARTY_ROLE_LABEL[p.role] ?? p.role}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td data-label="Nghĩa vụ">
                    {c.obligations.length === 0 ? (
                      <span className="muted">Chưa có</span>
                    ) : (
                      <ul>
                        {c.obligations.map((o) => (
                          <li key={o.id}>
                            {o.seq}. {o.description} ·{' '}
                            {OBLIGATION_STATUS_LABEL[o.status] ?? o.status}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td data-label="Thao tác">
                    {c.status === 'COMPLETED' ? null : (
                      <AssignHandler
                        path={`enforcement-cases/${c.caseId}/handler`}
                        options={handlers}
                        currentId={c.handlerUserId}
                      />
                    )}
                    <EnforcementActions
                      caseId={c.caseId}
                      status={c.status}
                      obligations={c.obligations}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewEnforcementForm branches={session.branches} />
    </section>
  );
}
