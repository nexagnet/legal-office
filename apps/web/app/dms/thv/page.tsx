import Link from 'next/link';
import { ErrorRetry } from '../../../components/ErrorRetry';
import { SubmissionViewTabs } from '../../../components/SubmissionViewTabs';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { domainBySlug, DMS_DOMAINS, loadThvPending } from '../../../lib/dms';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const day = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

export default async function DmsThvPending() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Hồ sơ nháp chờ tôi lưu</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem.
          </p>
        </div>
      </section>
    );
  }
  const rows = await loadThvPending(await requestCookie());
  return (
    <section aria-labelledby="t">
      <h1 id="t">Hồ sơ nháp chờ tôi lưu</h1>
      <SubmissionViewTabs active="drafts" />
      {rows === 'error' ? (
        <ErrorRetry
          title="Lỗi tải dữ liệu"
          message="Không tải được danh sách. Kiểm tra kết nối và thử lại."
        />
      ) : rows.length === 0 ? (
        <div className="state" role="status">
          <h2>Không có hồ sơ nào chờ bạn xác nhận</h2>
        </div>
      ) : (
        <>
          <DataTable tableKey="dms-thv-pending">
            <table>
              <caption className="sr-only">Hồ sơ nháp chờ bạn xác nhận</caption>
              <thead>
                <tr>
                  <th scope="col">Hồ sơ nháp</th>
                  <th scope="col">Nghiệp vụ</th>
                  <th scope="col">Ngày tạo</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.case_id}>
                    <th scope="row">
                      <Link href={`/dms/thv/${r.case_id}`}>{r.title}</Link>
                      <span className="muted block text-xs">Chưa có STT</span>
                    </th>
                    <td>
                      {DMS_DOMAINS.find((d) => d.code === r.domain)?.label ??
                        domainBySlug(r.domain)?.label}
                    </td>
                    <td>{day.format(new Date(r.created_at))}</td>
                    <td>
                      <span className="chip" data-tone={r.stale ? 'danger' : 'warn'}>
                        {r.stale ? 'Nội dung đã đổi, cần xác nhận lại' : 'Chờ xác nhận'}
                      </span>
                    </td>
                    <td>
                      <Button asChild variant="secondary">
                        <Link className="no-underline" href={`/dms/thv/${r.case_id}`}>
                          Xem và xác nhận
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
          <p className="muted mt-3 text-xs">{rows.length} hồ sơ chờ bạn xác nhận.</p>
        </>
      )}
    </section>
  );
}
