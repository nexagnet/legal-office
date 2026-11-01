import Link from 'next/link';
import { ErrorRetry } from '../../../../components/ErrorRetry';
import { notFound } from 'next/navigation';
import { DmsBookTable } from '../../../../components/DmsBookTable';
import { PrintButton } from '../../../../components/PrintButton';
import { Button } from '../../../../components/ui/button';
import { loadDmsBookRows } from '../../../../lib/dms';
import { currentSession, requestCookie } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

/** Số dòng sổ in được trên một trang A4 ngang của mẫu TP-THV (dùng để đếm tổng số trang ở bìa 2). */
const ROWS_PER_PAGE = 20;

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
  const data = await loadDmsBookRows(await requestCookie(), officeId, code, year);
  if (data === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Xuất sổ {code}</h1>
        <ErrorRetry
          title="Lỗi tải dữ liệu"
          message="Không tải được sổ. Kiểm tra kết nối và thử lại."
        />
      </section>
    );
  }
  const csv = `/api/dms/books/${code}?${new URLSearchParams({ officeId, year: String(year), format: 'csv' })}`;
  const office = session.tenantName ?? 'Văn phòng thi hành án dân sự';
  const title = data.book.title;
  // Số trang ruột = số dòng chia cho số dòng mỗi trang in (khổ A4 ngang); cộng 2 bìa. Dựng cùng lúc với bản xem trước nên khớp số dòng đang xuất.
  const totalPages = 2 + Math.max(1, Math.ceil(data.rows.length / ROWS_PER_PAGE));
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
        <span className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary">
            <a className="no-underline" href={csv}>
              Xuất Excel
            </a>
          </Button>
          <PrintButton label="Xuất PDF để in" primary />
        </span>
      </div>
      <div className="print-hide mb-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-surface p-5 text-center shadow-sm">
          <p className="muted text-xs">Bìa 1 (bìa cứng, A4)</p>
          <p className="font-serif text-2xl font-bold">SỔ</p>
          <p className="font-semibold">{title.replace(/^SỔ\s+/i, '')}</p>
          <p className="text-sm">Quyển số: 01</p>
          <p className="text-sm">
            Thời gian sử dụng: từ ngày 01/01/{year} đến ngày 31/12/{year}
          </p>
          <p className="muted text-xs">{data.book.form}</p>
        </div>
        <div className="rounded-2xl bg-surface p-5 text-center shadow-sm">
          <p className="muted text-xs">Bìa 2 (A4)</p>
          <p className="text-sm font-semibold uppercase">{office}</p>
          <p className="font-semibold">{title}</p>
          <p className="text-sm">Quyển số: 01 · Tổng số trang: {totalPages}</p>
          <p className="text-sm font-semibold">TRƯỞNG VĂN PHÒNG (Ký tên, đóng dấu)</p>
        </div>
      </div>
      <div className="book-sheet rounded-xl border border-line bg-surface p-4">
        <p className="muted text-xs">
          {data.book.form} (Ban hành kèm theo Thông tư số 08/2026/TT-BTP)
        </p>
        <p className="text-center text-sm font-bold uppercase">{office}</p>
        <h2 className="book-title">{title}</h2>
        <DmsBookTable spec={data.book} rows={data.rows} />
      </div>
      <p className="print-hide mt-3 rounded-xl bg-[#fdf0d5] px-4 py-2 text-sm text-[#5a3d00]">
        Bản xuất theo đúng mẫu {data.book.form}: tiêu đề và đánh số cột như mẫu chính thức. STT
        trong sổ do hệ thống tự cấp theo sổ, văn phòng và năm; ô chưa có dữ liệu để trống.
      </p>
    </section>
  );
}
