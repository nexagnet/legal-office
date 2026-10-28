import Link from 'next/link';
import { KpiStrip, countStatus } from '../../components/KpiStrip';
import { TabNav } from '../../components/ui/tab-nav';
import { activeTab, filterByTab, statusTabs, type StatusGroup } from '../../lib/status-tabs';
import { StatusPill } from '../../components/StatusPill';
import { NewServiceSheet } from '../../components/NewCaseSheets';
import { API_URL, currentSession, requestCookie } from '../../lib/server';
import { SERVICE_STATUS_LABEL, UNDELIVERABLE_LABEL } from '../../lib/messages';
import { PartyName, Person } from '../../components/ui/avatar';
import { loadPeopleNames } from '../../lib/people';
import { deadlineView, serviceNextStep } from '../../lib/service-view';

export const dynamic = 'force-dynamic';

const GROUPS: readonly StatusGroup[] = [
  { key: 'dang-xu-ly', label: 'Đang xử lý', statuses: ['PENDING', 'ASSIGNED'] },
  { key: 'hoan-tat', label: 'Hoàn tất', statuses: ['DELIVERED', 'UNDELIVERABLE'] },
];

interface Item {
  readonly documentId: string;
  readonly requestRef: string;
  readonly recipientName: string;
  readonly documentTitle?: string | null;
  readonly deadlineAt: string;
  readonly status: string;
  readonly undeliverableReason: string | null;
  readonly attempts: number;
  readonly handlerUserId: string | null;
}

async function load(cookie: string | null): Promise<Item[] | 'error'> {
  try {
    const res = await fetch(`${API_URL}/service-of-documents/documents`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return ((await res.json()) as { items: Item[] }).items;
  } catch {
    return 'error';
  }
}

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Tống đạt</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem các văn bản tống đạt.
          </p>
        </div>
      </section>
    );
  }
  const cookie = await requestCookie();
  const items = await load(cookie);
  const people = await loadPeopleNames(
    cookie,
    items === 'error' ? [] : items.map((i) => i.handlerUserId),
  );
  const tab = activeTab(GROUPS, sp.tab);
  const shown = items === 'error' ? [] : filterByTab(items, GROUPS, tab);
  return (
    <section aria-labelledby="t">
      <div className="page-head">
        <div>
          <h1 id="t">Tống đạt</h1>
          <p className="muted">Văn bản tống đạt trong phạm vi quyền của bạn.</p>
        </div>
        <NewServiceSheet branches={session.branches} />
      </div>
      {items === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được danh sách</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="state" role="status">
          <h2>Chưa có văn bản tống đạt</h2>
          <p>Chưa có văn bản nào trong phạm vi quyền của bạn.</p>
        </div>
      ) : (
        <>
          <KpiStrip
            label="Tổng hợp văn bản tống đạt"
            items={[
              { label: 'Chưa giao người xử lý', value: countStatus(items, 'PENDING') },
              { label: 'Đang xử lý', value: countStatus(items, 'ASSIGNED') },
              { label: 'Đã tống đạt', value: countStatus(items, 'DELIVERED'), tone: 'ok' },
              {
                label: 'Không tống đạt được',
                value: countStatus(items, 'UNDELIVERABLE'),
                tone: 'danger',
              },
            ]}
          />
          <TabNav
            label="Nhóm trạng thái"
            tabs={statusTabs('/tong-dat', GROUPS, items)}
            active={tab}
          />
          <div className="table-wrap">
            <table className="table-cards">
              <caption className="sr-only">Văn bản tống đạt</caption>
              <thead>
                <tr>
                  <th scope="col">Yêu cầu</th>
                  <th scope="col">Người nhận</th>
                  <th scope="col">Hạn</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Người xử lý</th>
                  <th scope="col">Số lần</th>
                  <th scope="col">Việc tiếp theo</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => {
                  const dl = deadlineView(
                    d.deadlineAt,
                    d.status === 'DELIVERED' || d.status === 'UNDELIVERABLE',
                  );
                  return (
                    <tr key={d.documentId}>
                      <th scope="row">
                        <Link href={`/tong-dat/${d.documentId}`}>{d.requestRef}</Link>
                      </th>
                      <td data-label="Người nhận">
                        <PartyName name={d.recipientName} />
                        {d.documentTitle ? (
                          <span className="block text-xs text-muted">{d.documentTitle}</span>
                        ) : null}
                      </td>
                      <td data-label="Hạn">
                        <span className="block">{dl.date}</span>
                        <span
                          className={
                            dl.tone === 'overdue'
                              ? 'text-xs font-semibold text-danger'
                              : dl.tone === 'soon'
                                ? 'text-xs font-semibold text-warn'
                                : 'text-xs text-muted'
                          }
                        >
                          {dl.note}
                        </span>
                      </td>
                      <td data-label="Trạng thái">
                        <StatusPill
                          status={d.status}
                          label={SERVICE_STATUS_LABEL[d.status] ?? d.status}
                        />
                        {d.undeliverableReason ? (
                          <span className="muted">
                            {' '}
                            · {UNDELIVERABLE_LABEL[d.undeliverableReason] ?? d.undeliverableReason}
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Người xử lý">
                        {d.handlerUserId && people.get(d.handlerUserId) ? (
                          <Person
                            name={people.get(d.handlerUserId) ?? ''}
                            id={d.handlerUserId}
                            size="sm"
                          />
                        ) : (
                          <span className="muted">
                            {d.handlerUserId ? 'Đã phân công' : 'Chưa giao'}
                          </span>
                        )}
                      </td>
                      <td data-label="Số lần">{d.attempts}</td>
                      <td data-label="Việc tiếp theo">
                        <Link className="font-semibold" href={`/tong-dat/${d.documentId}`}>
                          {serviceNextStep(d.status)}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
