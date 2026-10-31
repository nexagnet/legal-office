import Link from 'next/link';
import { DMS_DOMAIN_LABELS, loadDmsReport } from '../../../lib/dms';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function DmsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const rawYear = Number((await searchParams).year);
  const year =
    Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100
      ? rawYear
      : new Date().getFullYear();
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Báo cáo tổng hợp</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem báo cáo.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  if (!officeId) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Báo cáo tổng hợp</h1>
        <div className="state" role="status">
          <h2>Chưa gắn văn phòng</h2>
        </div>
      </section>
    );
  }
  const rows = await loadDmsReport(await requestCookie(), officeId, year);
  return (
    <section aria-labelledby="t">
      <h1 id="t">Báo cáo tổng hợp năm {year}</h1>
      <p className="muted">
        Chỉ là số liệu tổng hợp theo hồ sơ đã lưu chính thức mà bạn được quyền đọc, không phải mẫu
        N-09/N-10 chính thức (bố cục mẫu chờ file Excel gốc của khách). Nháp và nháp đã hủy không
        tính.
      </p>
      <p>
        <Link href={`/dms/bao-cao?year=${year - 1}`}>← {year - 1}</Link>{' '}
        <Link href={`/dms/bao-cao?year=${year + 1}`}>{year + 1} →</Link>
      </p>
      {rows === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được báo cáo</h2>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Số liệu tổng hợp theo miền năm {year}</caption>
            <thead>
              <tr>
                <th scope="col">Miền</th>
                <th scope="col">Hồ sơ đã lưu</th>
                <th scope="col">Tài liệu</th>
                <th scope="col">Bản scan</th>
                <th scope="col">Yêu cầu sửa đổi</th>
                <th scope="col">STT / Số đến cuối</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.domain}>
                  <th scope="row">{DMS_DOMAIN_LABELS[r.domain] ?? r.domain}</th>
                  <td>{r.recorded_cases}</td>
                  <td>{r.documents}</td>
                  <td>{r.scans}</td>
                  <td>{r.amendments}</td>
                  <td>{r.last_stt ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
