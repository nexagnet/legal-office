import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignThv, type ThvOption } from '../../../components/AssignThv';
import { CaseSteps, type Progress } from '../../../components/CaseSteps';
import { CaseActions } from '../../../components/CaseActions';
import { ChangeDecision } from '../../../components/ChangeRequestRow';
import { API_URL, currentSession, requestCookie } from '../../../lib/server';
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

interface CaseDetail {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly responsibleThvUserId: string | null;
}
interface ChangeItem {
  readonly id: string;
  readonly reason: string;
  readonly before: Record<string, string>;
  readonly after: Record<string, string>;
  readonly status: string;
  readonly createdAt: string;
}

async function getJson<T>(path: string, cookie: string | null): Promise<T | 404 | 'error'> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (res.status === 404) return 404;
    if (!res.ok) return 'error';
    return (await res.json()) as T;
  } catch {
    return 'error';
  }
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
  const thv = isAdmin
    ? await getJson<{ items: ThvOption[] }>('/vibang/thv', cookie)
    : { items: [] as ThvOption[] };
  const thvOptions = typeof thv === 'object' ? thv.items : [];
  const isFinal = c.status === 'RETURNED' || c.status === 'CANCELLED';
  const windowOpen = Date.now() < new Date(c.createdAt).getTime() + WINDOW_MS;
  return (
    <section aria-labelledby="t">
      <p>
        <Link href="/vi-bang">← Danh sách hồ sơ</Link>
      </p>
      <h1 id="t">{c.title}</h1>
      <p>
        <span className="badge" data-status={c.status}>
          {CASE_STATUS_LABEL[c.status] ?? c.status}
        </span>{' '}
        <span className="muted">
          Tạo {fmt.format(new Date(c.createdAt))} ·{' '}
          {c.responsibleThvUserId ? 'Đã phân công THV' : 'Chưa phân công THV'}
        </span>
      </p>
      <p>{c.description || <span className="muted">Chưa có nội dung ghi nhận.</span>}</p>
      {typeof progress === 'object' ? (
        <CaseSteps caseId={c.id} status={c.status} progress={progress} roles={session.roles} />
      ) : null}
      {isAdmin && c.status !== 'RETURNED' && c.status !== 'CANCELLED' ? (
        <AssignThv caseId={c.id} options={thvOptions} currentThvId={c.responsibleThvUserId} />
      ) : null}
      <CaseActions
        caseId={c.id}
        title={c.title}
        description={c.description ?? ''}
        windowOpen={windowOpen}
        isFinal={isFinal}
        canCancel={isAdmin}
      />
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
                        <ChangeDecision requestId={r.id} canDecide={isAdmin} />
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
