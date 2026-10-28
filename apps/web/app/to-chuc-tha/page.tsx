import Link from 'next/link';
import { KpiStrip, countStatus } from '../../components/KpiStrip';
import { TabNav } from '../../components/ui/tab-nav';
import { activeTab, filterByTab, statusTabs, type StatusGroup } from '../../lib/status-tabs';
import { StatusPill } from '../../components/StatusPill';
import { NewEnforcementSheet } from '../../components/NewCaseSheets';
import { API_URL, currentSession, requestCookie } from '../../lib/server';
import {
  ENFORCEMENT_STATUS_LABEL,
  OBLIGATION_STATUS_LABEL,
  PARTY_ROLE_LABEL,
} from '../../lib/messages';
import { PartyName } from '../../components/ui/avatar';

export const dynamic = 'force-dynamic';

const GROUPS: readonly StatusGroup[] = [
  { key: 'dang-thuc-hien', label: 'Đang thực hiện', statuses: ['OPEN'] },
  { key: 'da-ket-thuc', label: 'Đã kết thúc', statuses: ['COMPLETED', 'TERMINATED'] },
];

interface Party {
  readonly id: string;
  readonly kind?: string;
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

export default async function EnforcementPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
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
  const tab = activeTab(GROUPS, sp.tab);
  const shown = items === 'error' ? [] : filterByTab(items, GROUPS, tab);
  return (
    <section aria-labelledby="t">
      {items === 'error' || items.length === 0 ? (
        <div className="mb-4 flex justify-end">
          <NewEnforcementSheet branches={session.branches} />
        </div>
      ) : null}
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
        <>
          <KpiStrip
            label="Tổng hợp hồ sơ tổ chức thi hành án"
            items={[
              { label: 'Đang thực hiện', value: countStatus(items, 'OPEN') },
              { label: 'Đã hoàn tất', value: countStatus(items, 'COMPLETED'), tone: 'ok' },
              { label: 'Đã chấm dứt', value: countStatus(items, 'TERMINATED') },
            ]}
          />
          <TabNav
            label="Nhóm trạng thái"
            tabs={statusTabs('/to-chuc-tha', GROUPS, items)}
            active={tab}
            action={<NewEnforcementSheet branches={session.branches} />}
          />
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
                {shown.map((c) => (
                  <tr key={c.caseId}>
                    <th scope="row">
                      <Link href={`/to-chuc-tha/${c.caseId}`}>{c.caseRef}</Link>
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
                        <ul className="m-0 grid list-none gap-1 p-0">
                          {c.parties.map((p) => (
                            <li key={p.id}>
                              <PartyName name={p.displayName} person={p.kind === 'PERSON'} /> ·{' '}
                              {PARTY_ROLE_LABEL[p.role] ?? p.role}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td data-label="Nghĩa vụ">
                      {c.obligations.length === 0 ? (
                        <span className="muted">Chưa có</span>
                      ) : (
                        <ul className="m-0 grid list-none gap-1 p-0">
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
                      <Link href={`/to-chuc-tha/${c.caseId}`}>Mở</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
