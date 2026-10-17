import Link from 'next/link';
import { AccessRequestActions } from '../../components/AccessRequestActions';
import { AccessRequestForm } from '../../components/AccessRequestForm';
import { CalendarSettings } from '../../components/CalendarSettings';
import { ThvCardsForm, type ThvCard } from '../../components/ThvCardsForm';
import { loadCalendar } from '../../lib/deadlines-api';
import { API_URL, currentSession, requestCookie } from '../../lib/server';
import { ACCESS_KIND_LABEL, ACCESS_STATUS_LABEL, ROLE_LABEL } from '../../lib/messages';

export const dynamic = 'force-dynamic';

interface Member {
  readonly userId: string;
  readonly label: string;
  readonly role: string | null;
  readonly legalSigner: boolean;
  readonly hasLogin: boolean;
  readonly branches: readonly string[];
}

interface AccessRow {
  readonly id: string;
  readonly targetLabel: string;
  readonly kind: string;
  readonly role: string | null;
  readonly flag: boolean | null;
  readonly branchName: string | null;
  readonly status: string;
  readonly reason: string;
  readonly decisionNote: string | null;
}

function describe(r: AccessRow): string {
  const kind = ACCESS_KIND_LABEL[r.kind] ?? r.kind;
  if (r.role) return `${kind}: ${ROLE_LABEL[r.role] ?? r.role}`;
  if (r.kind === 'SET_LEGAL_SIGNER') return `${kind}: ${r.flag ? 'cấp' : 'thu hồi'}`;
  return `${kind}: ${r.branchName ?? ''}`;
}

async function loadRequests(
  cookie: string | null,
  officeId: string,
): Promise<AccessRow[] | 'error'> {
  try {
    const res = await fetch(
      `${API_URL}/admin/access-requests?officeId=${encodeURIComponent(officeId)}`,
      { headers: cookie ? { cookie } : {}, cache: 'no-store' },
    );
    if (!res.ok) return 'error';
    return (await res.json()) as AccessRow[];
  } catch {
    return 'error';
  }
}

async function loadThvCards(cookie: string | null, officeId: string): Promise<ThvCard[]> {
  try {
    const res = await fetch(
      `${API_URL}/office/thv-cards?officeId=${encodeURIComponent(officeId)}`,
      { headers: cookie ? { cookie } : {}, cache: 'no-store' },
    );
    return res.ok ? ((await res.json()) as ThvCard[]) : [];
  } catch {
    return [];
  }
}

async function load(cookie: string | null, officeId: string): Promise<Member[] | 'error'> {
  try {
    const res = await fetch(`${API_URL}/office/members?officeId=${encodeURIComponent(officeId)}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return (await res.json()) as Member[];
  } catch {
    return 'error';
  }
}

export default async function AdminPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Quản trị</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem quản trị.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  const cookie = await requestCookie();
  const members = officeId ? await load(cookie, officeId) : [];
  const requests = officeId ? await loadRequests(cookie, officeId) : [];
  const calendar = officeId ? await loadCalendar(cookie, officeId) : null;
  const thvCards = officeId ? await loadThvCards(cookie, officeId) : [];
  const isAdmin = session.roles.includes('ADMIN');
  const people =
    members === 'error'
      ? []
      : [...new Map(members.map((m) => [m.userId, { userId: m.userId, label: m.label }])).values()];
  const thvPeople =
    members === 'error'
      ? []
      : [
          ...new Map(
            members
              .filter((m) => m.role === 'THV')
              .map((m) => [m.userId, { userId: m.userId, label: m.label }]),
          ).values(),
        ];
  return (
    <section aria-labelledby="t">
      <div className="page-head">
        <div>
          <h1 id="t">Nhân sự và phân quyền</h1>
          <p className="muted">
            Danh bạ thành viên, vai trò, chi nhánh được cấp và quyền ký pháp lý. Chỉ xem: việc cấp
            hoặc đổi vai và quyền ký chưa mở trên giao diện vì là quyết định mở rộng quyền, cần chủ
            xác nhận cách làm.
          </p>
        </div>
        {officeId && isAdmin ? (
          <a className="primary btn-link" href="#de-xuat-quyen">
            + Đề xuất cấp quyền
          </a>
        ) : null}
      </div>
      {members === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được danh bạ</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : members.length === 0 ? (
        isAdmin ? null : (
          <p className="muted">Chỉ Admin của văn phòng xem được danh bạ thành viên.</p>
        )
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Thành viên văn phòng</caption>
            <thead>
              <tr>
                <th scope="col">Nhân viên</th>
                <th scope="col">Vai trò</th>
                <th scope="col">Quyền ký pháp lý</th>
                <th scope="col">Phạm vi địa điểm</th>
                <th scope="col">Đăng nhập</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={`${m.userId}-${m.role ?? 'none'}`}>
                  <th scope="row">{m.label}</th>
                  <td>
                    {m.role ? (
                      (ROLE_LABEL[m.role] ?? m.role)
                    ) : (
                      <span className="muted">Chưa có vai</span>
                    )}
                  </td>
                  <td>{m.legalSigner ? 'Có' : 'Không'}</td>
                  <td>
                    {m.branches.length > 0 ? (
                      m.branches.join(', ')
                    ) : (
                      <span className="muted">Không</span>
                    )}
                  </td>
                  <td>{m.hasLogin ? 'Đã có tài khoản' : <span className="muted">Chưa có</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 id="req-t">Đề xuất cấp quyền</h2>
      {requests === 'error' ? (
        <div className="state" role="alert">
          <h3>Không tải được đề xuất</h3>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="state" role="status">
          <h3>Chưa có đề xuất</h3>
          <p>Chỉ Admin và Trưởng văn phòng xem được đề xuất cấp quyền.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table aria-labelledby="req-t">
            <thead>
              <tr>
                <th scope="col">Thành viên</th>
                <th scope="col">Nội dung</th>
                <th scope="col">Lý do</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.targetLabel}</th>
                  <td>{describe(r)}</td>
                  <td>
                    {r.reason}
                    {r.decisionNote ? <span className="muted"> · {r.decisionNote}</span> : null}
                  </td>
                  <td>{ACCESS_STATUS_LABEL[r.status] ?? r.status}</td>
                  <td>
                    {r.status === 'PENDING' ? (
                      <AccessRequestActions id={r.id} roles={session.roles} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <aside className="panel note-panel">
        <p className="muted">
          Phân quyền theo vai trò, địa điểm và hồ sơ; quyền hành nghề pháp lý không thể thay bằng
          quyền Admin ứng dụng.
        </p>
      </aside>
      {officeId && isAdmin ? (
        <div id="de-xuat-quyen">
          <AccessRequestForm officeId={officeId} people={people} branches={session.branches} />
        </div>
      ) : null}
      {officeId ? (
        <ThvCardsForm officeId={officeId} people={thvPeople} cards={thvCards} canEdit={isAdmin} />
      ) : null}
      {officeId && calendar !== null && calendar === 'error' ? (
        <section className="calendar-settings" aria-labelledby="cal-t">
          <h2 id="cal-t">Lịch làm việc</h2>
          <div className="state" role="alert">
            <h3>Không tải được lịch làm việc</h3>
            <p>Vui lòng thử lại sau.</p>
          </div>
        </section>
      ) : officeId && calendar && calendar !== 'error' ? (
        <CalendarSettings officeId={officeId} calendar={calendar} canEdit={isAdmin} />
      ) : null}
    </section>
  );
}
