import Link from 'next/link';
import { NewServiceForm } from '../../components/NewServiceForm';
import { ServiceRowActions } from '../../components/ServiceRowActions';
import { AssignHandler } from '../../components/AssignHandler';
import { API_URL, currentSession, loadHandlerOptions, requestCookie } from '../../lib/server';
import { SERVICE_STATUS_LABEL, UNDELIVERABLE_LABEL } from '../../lib/messages';

export const dynamic = 'force-dynamic';

interface Item {
  readonly documentId: string;
  readonly requestRef: string;
  readonly recipientName: string;
  readonly deadlineAt: string;
  readonly status: string;
  readonly undeliverableReason: string | null;
  readonly handlerUserId: string | null;
  readonly attempts: number;
}

const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

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

export default async function ServicePage() {
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
  const handlers = session.roles.includes('ADMIN') ? await loadHandlerOptions(cookie) : [];
  return (
    <section aria-labelledby="t">
      <h1 id="t">Tống đạt</h1>
      <p className="muted">Văn bản tống đạt trong phạm vi quyền của bạn.</p>
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
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Văn bản tống đạt</caption>
            <thead>
              <tr>
                <th scope="col">Yêu cầu</th>
                <th scope="col">Người nhận</th>
                <th scope="col">Hạn</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Số lần</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.documentId}>
                  <th scope="row">{d.requestRef}</th>
                  <td>{d.recipientName}</td>
                  <td>{fmt.format(new Date(d.deadlineAt))}</td>
                  <td>
                    {SERVICE_STATUS_LABEL[d.status] ?? d.status}
                    {d.undeliverableReason ? (
                      <span className="muted">
                        {' '}
                        · {UNDELIVERABLE_LABEL[d.undeliverableReason] ?? d.undeliverableReason}
                      </span>
                    ) : null}
                  </td>
                  <td>{d.attempts}</td>
                  <td>
                    {d.status === 'DELIVERED' || d.status === 'UNDELIVERABLE' ? null : (
                      <AssignHandler
                        path={`service-of-documents/documents/${d.documentId}/handler`}
                        options={handlers}
                        currentId={d.handlerUserId}
                      />
                    )}
                    <ServiceRowActions documentId={d.documentId} status={d.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewServiceForm branches={session.branches} />
    </section>
  );
}
