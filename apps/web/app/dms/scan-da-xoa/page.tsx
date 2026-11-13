import Link from 'next/link';
import { ErrorRetry } from '../../../components/ErrorRetry';
import { DataTable } from '../../../components/ui/data-table';
import { DMS_DOMAINS, VAN_THU_DOMAINS, loadMyDmsPermissions } from '../../../lib/dms';
import { deletedScanDownloadHref, loadDeletedScans } from '../../../lib/dms-deleted-scans';
import { loadPeopleNames } from '../../../lib/people';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;
const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});
const sizeLabel = (n: number | string) => `${Math.max(1, Math.round(Number(n) / 1024))} KB`;
const slugOf = (code: string | null) =>
  [...DMS_DOMAINS, ...VAN_THU_DOMAINS].find((d) => d.code === code)?.slug;

/**
 * Scan đã xóa 30 ngày (N6, Figma "Scan đã xóa"). Chỉ Admin xem và tải; không có nút khôi phục. File bị xóa hẳn khỏi kho khi hết
 * 30 ngày. Hồ sơ, STT và dòng sổ của file đó không bị ảnh hưởng.
 */
export default async function DeletedScansPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const sp = await searchParams;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Scan đã xóa 30 ngày</h1>
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
        <h1 id="t">Scan đã xóa 30 ngày</h1>
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
        <h1 id="t">Scan đã xóa 30 ngày</h1>
        <div className="state" role="status">
          <h2>Chỉ Admin được xem mục này</h2>
          <p>Scan đã xóa chỉ Admin xem và tải trong vòng 30 ngày.</p>
        </div>
      </section>
    );
  }
  const page = Math.max(1, Math.floor(Number(sp.p)) || 1);
  const list = await loadDeletedScans(cookie, {
    officeId,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  if (list === 'error' || list === 404) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Scan đã xóa 30 ngày</h1>
        <ErrorRetry
          title="Lỗi tải dữ liệu"
          message="Không tải được danh sách. Kiểm tra kết nối và thử lại."
        />
      </section>
    );
  }
  const names = await loadPeopleNames(
    cookie,
    list.rows.map((r) => r.deleted_by),
  );
  const pageCount = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const pageHref = (n: number) => (n > 1 ? `/quan-tri/scan-da-xoa?p=${n}` : '/quan-tri/scan-da-xoa');
  return (
    <section aria-labelledby="t">
      <h1 id="t">Scan đã xóa 30 ngày</h1>
      <p className="muted">Không khôi phục được. Sau 30 ngày file bị xóa hẳn.</p>
      {list.rows.length === 0 ? (
        <div className="state" role="status">
          <h2>Không có scan nào đang chờ xóa hẳn</h2>
          <p>File scan bị xóa sẽ hiện ở đây trong 30 ngày.</p>
        </div>
      ) : (
        <DataTable tableKey="dms-scan-da-xoa">
          <table>
            <caption className="sr-only">Scan đã xóa trong 30 ngày</caption>
            <thead>
              <tr>
                <th scope="col">Tệp</th>
                <th scope="col">Thuộc</th>
                <th scope="col">Người xóa</th>
                <th scope="col">Ngày xóa</th>
                <th scope="col">Lý do</th>
                <th scope="col">Còn lại</th>
                <th scope="col">Tải</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => {
                const slug = slugOf(r.domain);
                return (
                  <tr key={`${r.kind}-${r.file_id}`}>
                    <th scope="row">
                      {r.label}
                      <small className="dms-sub"> · {sizeLabel(r.size_bytes)}</small>
                    </th>
                    <td>
                      {r.kind === 'submission' && r.submission_id ? (
                        <Link href={`/dms/trinh-duyet/${r.submission_id}`}>
                          Bản trình · {r.submission_title}
                        </Link>
                      ) : r.case_id && slug ? (
                        <Link href={`/dms/${slug}/${r.case_id}`}>
                          Hồ sơ · {r.case_number ?? r.case_title}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{names.get(r.deleted_by) ?? '—'}</td>
                    <td>{fmt.format(new Date(r.deleted_at))}</td>
                    <td>{r.delete_reason}</td>
                    <td>
                      <span className="chip" data-tone={r.days_left <= 3 ? 'danger' : 'info'}>
                        {r.days_left} ngày
                      </span>
                    </td>
                    <td>
                      <a href={deletedScanDownloadHref(r)} download>
                        Tải
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataTable>
      )}
      <div className="dms-foot">
        <p>
          Hiển thị {list.rows.length} / {list.total} file.
        </p>
        {pageCount > 1 ? (
          <nav aria-label="Phân trang" className="dms-pager">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} rel="prev" aria-label="Trang trước">
                ‹
              </Link>
            ) : null}
            <span aria-current="page">
              {page} / {pageCount}
            </span>
            {page < pageCount ? (
              <Link href={pageHref(page + 1)} rel="next" aria-label="Trang sau">
                ›
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </section>
  );
}
