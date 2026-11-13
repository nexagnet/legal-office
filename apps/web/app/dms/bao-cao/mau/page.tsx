import Link from 'next/link';
import { ErrorRetry } from '../../../../components/ErrorRetry';
import { N09Form, N10Form } from '../../../../components/DmsStatForms';
import { loadDmsReport, loadThvOptions } from '../../../../lib/dms';
import { currentSession, requestCookie } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function DmsStatFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; branch?: string; half?: string }>;
}) {
  const sp = await searchParams;
  const rawYear = Number(sp.year);
  const firstHalf = sp.half === '1';
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
  const cookie = await requestCookie();
  const branch = session.branches.find((b) => b.officeId === officeId && b.id === sp.branch)?.id;
  const [rows, thv] = await Promise.all([
    loadDmsReport(cookie, officeId, year, branch, firstHalf),
    loadThvOptions(cookie),
  ]);
  const thvCount = thv.filter((t) => !t.officeId || t.officeId === officeId).length;
  const keep = `${branch ? `&branch=${branch}` : ''}${firstHalf ? '&half=1' : ''}`;
  return (
    <section aria-labelledby="t">
      <h1 id="t">
        Mẫu báo cáo N-09, N-10 năm {year}
        {firstHalf ? ' (6 tháng)' : ''}
      </h1>
      <p className="muted print-hide">
        Theo Phụ lục III Thông tư 08/2026/TT-BTP. Chỉ điền số hồ sơ đã lưu chính thức; doanh thu, số
        tiền và các ô còn lại để trống cho văn phòng tự điền.
      </p>
      <p className="print-hide">
        <Link href={`/dms/bao-cao/mau?year=${year - 1}${keep}`}>← {year - 1}</Link>{' '}
        <Link href={`/dms/bao-cao/mau?year=${year + 1}${keep}`}>{year + 1} →</Link>{' '}
        <Link href={`/dms/bao-cao?year=${year}${keep}`}>Số liệu tổng hợp</Link>
      </p>
      {rows === 'error' ? (
        <ErrorRetry
          title="Lỗi tải dữ liệu"
          message="Không tải được số liệu. Kiểm tra kết nối và thử lại."
        />
      ) : (
        <>
          <N09Form
            unit={session.tenantName}
            year={year}
            rows={rows}
            firstHalf={firstHalf}
            thvCount={thvCount}
          />
          <N10Form unit={session.tenantName} year={year} />
        </>
      )}
    </section>
  );
}
