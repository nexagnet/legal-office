import Link from 'next/link';
import { ErrorRetry } from '../../../components/ErrorRetry';
import { domainBySlug, DMS_DOMAINS, loadThvPending } from '../../../lib/dms';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function DmsThvPending() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Chờ tôi xác nhận</h1>
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
      <h1 id="t">Chờ tôi xác nhận</h1>
      <p className="muted">
        Hồ sơ nháp có ghi tên bạn là thừa hành viên. Hồ sơ chỉ được lưu chính thức sau khi chính bạn
        xác nhận.
      </p>
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
        <ul>
          {rows.map((r) => (
            <li key={r.case_id}>
              <Link href={`/dms/thv/${r.case_id}`}>{r.title}</Link>{' '}
              <span className="muted">
                (
                {DMS_DOMAINS.find((d) => d.code === r.domain)?.label ??
                  domainBySlug(r.domain)?.label}
                {r.stale ? ' · nội dung đã đổi, cần xác nhận lại' : ''})
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
