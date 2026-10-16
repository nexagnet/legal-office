import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CaseSteps, type Progress } from '../../../components/CaseSteps';
import { CaseActions } from '../../../components/CaseActions';
import { IssueCopyForm, RejectCaseForm } from '../../../components/CaseRejectCopy';
import { ChangeDecision } from '../../../components/ChangeRequestRow';
import { type CaseDetail, getJson } from '../../../lib/case-api';
import { currentSession, requestCookie } from '../../../lib/server';
import { CASE_STATUS_LABEL } from '../../../lib/messages';

export const dynamic = 'force-dynamic';

const WINDOW_MS = 48 * 60 * 60 * 1000;
const FIELD_LABEL: Record<string, string> = { title: 'Tiêu đề', description: 'Nội dung' };
const REQUEST_LABEL: Record<string, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
};
const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

interface ChangeItem {
  readonly id: string;
  readonly reason: string;
  readonly before: Record<string, string>;
  readonly after: Record<string, string>;
  readonly status: string;
  readonly createdAt: string;
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Hồ sơ Vi bằng</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem hồ sơ.
          </p>
        </div>
      </section>
    );
  }
  const cookie = await requestCookie();
  const c = await getJson<CaseDetail>(`/vibang/cases/${encodeURIComponent(id)}`, cookie);
  if (c === 404) notFound();
  if (c === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Hồ sơ Vi bằng</h1>
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  const changes = await getJson<{ items: ChangeItem[] }>(
    `/vibang/cases/${encodeURIComponent(id)}/change-requests`,
    cookie,
  );
  const items = typeof changes === 'object' ? changes.items : [];
  const progress = await getJson<Progress>(
    `/vibang/cases/${encodeURIComponent(id)}/progress`,
    cookie,
  );
  const isAdmin = session.roles.includes('ADMIN');
  const isFinal = c.status === 'RETURNED' || c.status === 'CANCELLED';
  const windowOpen = Date.now() < new Date(c.createdAt).getTime() + WINDOW_MS;
  return (
    <section aria-labelledby="t">
      <p>
        <Link href="/vi-bang">← Danh sách hồ sơ</Link>
      </p>
      <header className="panel case-head">
        <div className="case-head-row">
          <h1 id="t">{c.title}</h1>
          <span className="badge" data-status={c.status}>
            {CASE_STATUS_LABEL[c.status] ?? c.status}
          </span>
        </div>
        <p className="muted">{c.description || 'Chưa có nội dung ghi nhận.'}</p>
      </header>
      <div className="panels case-grid">
        {typeof progress === 'object' ? (
          <CaseSteps caseId={c.id} status={c.status} progress={progress} />
        ) : (
          <section className="panel">
            <h2>Tiến độ hồ sơ</h2>
            <p className="muted">Chưa tải được tiến độ hồ sơ.</p>
          </section>
        )}
        <section className="panel" aria-labelledby="info-t">
          <h2 id="info-t">Thông tin xử lý</h2>
          <dl className="info">
            <dt>THV phụ trách</dt>
            <dd>{c.responsibleThvUserId ? 'Đã phân công' : 'Chưa phân công'}</dd>
            <dt>Ngày tạo</dt>
            <dd>{fmt.format(new Date(c.createdAt))}</dd>
            <dt>Giới hạn sửa</dt>
            <dd>48 giờ từ ngày tạo</dd>
          </dl>
        </section>
      </div>
      {isAdmin && c.status !== 'RETURNED' && c.status !== 'CANCELLED' ? (
        <p>
          <Link className="primary btn-link" href={`/vi-bang/${c.id}/phan-cong`}>
            {c.responsibleThvUserId ? 'Đổi THV phụ trách' : 'Phân công THV'}
          </Link>
        </p>
      ) : null}
      {typeof progress === 'object' && progress.numberLabel ? (
        <p>
          <Link className="btn-link" href={`/vi-bang/${c.id}/thu-hoi-misa`}>
            Thu hồi xác nhận MISA
          </Link>{' '}
          <Link className="btn-link" href={`/vi-bang/${c.id}/sua-loi-n11`}>
            Sửa lỗi kỹ thuật N-11
          </Link>
        </p>
      ) : null}
      <CaseActions
        caseId={c.id}
        title={c.title}
        description={c.description ?? ''}
        windowOpen={windowOpen}
        isFinal={isFinal}
        canCancel={isAdmin}
      />
      {c.status === 'INTAKE' || c.status === 'ASSIGNED' ? <RejectCaseForm caseId={c.id} /> : null}
      {c.status === 'RETURNED' ? <IssueCopyForm caseId={c.id} /> : null}
      <h2>Đề nghị thay đổi</h2>
      {items.length === 0 ? (
        <p className="muted">Chưa có đề nghị thay đổi.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Đề nghị thay đổi của hồ sơ</caption>
            <thead>
              <tr>
                <th scope="col">Trường</th>
                <th scope="col">Cũ → Mới</th>
                <th scope="col">Lý do</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const field = Object.keys(r.after)[0] ?? '';
                return (
                  <tr key={r.id}>
                    <th scope="row">{FIELD_LABEL[field] ?? field}</th>
                    <td>
                      {r.before[field] ?? ''} → {r.after[field] ?? ''}
                    </td>
                    <td>{r.reason}</td>
                    <td>
                      {r.status === 'PENDING' ? (
                        isAdmin ? (
                          <Link href={`/vi-bang/${c.id}/duyet-sua`}>Xem và duyệt</Link>
                        ) : (
                          <ChangeDecision requestId={r.id} canDecide={false} />
                        )
                      ) : (
                        (REQUEST_LABEL[r.status] ?? r.status)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
