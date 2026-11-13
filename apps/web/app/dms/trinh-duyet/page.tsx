import Link from 'next/link';
import { ErrorRetry } from '../../../components/ErrorRetry';
import { SubmissionViewTabs } from '../../../components/SubmissionViewTabs';
import { NewSubmissionButton } from '../../../components/SubmissionActions';
import { DataTable } from '../../../components/ui/data-table';
import { TabNav } from '../../../components/ui/tab-nav';
import { loadMyDmsPermissions } from '../../../lib/dms';
import {
  SUBMISSION_STATUSES,
  SUBMISSION_STATUS_LABEL,
  isSubmissionStatus,
  loadSubmissions,
} from '../../../lib/dms-submissions';
import { loadPeopleNames } from '../../../lib/people';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;
const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});
const TONE = { PENDING: 'warn', APPROVED: 'ok', REJECTED: 'danger' } as const;

/**
 * Trình / Duyệt (N4, Figma "Trình / Duyệt"): thay "Yêu cầu sửa đổi". Mọi thành viên gửi được bản trình (tiêu đề, mô tả,
 * bản scan); chỉ Admin duyệt hoặc từ chối. Người gửi chỉ thấy bản của mình, Admin thấy cả văn phòng.
 */
export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; p?: string }>;
}) {
  const sp = await searchParams;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Trình / Duyệt</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem bản trình.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  if (!officeId) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Trình / Duyệt</h1>
        <div className="state" role="status">
          <h2>Chưa gắn văn phòng</h2>
          <p>Tài khoản chưa thuộc văn phòng nào.</p>
        </div>
      </section>
    );
  }
  const status = isSubmissionStatus(sp.status) ? sp.status : undefined;
  const q = (sp.q ?? '').slice(0, 200);
  const page = Math.max(1, Math.floor(Number(sp.p)) || 1);
  const cookie = await requestCookie();
  const [list, permissions] = await Promise.all([
    loadSubmissions(cookie, {
      officeId,
      status,
      q,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    loadMyDmsPermissions(cookie, officeId),
  ]);
  if (list === 'error' || list === 404) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Trình / Duyệt</h1>
        <ErrorRetry
          title="Lỗi tải dữ liệu"
          message="Không tải được danh sách bản trình. Kiểm tra kết nối và thử lại."
        />
      </section>
    );
  }
  const isAdmin = permissions.includes('dms.permission.approve');
  const names = await loadPeopleNames(
    cookie,
    list.rows.map((r) => r.submitted_by),
  );
  const href = (s: string | undefined, n = 1) => {
    const p = new URLSearchParams();
    if (s) p.set('status', s);
    if (q) p.set('q', q);
    if (n > 1) p.set('p', String(n));
    const str = p.toString();
    return str ? `/dms/trinh-duyet?${str}` : '/dms/trinh-duyet';
  };
  const pageCount = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  return (
    <section aria-labelledby="t">
      <h1 id="t">Trình / Duyệt</h1>
      <p className="muted">
        {isAdmin ? 'Bạn duyệt hoặc từ chối từng bản trình.' : 'Bạn chỉ thấy bản trình do mình gửi.'}
      </p>
      <SubmissionViewTabs active="submissions" />
      <TabNav
        label="Trạng thái bản trình"
        soft
        active={status ?? 'all'}
        tabs={[
          { key: 'all', label: 'Tất cả', href: href(undefined) },
          ...SUBMISSION_STATUSES.map((s) => ({
            key: s,
            label: SUBMISSION_STATUS_LABEL[s],
            href: href(s),
          })),
        ]}
        action={<NewSubmissionButton officeId={officeId} />}
      />
      <form method="get" action="/dms/trinh-duyet" role="search" className="dms-filters search-bar">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <label>
          <span className="sr-only">Tìm bản trình</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Tìm theo tiêu đề hoặc mô tả"
            maxLength={200}
          />
        </label>
        <button type="submit">Tìm</button>
      </form>
      {list.rows.length === 0 ? (
        <div className="state" role="status">
          <h2>Chưa có bản trình</h2>
          <p>
            {q || status
              ? 'Không có bản trình nào khớp bộ lọc.'
              : 'Bấm "+ Trình mới" để gửi tiêu đề, mô tả và bản scan cho Admin duyệt.'}
          </p>
        </div>
      ) : (
        <DataTable tableKey="dms-trinh-duyet-list">
          <table>
            <caption className="sr-only">Danh sách bản trình</caption>
            <thead>
              <tr>
                <th scope="col">Tiêu đề</th>
                <th scope="col">Người gửi</th>
                <th scope="col">Ngày gửi</th>
                <th scope="col">Scan</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <Link href={`/dms/trinh-duyet/${r.id}`}>{r.title}</Link>
                    {r.case_number ? (
                      <small className="dms-sub"> · Hồ sơ {r.case_number}</small>
                    ) : null}
                  </th>
                  <td>{names.get(r.submitted_by) ?? '—'}</td>
                  <td>{fmt.format(new Date(r.submitted_at))}</td>
                  <td>{r.file_count} file</td>
                  <td>
                    <span className="chip" data-tone={TONE[r.status]}>
                      {SUBMISSION_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}
      <div className="dms-foot">
        <p>
          Hiển thị {list.rows.length} / {list.total} bản trình.
        </p>
        {pageCount > 1 ? (
          <nav aria-label="Phân trang" className="dms-pager">
            {page > 1 ? (
              <Link href={href(status, page - 1)} rel="prev" aria-label="Trang trước">
                ‹
              </Link>
            ) : null}
            <span aria-current="page">
              {page} / {pageCount}
            </span>
            {page < pageCount ? (
              <Link href={href(status, page + 1)} rel="next" aria-label="Trang sau">
                ›
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </section>
  );
}
