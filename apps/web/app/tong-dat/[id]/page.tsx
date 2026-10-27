import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignHandler } from '../../../components/AssignHandler';
import { DetailFrame, DetailSignIn } from '../../../components/DetailFrame';
import { ServiceRowActions } from '../../../components/ServiceRowActions';
import { StatusPill } from '../../../components/StatusPill';
import { DefList } from '../../../components/ui/def-list';
import { loadItems } from '../../../lib/load-items';
import { SERVICE_STATUS_LABEL, UNDELIVERABLE_LABEL } from '../../../lib/messages';
import { currentSession, loadHandlerOptions, requestCookie } from '../../../lib/server';

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

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return <DetailSignIn title="Văn bản tống đạt" what="văn bản tống đạt" />;
  }
  const cookie = await requestCookie();
  const items = await loadItems<Item>('/service-of-documents/documents', cookie);
  if (items === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Văn bản tống đạt</h1>
        <div className="state" role="alert">
          <h2>Không tải được văn bản</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  const d = items.find((x) => x.documentId === id);
  if (!d) notFound();
  const isAdmin = session.roles.includes('ADMIN');
  const handlers = isAdmin ? await loadHandlerOptions(cookie) : [];
  const done = d.status === 'DELIVERED' || d.status === 'UNDELIVERABLE';
  const statusLabel = SERVICE_STATUS_LABEL[d.status] ?? d.status;
  const handler = handlers.find((h) => h.userId === d.handlerUserId)?.label;
  return (
    <DetailFrame
      title={d.requestRef}
      meta={`Người nhận: ${d.recipientName}`}
      status={d.status}
      statusLabel={statusLabel}
      backHref="/tong-dat"
      backLabel="Tống đạt"
    >
      <section className="panel" aria-labelledby="doc-t">
        <h2 id="doc-t">Văn bản tống đạt</h2>
        <DefList
          rows={[
            ['Số yêu cầu', d.requestRef],
            ['Người nhận', d.recipientName],
            ['Hạn tống đạt', fmt.format(new Date(d.deadlineAt))],
            ['Số lần đã thử', String(d.attempts)],
            ['Người thực hiện', handler ?? (d.handlerUserId ? 'Đã phân công' : 'Chưa phân công')],
            ...(d.undeliverableReason
              ? ([
                  [
                    'Lý do không tống đạt được',
                    UNDELIVERABLE_LABEL[d.undeliverableReason] ?? d.undeliverableReason,
                  ],
                ] as const)
              : []),
          ]}
        />
      </section>
      <div className="grid gap-4">
        <section className="panel" aria-labelledby="res-t">
          <h2 id="res-t">Kết quả giao</h2>
          <p>
            <StatusPill status={d.status} label={statusLabel} />
          </p>
          {done ? (
            <p className="muted">Văn bản đã kết thúc, không còn thao tác.</p>
          ) : (
            <ServiceRowActions documentId={d.documentId} status={d.status} />
          )}
        </section>
        {done || !isAdmin ? null : (
          <section className="panel" aria-labelledby="assign-t">
            <h2 id="assign-t">Phân công</h2>
            <AssignHandler
              path={`service-of-documents/documents/${d.documentId}/handler`}
              options={handlers}
              currentId={d.handlerUserId}
            />
          </section>
        )}
        <p className="muted">
          <Link href="/tong-dat">Về danh sách</Link>
        </p>
      </div>
    </DetailFrame>
  );
}
