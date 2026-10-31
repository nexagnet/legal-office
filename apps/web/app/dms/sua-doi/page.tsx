import Link from 'next/link';
import { DmsAmendmentReview, DmsAmendmentWindowForm } from '../../../components/DmsAmendments';
import {
  AMENDMENT_STATUS_LABEL,
  amendmentSummary,
  loadAmendmentWindow,
  loadDmsAmendments,
} from '../../../lib/dms';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

export default async function DmsAmendmentsPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Yêu cầu sửa đổi</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem yêu cầu sửa đổi.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  if (!officeId) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Yêu cầu sửa đổi</h1>
        <div className="state" role="status">
          <h2>Chưa gắn văn phòng</h2>
        </div>
      </section>
    );
  }
  const cookie = await requestCookie();
  const [rows, hours] = await Promise.all([
    loadDmsAmendments(cookie, officeId),
    loadAmendmentWindow(cookie, officeId),
  ]);
  return (
    <section aria-labelledby="t">
      <h1 id="t">Yêu cầu sửa đổi</h1>
      <p className="muted">
        Hồ sơ đã lưu chính thức không sửa trực tiếp. Mọi thay đổi cần lý do và bản scan văn bản sửa
        đổi. Admin gửi thì có hiệu lực ngay; người khác chờ Admin duyệt hoặc được tự duyệt trong{' '}
        {hours} giờ sau khi ghi sổ{hours === 0 ? ' (đang tắt)' : ''}.
      </p>
      <DmsAmendmentWindowForm officeId={officeId} hours={hours} />
      {rows === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được yêu cầu</h2>
        </div>
      ) : rows.length === 0 ? (
        <div className="state" role="status">
          <h2>Chưa có yêu cầu sửa đổi</h2>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Yêu cầu sửa đổi</caption>
            <thead>
              <tr>
                <th scope="col">Gửi lúc</th>
                <th scope="col">Nội dung sửa</th>
                <th scope="col">Lý do</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Bằng chứng</th>
                <th scope="col">Xử lý</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{fmt.format(new Date(a.requested_at))}</td>
                  <td>
                    {a.n11 ? '(N-11) ' : ''}
                    {amendmentSummary(a)}
                  </td>
                  <td>{a.reason}</td>
                  <td>
                    {AMENDMENT_STATUS_LABEL[a.status]}
                    {a.auto_via === 'WINDOW' ? ' (tự duyệt trong cửa sổ)' : ''}
                  </td>
                  <td>
                    <a href={`/api/dms/amendments/${a.id}/evidence`}>Văn bản sửa đổi</a>
                  </td>
                  <td>
                    {a.status === 'PENDING' ? (
                      <DmsAmendmentReview requestId={a.id} />
                    ) : (
                      (a.review_note ?? '—')
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
