import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DmsBookTable } from '../../../../components/DmsBookTable';
import { PrintButton } from '../../../../components/PrintButton';
import { loadDmsBookRows } from '../../../../lib/dms';
import { currentSession, requestCookie } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

const CODES: Record<string, string> = {
  's-01': 'S-01',
  's-02': 'S-02',
  's-04': 'S-04',
  's-05': 'S-05',
};

export default async function DmsBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ book: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const code = CODES[(await params).book];
  if (!code) notFound();
  const rawYear = Number((await searchParams).year);
  const year =
    Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100
      ? rawYear
      : new Date().getFullYear();
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Xuất sổ {code}</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem sổ.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  if (!officeId) notFound();
  const data = await loadDmsBookRows(await requestCookie(), officeId, code, year);
  if (data === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Xuất sổ {code}</h1>
        <div className="state" role="alert">
          <h2>Không tải được sổ</h2>
          <p>Máy chủ chưa trả về dữ liệu. Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  const csv = `/api/dms/books/${code}?${new URLSearchParams({ officeId, year: String(year), format: 'csv' })}`;
  return (
    <section aria-labelledby="t">
      <h1 id="t">
        Xuất sổ {code} · {year}
      </h1>
      <p className="muted print-hide">
        {data.book.form} (Ban hành kèm theo Thông tư số 08/2026/TT-BTP). Mở sổ 01/01, khóa sổ 31/12.
        Bản điện tử hỗ trợ in; ô chưa có dữ liệu để trống.
      </p>
      <p className="print-hide">
        <a href={csv}>Tải CSV</a> · <PrintButton />
      </p>
      <h2 className="book-title">{data.book.title}</h2>
      <DmsBookTable spec={data.book} rows={data.rows} />
    </section>
  );
}
