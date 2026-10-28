import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CorrespondenceActions } from '../../../components/CorrespondenceActions';
import { CorrespondenceAssign } from '../../../components/CorrespondenceAssign';
import { CorrespondenceUnlink } from '../../../components/CorrespondenceUnlink';
import { DetailFrame, DetailSignIn } from '../../../components/DetailFrame';
import {
  ATTACHMENT_ROLE_LABEL,
  CASE_KIND_LABEL,
  CORRESPONDENCE_EVENT_LABEL,
  linkedCaseHref,
  loadCorrespondence,
  progressSteps,
} from '../../../lib/correspondence';
import { CORRESPONDENCE_DIRECTION_LABEL, CORRESPONDENCE_STATUS_LABEL } from '../../../lib/messages';
import { loadPeopleNames } from '../../../lib/people';
import { currentSession, loadHandlerOptions, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const day = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});
const dateOf = (iso: string | null) => (iso ? day.format(new Date(iso)) : '—');

export default async function CorrespondenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return <DetailSignIn title="Công văn" what="công văn" />;
  }
  const cookie = await requestCookie();
  const c = await loadCorrespondence(cookie, id);
  if (c === 'notfound') notFound();
  if (c === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Công văn</h1>
        <div className="state" role="alert">
          <h2>Không tải được công văn</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  const inbound = c.direction === 'INBOUND';
  const open = c.status !== 'HANDLED' && c.status !== 'ISSUED';
  const canAssign =
    inbound &&
    c.status === 'RECEIVED' &&
    session.roles.some((r) => r === 'ADMIN' || r === 'TRUONG_VP' || r === 'THU_KY');
  const handlers = canAssign ? await loadHandlerOptions(cookie) : [];
  const names = await loadPeopleNames(cookie, [
    c.handlerUserId,
    ...c.events.map((e) => e.actor),
    ...c.attachments.map((a) => a.addedBy),
  ]);
  const who = (uid: string | null) => (uid ? (names.get(uid) ?? 'Người dùng văn phòng') : '—');
  const caseHref = linkedCaseHref(c.caseKind, c.caseId);
  const steps = progressSteps(c);
  const statusLabel =
    c.overdue && open ? 'Quá hạn' : (CORRESPONDENCE_STATUS_LABEL[c.status] ?? c.status);
  const dirLabel = CORRESPONDENCE_DIRECTION_LABEL[c.direction] ?? c.direction;
  return (
    <DetailFrame
      title={c.refNo ?? 'Công văn chưa có số'}
      meta={`${dirLabel} · ${c.subject}`}
      status={c.overdue && open ? 'OVERDUE' : c.status}
      statusLabel={statusLabel}
      backHref="/cong-van"
      backLabel="Công văn"
    >
      <div className="grid gap-4">
        <ol className="panel flex flex-wrap gap-4" aria-label="Tiến trình công văn">
          {steps.map((s, i) => (
            <li
              key={s.label}
              aria-current={s.state === 'current' ? 'step' : undefined}
              data-state={s.state}
              className="flex items-center gap-2 text-sm"
            >
              <span
                aria-hidden="true"
                className="grid size-7 place-items-center rounded-full border border-line-strong text-xs font-bold"
              >
                {s.state === 'done' ? '✓' : i + 1}
              </span>
              <span>
                {s.label}
                <span className="sr-only">
                  {s.state === 'done' ? ' (đã xong)' : s.state === 'current' ? ' (hiện tại)' : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <div className="panel">
          <h2>Thông tin công văn</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm max-sm:grid-cols-1">
            <div>
              <dt className="text-muted">{inbound ? 'Số, ký hiệu đến' : 'Số, ký hiệu'}</dt>
              <dd>{c.refNo ?? 'Chưa có số'}</dd>
            </div>
            <div>
              <dt className="text-muted">Loại văn bản</dt>
              <dd>{c.docType}</dd>
            </div>
            <div>
              <dt className="text-muted">{inbound ? 'Nơi gửi' : 'Nơi nhận'}</dt>
              <dd>{c.counterparty}</dd>
            </div>
            <div>
              <dt className="text-muted">{inbound ? 'Ngày nhận' : 'Ngày ban hành'}</dt>
              <dd>{dateOf(inbound ? c.receivedOn : c.issuedOn)}</dd>
            </div>
            {inbound ? (
              <div>
                <dt className="text-muted">Hạn xử lý</dt>
                <dd>{c.dueAt ? dateOf(c.dueAt) : 'Không đặt hạn'}</dd>
              </div>
            ) : (
              <div>
                <dt className="text-muted">Hình thức gửi</dt>
                <dd>{c.sendMethod ?? '—'}</dd>
              </div>
            )}
            <div className="col-span-2 max-sm:col-span-1">
              <dt className="text-muted">Trích yếu</dt>
              <dd>{c.subject}</dd>
            </div>
            {c.resultNote ? (
              <div className="col-span-2 max-sm:col-span-1">
                <dt className="text-muted">Kết quả xử lý</dt>
                <dd>
                  {c.resultNote}
                  {c.archiveRef ? <span className="muted"> · Lưu tại: {c.archiveRef}</span> : null}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="panel">
          <h2>Hồ sơ liên quan</h2>
          {c.caseKind && c.caseId ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-3">
              <span>
                <span className="pill">{CASE_KIND_LABEL[c.caseKind] ?? c.caseKind}</span>{' '}
                {caseHref ? <Link href={caseHref}>Mở hồ sơ</Link> : null}
              </span>
              {open ? <CorrespondenceUnlink id={c.id} /> : null}
            </div>
          ) : (
            <p className="muted">Chưa gắn hồ sơ nào.</p>
          )}
        </div>

        <div className="panel">
          <h2>Lịch sử xử lý</h2>
          {c.events.length === 0 ? (
            <p className="muted">Chưa có hoạt động.</p>
          ) : (
            <ol className="grid gap-2 text-sm">
              {[...c.events].reverse().map((e, i) => (
                <li key={`${e.at}-${i}`}>
                  <strong>{CORRESPONDENCE_EVENT_LABEL[e.event] ?? e.event}</strong> ·{' '}
                  {dateTime.format(new Date(e.at))} · {who(e.actor)}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        {inbound ? (
          <div className="panel">
            <h2>Người xử lý</h2>
            <p>{c.handlerUserId ? who(c.handlerUserId) : 'Chưa giao'}</p>
            {c.dueAt ? <p className="muted">Hạn xử lý: {dateOf(c.dueAt)}</p> : null}
            {canAssign ? (
              <CorrespondenceAssign id={c.id} options={handlers} currentId={c.handlerUserId} />
            ) : null}
          </div>
        ) : null}

        {open ? (
          <div className="panel">
            <h2>Bước tiếp theo</h2>
            <CorrespondenceActions id={c.id} direction={c.direction} status={c.status} />
          </div>
        ) : null}

        <div className="panel">
          <h2>Tệp đính kèm</h2>
          {c.attachments.length === 0 ? (
            <p className="muted">Chưa có tệp đính kèm.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {c.attachments.map((a) => (
                <li key={a.id}>
                  <a href={`/api/office/correspondence/${c.id}/files/${a.id}`}>{a.name}</a>
                  <span className="muted">
                    {' '}
                    · {ATTACHMENT_ROLE_LABEL[a.role] ?? a.role} · {dateOf(a.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted">Công văn đến có hạn được nhắc ở Tổng quan và Thông báo.</p>
        </div>
      </div>
    </DetailFrame>
  );
}
