import Link from 'next/link';
import { N09Form, N10Form } from '../../../../components/DmsStatForms';
import { loadDmsReport } from '../../../../lib/dms';
import { currentSession, requestCookie } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function DmsStatFormsPage({
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
        <h1 id="t">Mẫu báo cáo N-09, N-10</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem mẫu.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  if (!officeId) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Mẫu báo cáo N-09, N-10</h1>
        <div className="state" role="status">
          <h2>Chưa gắn văn phòng</h2>
        </div>
      </section>
    );
  }
  const rows = await loadDmsReport(await requestCookie(), officeId, year);
  return (
    <section aria-labelledby="t">
      <h1 id="t">Mẫu báo cáo N-09, N-10 năm {year}</h1>
      <p className="muted print-hide">
        Bố cục theo Phụ lục III Thông tư 08/2026/TT-BTP, kỳ 12 tháng (01/01–31/12). Hệ thống chỉ
        điền số hồ sơ đã lưu chính thức (tống đạt, vi bằng, xác minh). Doanh thu, số tiền, việc đã
        xong và chia theo cơ quan để trống cho văn phòng tự điền vì hệ thống không giữ số tiền kế
        toán.
      </p>
      <p className="print-hide">
        <Link href={`/dms/bao-cao/mau?year=${year - 1}`}>← {year - 1}</Link>{' '}
        <Link href={`/dms/bao-cao/mau?year=${year + 1}`}>{year + 1} →</Link>{' '}
        <Link href={`/dms/bao-cao?year=${year}`}>Số liệu tổng hợp</Link>
      </p>
      {rows === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được số liệu</h2>
        </div>
      ) : (
        <>
          <N09Form unit={session.tenantName} year={year} rows={rows} />
          <N10Form unit={session.tenantName} year={year} />
        </>
      )}
    </section>
  );
}
