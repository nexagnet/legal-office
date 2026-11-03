import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookPdfViewer } from '../../../../components/BookPdfViewer';
import { Button } from '../../../../components/ui/button';
import { currentSession } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

const CODES: Record<string, string> = {
  's-01': 'S-01',
  's-02': 'S-02',
  's-04': 'S-04',
  's-05': 'S-05',
  'vt-den': 'VT-DEN',
  'vt-di': 'VT-DI',
  'vt-nb': 'VT-NB',
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
  const bookUrl = (format: 'csv' | 'pdf') =>
    `/api/dms/books/${code}?${new URLSearchParams({ officeId, year: String(year), format })}`;
  const years = [year - 2, year - 1, year, year + 1].filter((y) => y >= 2000);
  return (
    <section aria-labelledby="t">
      <h1 id="t">
        Xuất sổ {code} · {year}
      </h1>
      <div className="print-hide mb-4 flex flex-wrap items-center justify-between gap-3">
        <form method="get" className="flex flex-wrap items-center gap-3 text-sm">
          <label>
            <span className="sr-only">Năm</span>
            <select
              name="year"
              defaultValue={year}
              className="min-h-11 rounded-[10px] border border-line-strong bg-surface px-3"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  Năm {y}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="secondary">
            Xem
          </Button>
          <span className="muted">
            Quyển số: 01 · Mở sổ 01/01 · Khóa sổ 31/12 · in hàng tháng, giáp lai
          </span>
        </form>
      </div>
      <BookPdfViewer pdfUrl={bookUrl('pdf')} downloadName={`${code}-${year}.pdf`}>
        <Button asChild variant="secondary">
          <a className="no-underline" href={bookUrl('csv')}>
            Xuất Excel
          </a>
        </Button>
      </BookPdfViewer>
      <p className="print-hide mt-3 rounded-xl bg-[#fdf0d5] px-4 py-2 text-sm text-[#5a3d00]">
        Khung trên là chính file PDF sẽ in (A4 ngang, có bìa 1, bìa 2 và trang ruột) đúng mẫu Phụ
        lục I Thông tư 08/2026/TT-BTP. Bấm &quot;Xuất PDF để in&quot; để mở hộp thoại in của trình
        duyệt, hoặc &quot;Tải PDF&quot; để lưu file. STT trong sổ do hệ thống tự cấp theo sổ, văn
        phòng và năm; ô chưa có dữ liệu để trống.
      </p>
    </section>
  );
}
