import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignHandler } from '../../../components/AssignHandler';
import { DetailFrame, DetailSignIn } from '../../../components/DetailFrame';
import type { DialogAction } from '../../../components/DialogActionMenu';
import { ServiceReminder, ServiceResultSheet } from '../../../components/ServiceResult';
import { DefList } from '../../../components/ui/def-list';
import { Person } from '../../../components/ui/avatar';
import { StepCards, type StepCard } from '../../../components/ui/step-cards';
import { loadItems } from '../../../lib/load-items';
import {
  ATTEMPT_RESULT_LABEL,
  SERVICE_STATUS_LABEL,
  UNDELIVERABLE_LABEL,
} from '../../../lib/messages';
import { currentSession, loadHandlerOptions, requestCookie } from '../../../lib/server';
import { personName } from '../../../lib/avatar';
import { deadlineView } from '../../../lib/service-view';

export const dynamic = 'force-dynamic';

interface Attempt {
  readonly seq: number;
  readonly outcome: string;
  readonly late: boolean;
  readonly at: string;
  readonly actorUserId: string;
  readonly hasEvidence: boolean;
}

const atFmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

interface Item {
  readonly documentId: string;
  readonly requestRef: string;
  readonly recipientName: string;
  readonly address: string;
  readonly deadlineAt: string;
  readonly status: string;
  readonly undeliverableReason: string | null;
  readonly handlerUserId: string | null;
  readonly attempts: number;
}

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
  const handlers = await loadHandlerOptions(cookie);
  const attemptList = await loadItems<Attempt>(
    `/service-of-documents/documents/${d.documentId}/attempts`,
    cookie,
  );
  const done = d.status === 'DELIVERED' || d.status === 'UNDELIVERABLE';
  const statusLabel = SERVICE_STATUS_LABEL[d.status] ?? d.status;
  const handler = handlers.find((h) => h.userId === d.handlerUserId)?.label;
  const handlerText = handler ?? (d.handlerUserId ? 'Đã phân công' : 'Chưa giao người xử lý');
  const labelOf = (uid: string | null) => handlers.find((h) => h.userId === uid)?.label;
  const handlerView = handler ? (
    <Person name={personName(handler)} id={d.handlerUserId} />
  ) : (
    handlerText
  );
  const dl = deadlineView(d.deadlineAt, done);
  const assignPath = `service-of-documents/documents/${d.documentId}/handler`;
  const assigned = d.handlerUserId !== null;
  const tried = d.attempts === 0 ? 'Chưa đi lần nào.' : `Đã thử ${d.attempts} lần.`;

  const steps: StepCard[] = [
    {
      key: 'assign',
      role: 'Admin hoặc Trưởng VP',
      title: 'Giao người xử lý',
      state: assigned ? 'done' : 'current',
      description: assigned
        ? handlerView
        : isAdmin
          ? 'Chọn người sẽ đi tống đạt. Chưa giao thì chưa ghi nhận được lần tống đạt nào.'
          : 'Đang chờ Admin hoặc Trưởng VP giao người xử lý.',
      action:
        !assigned && isAdmin ? (
          <AssignHandler path={assignPath} options={handlers} currentId={null} />
        ) : undefined,
    },
    {
      key: 'serve',
      role: 'Người xử lý',
      title: 'Đi tống đạt cho người nhận',
      state: done ? 'done' : assigned ? 'current' : 'todo',
      failed: d.status === 'UNDELIVERABLE',
      description: assigned
        ? `${tried} ${done ? '' : 'Hãy ghi lại kết quả sau mỗi lần đi.'}`.trim()
        : 'Mở khi đã giao người xử lý.',
      action:
        !done && assigned ? (
          <ServiceResultSheet documentId={d.documentId} attempts={d.attempts} />
        ) : undefined,
    },
    {
      key: 'finish',
      role: 'Hoàn tất',
      title:
        d.status === 'UNDELIVERABLE'
          ? 'Kết luận không tống đạt được'
          : d.status === 'DELIVERED'
            ? 'Đã tống đạt, bằng chứng đã lưu'
            : 'Có bằng chứng hoặc kết luận',
      state: done ? 'done' : 'todo',
      failed: d.status === 'UNDELIVERABLE',
      description: d.undeliverableReason
        ? `Lý do: ${UNDELIVERABLE_LABEL[d.undeliverableReason] ?? d.undeliverableReason}`
        : done
          ? 'Văn bản đã kết thúc, không còn thao tác.'
          : 'Mở khi bước trước xong.',
    },
  ];

  const actions: DialogAction[] = done
    ? []
    : [
        ...(assigned
          ? [
              {
                key: 'remind',
                label: 'Nhắc người xử lý',
                title: 'Nhắc người xử lý',
                body: <ServiceReminder documentId={d.documentId} />,
              },
            ]
          : []),
        ...(assigned && isAdmin
          ? [
              {
                key: 'reassign',
                label: 'Đổi người thực hiện',
                title: 'Đổi người thực hiện',
                body: (
                  <AssignHandler path={assignPath} options={handlers} currentId={d.handlerUserId} />
                ),
              },
            ]
          : []),
      ];

  return (
    <DetailFrame
      title={d.requestRef}
      meta={`Người nhận: ${d.recipientName}`}
      status={d.status}
      statusLabel={statusLabel}
      backHref="/tong-dat"
      backLabel="Tống đạt"
      actions={actions}
    >
      <div className="grid gap-4">
        <div className="grid gap-3">
          <h2 className="m-0 text-[13px] font-bold text-muted">Quy trình 3 bước</h2>
          <StepCards steps={steps} label="Các bước tống đạt" />
        </div>
        <section className="panel" aria-labelledby="hist-t">
          <h2 id="hist-t">Các lần tống đạt</h2>
          {attemptList === 'error' ? (
            <p className="muted">Không tải được lịch sử các lần. Vui lòng thử lại sau.</p>
          ) : attemptList.length === 0 ? (
            <p className="muted">Chưa đi lần nào.</p>
          ) : (
            <ol className="m-0 grid list-none gap-3 p-0">
              {[...attemptList].reverse().map((a) => (
                <li
                  key={a.seq}
                  className="grid gap-1 border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <span className="font-semibold">
                    Lần {a.seq} · {atFmt.format(new Date(a.at))}
                  </span>
                  <span className="text-[13px] text-muted">
                    {ATTEMPT_RESULT_LABEL[a.outcome] ?? a.outcome}
                    {a.late ? ' · quá hạn' : ''}
                    {a.hasEvidence ? ' · có bằng chứng' : ''}
                  </span>
                  {labelOf(a.actorUserId) ? (
                    <span className="text-[13px]">
                      <Person
                        name={personName(labelOf(a.actorUserId) ?? '')}
                        id={a.actorUserId}
                        size="sm"
                      />
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      <section className="panel" aria-labelledby="doc-t">
        <h2 id="doc-t">Thông tin văn bản</h2>
        <DefList
          rows={[
            ['Số yêu cầu', d.requestRef],
            ['Người nhận', d.recipientName],
            ['Địa chỉ', d.address],
            ['Hạn tống đạt', `${dl.date}${dl.note ? ` · ${dl.note}` : ''}`],
            ['Số lần đã thử', String(d.attempts)],
            ['Người xử lý', handlerView],
          ]}
        />
        <p className="muted">
          Không niêm yết hay gửi tự động. Kết luận &quot;Không tống đạt được&quot; cần lý do và ít
          nhất một lần đã thử.
        </p>
        <p className="muted">
          <Link href="/tong-dat">Về danh sách</Link>
        </p>
      </section>
    </DetailFrame>
  );
}
