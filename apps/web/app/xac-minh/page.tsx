import Link from 'next/link';
import { KpiStrip, countStatus } from '../../components/KpiStrip';
import { TabNav } from '../../components/ui/tab-nav';
import { activeTab, filterByTab, statusTabs, type StatusGroup } from '../../lib/status-tabs';
import { StatusPill } from '../../components/StatusPill';
import { NewVerificationSheet } from '../../components/NewCaseSheets';
import { API_URL, currentSession, requestCookie } from '../../lib/server';
import { ROUND_STATUS_LABEL, VERIFICATION_STATUS_LABEL } from '../../lib/messages';
import { PartyName } from '../../components/ui/avatar';

export const dynamic = 'force-dynamic';

const GROUPS: readonly StatusGroup[] = [
  { key: 'dang-xac-minh', label: 'Đang xác minh', statuses: ['OPEN', 'CONCLUSION_PROPOSED'] },
  { key: 'co-ket-qua', label: 'Có kết quả', statuses: ['CONCLUDED'] },
];

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

export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
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
  const tab = activeTab(GROUPS, sp.tab);
  const shown = items === 'error' ? [] : filterByTab(items, GROUPS, tab);
  return (
    <section aria-labelledby="t">
      <div className="page-head">
        <div>
          <h1 id="t">Xác minh</h1>
          <p className="muted">Hồ sơ xác minh điều kiện thi hành án trong phạm vi quyền của bạn.</p>
        </div>
        <NewVerificationSheet branches={session.branches} />
      </div>
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
        <>
          <KpiStrip
            label="Tổng hợp hồ sơ xác minh"
            items={[
              { label: 'Đang xác minh', value: countStatus(items, 'OPEN') },
              {
                label: 'Chờ quyết định kết luận',
                value: countStatus(items, 'CONCLUSION_PROPOSED'),
                tone: 'warn',
              },
              { label: 'Đã kết luận', value: countStatus(items, 'CONCLUDED'), tone: 'ok' },
            ]}
          />
          <TabNav
            label="Nhóm trạng thái"
            tabs={statusTabs('/xac-minh', GROUPS, items)}
            active={tab}
          />
          <div className="table-wrap">
            <table className="table-cards">
              <caption className="sr-only">Hồ sơ xác minh</caption>
              <thead>
                <tr>
                  <th scope="col">Mã hồ sơ</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">THV phụ trách</th>
                  <th scope="col">Các lượt</th>
                  <th scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.caseId}>
                    <th scope="row">
                      <Link href={`/xac-minh/${c.caseId}`}>{c.caseRef}</Link>
                    </th>
                    <td data-label="Trạng thái">
                      <StatusPill
                        status={c.status}
                        label={VERIFICATION_STATUS_LABEL[c.status] ?? c.status}
                      />
                      {c.conclusionText ? (
                        <span className="muted"> · {c.conclusionText}</span>
                      ) : null}
                    </td>
                    <td data-label="THV phụ trách">
                      {c.handlerUserId ? 'Đã phân công' : 'Chưa phân công'}
                    </td>
                    <td data-label="Các lượt">
                      {c.rounds.length === 0 ? (
                        <span className="muted">Chưa có lượt</span>
                      ) : (
                        <ul>
                          {c.rounds.map((r) => (
                            <li key={r.id}>
                              {r.seq}. <PartyName name={r.partyName} /> ·{' '}
                              {ROUND_STATUS_LABEL[r.status] ?? r.status}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td data-label="Thao tác">
                      <Link href={`/xac-minh/${c.caseId}`}>Mở</Link>
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
