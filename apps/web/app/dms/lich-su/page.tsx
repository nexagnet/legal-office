import Link from 'next/link';
import { ErrorRetry } from '../../../components/ErrorRetry';
import { DataTable } from '../../../components/ui/data-table';
import { PermissionLogExport } from '../../../components/permissions/PermissionLogExport';
import { TabNav } from '../../../components/ui/tab-nav';
import { DMS_DOMAINS, VAN_THU_DOMAINS, loadMyDmsPermissions } from '../../../lib/dms';
import {
  ACTIVITY_GROUPS,
  actionLabel,
  activityNote,
  isActivityGroup,
  loadActivity,
  type ActivityRow,
} from '../../../lib/dms-activity';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'Asia/Ho_Chi_Minh',
});
const slugOf = (code: string | null) =>
  [...DMS_DOMAINS, ...VAN_THU_DOMAINS].find((d) => d.code === code)?.slug;

function Target({ row }: { readonly row: ActivityRow }) {
  const slug = slugOf(row.domain);
  if (row.case_id && slug)
    return (
      <Link href={`/dms/${slug}/${row.case_id}`}>Hồ sơ · {row.case_number ?? row.case_title}</Link>
    );
  if (row.submission_id)
    return (
      <Link href={`/dms/trinh-duyet/${row.submission_id}`}>Bản trình · {row.submission_title}</Link>
    );
  if (row.target_type === 'branch') return <Link href="/quan-tri/chi-nhanh">Chi nhánh</Link>;
  if (row.target_type === 'office') return <Link href="/quan-tri/cai-dat">Văn phòng</Link>;
  if (row.target_type === 'user')
    return <Link href={`/quan-tri/phan-quyen/nguoi-dung/${row.target_id}`}>Tài khoản</Link>;
  if (row.target_type === 'permission_request')
    return <Link href={`/quan-tri/phan-quyen/yeu-cau/${row.target_id}`}>Thay đổi quyền</Link>;
  return <span>—</span>;
}

/**
 * Lịch sử hoạt động (Figma "Lịch sử hoạt động"): ai làm gì, lúc nào, trên hồ sơ, tài liệu, file hay bản trình nào. Chỉ đọc,
 * từ nhật ký không sửa được; Admin và người có quyền duyệt thay đổi quyền xem. Giờ theo múi Việt Nam.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; q?: string; p?: string }>;
}) {
  const sp = await searchParams;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Lịch sử hoạt động</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  if (!officeId) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Lịch sử hoạt động</h1>
        <div className="state" role="status">
          <h2>Chưa gắn văn phòng</h2>
        </div>
      </section>
    );
  }
  const cookie = await requestCookie();
  const permissions = await loadMyDmsPermissions(cookie, officeId);
  if (!permissions.includes('dms.permission.approve')) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Lịch sử hoạt động</h1>
        <div className="state" role="status">
          <h2>Bạn chưa có quyền xem mục này</h2>
          <p>Lịch sử hoạt động chỉ dành cho Admin và người có quyền duyệt thay đổi quyền.</p>
        </div>
      </section>
    );
  }
  const group = isActivityGroup(sp.group) ? sp.group : undefined;
  const q = (sp.q ?? '').slice(0, 200);
  const page = Math.max(1, Math.floor(Number(sp.p)) || 1);
  const list = await loadActivity(cookie, {
    officeId,
    group,
    q,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  if (list === 'error' || list === 404) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Lịch sử hoạt động</h1>
        <ErrorRetry
          title="Lỗi tải dữ liệu"
          message="Không tải được lịch sử. Kiểm tra kết nối và thử lại."
        />
      </section>
    );
  }
  const href = (g: string | undefined, n = 1) => {
    const p = new URLSearchParams();
    if (g) p.set('group', g);
    if (q) p.set('q', q);
    if (n > 1) p.set('p', String(n));
    const s = p.toString();
    return s ? `/dms/lich-su?${s}` : '/dms/lich-su';
  };
  const pageCount = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  return (
    <section aria-labelledby="t">
      <h1 id="t">Lịch sử hoạt động</h1>
      <p className="muted">Mới nhất ở trên, giờ Việt Nam.</p>
      <TabNav
        label="Nhóm hoạt động"
        soft
        active={group ?? 'all'}
        tabs={[
          { key: 'all', label: 'Tất cả', href: href(undefined) },
          ...ACTIVITY_GROUPS.map(([k, label]) => ({ key: k, label, href: href(k) })),
        ]}
      />
      {group === 'permission' && permissions.includes('dms.audit.export') ? (
        <p>
          <PermissionLogExport officeId={officeId} />
        </p>
      ) : null}
      <form method="get" action="/dms/lich-su" role="search" className="dms-filters">
        {group ? <input type="hidden" name="group" value={group} /> : null}
        <div>
          <label>
            <span className="sr-only">Tìm hoạt động</span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Tìm theo số hồ sơ, tên hồ sơ, bản trình hoặc người làm"
              maxLength={200}
            />
          </label>
        </div>
        <button type="submit">Tìm</button>
      </form>
      {list.rows.length === 0 ? (
        <div className="state" role="status">
          <h2>Chưa có hoạt động</h2>
          <p>{q || group ? 'Không có hoạt động nào khớp bộ lọc.' : 'Hoạt động sẽ hiện ở đây.'}</p>
        </div>
      ) : (
        <DataTable tableKey="dms-lich-su">
          <table>
            <caption className="sr-only">Lịch sử hoạt động</caption>
            <thead>
              <tr>
                <th scope="col">Thời gian</th>
                <th scope="col">Người làm</th>
                <th scope="col">Hoạt động</th>
                <th scope="col">Đối tượng</th>
                <th scope="col">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={String(r.id)}>
                  <td>{fmt.format(new Date(r.at))}</td>
                  <td>{r.actor_label ?? 'Hệ thống'}</td>
                  <th scope="row">{actionLabel(r.action)}</th>
                  <td>
                    <Target row={r} />
                  </td>
                  <td>{activityNote(r) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}
      <div className="dms-foot">
        <p>
          Hiển thị {list.rows.length} / {list.total} hoạt động.
        </p>
        {pageCount > 1 ? (
          <nav aria-label="Phân trang" className="dms-pager">
            {page > 1 ? (
              <Link href={href(group, page - 1)} rel="prev" aria-label="Trang trước">
                ‹
              </Link>
            ) : null}
            <span aria-current="page">
              {page} / {pageCount}
            </span>
            {page < pageCount ? (
              <Link href={href(group, page + 1)} rel="next" aria-label="Trang sau">
                ›
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </section>
  );
}
