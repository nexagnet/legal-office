import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DmsCaseTable } from '../../../components/DmsCaseTable';
import { KpiStrip } from '../../../components/KpiStrip';
import { NewDmsCaseButton } from '../../../components/NewDmsCaseButton';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/field';
import { TabNav } from '../../../components/ui/tab-nav';
import {
  BOOK_OF_DOMAIN,
  VAN_THU_DOMAINS,
  DMS_FILTER_LABEL,
  DMS_TAB_LABEL,
  activeDmsFilter,
  bookCell,
  canDraft,
  domainBySlug,
  filterDmsCases,
  loadDmsAmendments,
  loadDmsBookRows,
  loadDmsCases,
  loadMyDmsPermissions,
  tabForFilter,
  type DmsBookRow,
  type DmsFilter,
} from '../../../lib/dms';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 10;
const FILTERS: readonly DmsFilter[] = [
  'chinh-thuc',
  'cho-duyet',
  'thieu-scan',
  'du-scan',
  'nhap',
  'da-huy',
];

const yearOfVn = (d: Date): number =>
  Number(
    new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(d),
  );

/** Năm ghi sổ mặc định theo giờ Việt Nam; `?year=` lạ rơi về năm hiện tại. */
function activeYear(raw: string | undefined): number {
  const y = Number(raw);
  return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : yearOfVn(new Date());
}

export default async function DmsDomainPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ tab?: string; loc?: string; q?: string; year?: string; p?: string }>;
}) {
  const domain = domainBySlug((await params).domain);
  if (!domain) notFound();
  const sp = await searchParams;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{domain.label}</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            Phiên làm việc chưa được xác thực. <Link href="/login">Đăng nhập</Link> để xem hồ sơ.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  if (!officeId) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{domain.label}</h1>
        <div className="state" role="status">
          <h2>Chưa gắn văn phòng</h2>
          <p>Tài khoản chưa thuộc văn phòng nào.</p>
        </div>
      </section>
    );
  }
  const vanThu = 'book' in domain ? domain : undefined;
  const bookCode = BOOK_OF_DOMAIN[domain.code] ?? vanThu?.book;
  if (!bookCode) notFound();

  const base = `/dms/${domain.slug}`;
  const filter = activeDmsFilter(sp.loc ?? sp.tab);
  const q = (sp.q ?? '').slice(0, 200);
  const year = activeYear(sp.year);
  const cookie = await requestCookie();
  const [official, drafts, permissions, bookData, pendingAmendments] = await Promise.all([
    loadDmsCases(cookie, officeId, domain.code, 'chinh-thuc'),
    tabForFilter(filter) === 'chinh-thuc'
      ? Promise.resolve(null)
      : loadDmsCases(cookie, officeId, domain.code, tabForFilter(filter)),
    loadMyDmsPermissions(cookie, officeId),
    loadDmsBookRows(cookie, officeId, bookCode, year),
    loadDmsAmendments(cookie, officeId, { status: 'PENDING' }),
  ]);
  if (official === 'error' || drafts === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{domain.label}</h1>
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
          <p>Máy chủ chưa trả về danh sách. Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  const byCase = new Map<string, DmsBookRow>();
  if (bookData !== 'error')
    for (const r of bookData.rows) if (!byCase.has(r.case_id)) byCase.set(r.case_id, r);
  const spec = bookData === 'error' ? undefined : bookData.book;
  const officialYear = official.filter(
    (r) => r.recorded_at !== null && yearOfVn(new Date(r.recorded_at)) === year,
  );
  const officialIds = new Set(officialYear.map((r) => r.id));
  const pendingIds = new Set(
    pendingAmendments === 'error'
      ? []
      : pendingAmendments.filter((a) => officialIds.has(a.case_id)).map((a) => a.case_id),
  );
  const pending = pendingIds.size;
  const rows = filterDmsCases(
    drafts ?? officialYear,
    filter,
    q,
    (id) => {
      const row = byCase.get(id);
      return row && spec ? spec.columns.map((c) => bookCell(spec, c, row)) : [];
    },
    pendingIds,
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Math.floor(Number(sp.p)) || 1));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const missingScan = officialYear.filter((r) => r.document_count > 0 && r.scan_count === 0);
  const counts: Record<DmsFilter, number | undefined> = {
    'chinh-thuc': officialYear.length,
    'cho-duyet': pending,
    'thieu-scan': missingScan.length,
    'du-scan': officialYear.filter((r) => r.document_count > 0 && r.scan_count > 0).length,
    nhap: undefined,
    'da-huy': undefined,
  };
  const href = (f: DmsFilter) => {
    const p = new URLSearchParams();
    if (f !== 'chinh-thuc') p.set('loc', f);
    if (q) p.set('q', q);
    if (sp.year) p.set('year', String(year));
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (filter !== 'chinh-thuc') p.set('loc', filter);
    if (q) p.set('q', q);
    if (sp.year) p.set('year', String(year));
    if (n > 1) p.set('p', String(n));
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const isDraftView = filter === 'nhap' || filter === 'da-huy';
  const sttLabel = domain.code === 'vtden' ? 'Số đến' : 'STT';
  return (
    <section aria-labelledby="t">
      <h1 id="t">{vanThu ? 'Văn thư' : domain.label}</h1>
      {vanThu ? (
        <TabNav
          label="Ba sổ Văn thư"
          active={domain.slug}
          tabs={VAN_THU_DOMAINS.map((d) => ({
            key: d.slug,
            label: d.label,
            href: `/dms/${d.slug}`,
          }))}
        />
      ) : null}
      <KpiStrip
        label={`Tổng hợp ${domain.label} năm ${year}`}
        items={[
          { label: `Hồ sơ chính thức ${year}`, value: officialYear.length },
          {
            label: 'Tài liệu hiện hành',
            value: officialYear.reduce((n, r) => n + r.document_count, 0),
          },
          { label: 'Thiếu scan', value: missingScan.length, tone: 'danger' },
          { label: 'Sửa đổi chờ duyệt', value: pending, tone: 'warn' },
        ]}
      />
      <TabNav
        label={`Bộ lọc hồ sơ ${domain.label}`}
        active={filter}
        tabs={FILTERS.map((k) => ({
          key: k,
          label: DMS_FILTER_LABEL[k],
          href: href(k),
          count: counts[k],
        }))}
        action={
          <span className="flex flex-wrap items-center gap-2">
            {vanThu ? (
              <>
                <Button asChild variant="secondary">
                  <a
                    className="no-underline"
                    href={`/api/dms/books/${bookCode}?officeId=${officeId}&year=${year}&format=csv`}
                  >
                    Xuất Excel
                  </a>
                </Button>
                <Button asChild variant="secondary">
                  <Link className="no-underline" href={`/dms/so/${vanThu.bookSlug}`}>
                    Xuất PDF để in
                  </Link>
                </Button>
              </>
            ) : (
              <Button asChild variant="secondary">
                <Link className="no-underline" href={`/dms/so/${bookCode.toLowerCase()}`}>
                  Xuất {bookCode}
                </Link>
              </Button>
            )}
            {canDraft(permissions, domain.code) ? (
              <NewDmsCaseButton
                officeId={officeId}
                domainCode={domain.code}
                label={domain.label}
                buttonLabel={vanThu ? '+ Thêm bản ghi' : '+ Tạo hồ sơ'}
                redirectBase={base}
              />
            ) : null}
          </span>
        }
      />
      <form
        method="get"
        action={base}
        role="search"
        className="mb-4 flex flex-wrap items-center gap-3"
      >
        {filter !== 'chinh-thuc' ? <input type="hidden" name="loc" value={filter} /> : null}
        <label className="min-w-72 flex-1">
          <span className="sr-only">Tìm hồ sơ</span>
          <Input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={200}
            placeholder="Tìm số văn bản, tên người, trích yếu, nội dung…"
          />
        </label>
        <label className="w-28">
          <span className="sr-only">Năm</span>
          <select
            name="year"
            defaultValue={year}
            className="min-h-11 w-full rounded-[10px] border border-line-strong bg-surface px-3 text-sm"
          >
            {Array.from({ length: 6 }, (_, i) => yearOfVn(new Date()) - 4 + i)
              .concat(year)
              .filter((y, i, a) => a.indexOf(y) === i)
              .sort((x, y) => y - x)
              .map((y) => (
                <option key={y} value={y}>
                  Năm {y}
                </option>
              ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Tìm
        </Button>
      </form>
      <DmsCaseTable
        rows={pageRows}
        caption={`Danh sách hồ sơ ${domain.label}`}
        basePath={base}
        book={!isDraftView && spec ? { spec, byCase } : undefined}
        sttLabel={sttLabel}
      />
      {pageCount > 1 ? (
        <nav aria-label="Phân trang" className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={pageHref(n)}
              aria-current={n === page ? 'page' : undefined}
              className={
                n === page
                  ? 'rounded-full bg-accent px-3 py-1 font-semibold text-white'
                  : 'px-3 py-1'
              }
            >
              {n}
            </Link>
          ))}
        </nav>
      ) : null}
      <p className="muted mt-3">
        Hiển thị {pageRows.length} / {rows.length} hồ sơ{' '}
        {isDraftView ? DMS_TAB_LABEL[tabForFilter(filter)].toLowerCase() : `chính thức năm ${year}`}
        . Nháp và nháp đã hủy không có {sttLabel}, không vào xuất sổ, không tính thống kê chính
        thức.
      </p>
    </section>
  );
}
