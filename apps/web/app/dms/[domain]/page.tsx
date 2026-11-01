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
  canDraft,
  domainBySlug,
  loadDmsReport,
  loadMyDmsPermissions,
  tabForFilter,
  type DmsBookRow,
  type DmsFilter,
} from '../../../lib/dms';
import {
  countDmsCases,
  formatTotal,
  loadBookRowsForCases,
  loadDmsFacetCounts,
  pageWindow,
  searchDmsCases,
  TOTAL_CAP,
} from '../../../lib/dms-browse';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 10;
/** API đếm tối đa 10.001 hồ sơ: không có trang nào sau mốc đó (thu hẹp bộ lọc để thấy tiếp). */
const MAX_PAGE = Math.ceil((TOTAL_CAP + 1) / PAGE_SIZE);
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
  searchParams: Promise<{
    tab?: string;
    loc?: string;
    q?: string;
    year?: string;
    p?: string;
    nt?: string;
    lt?: string;
    dv?: string;
  }>;
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
  const pageNo = Math.max(1, Math.floor(Number(sp.p)) || 1);
  const search = {
    officeId,
    domain: domain.code,
    filter,
    year,
    q,
    creator: sp.nt,
    kind: sp.lt,
    branch: sp.dv,
  };
  const chipCount = (f: DmsFilter) =>
    countDmsCases(cookie, { officeId, domain: domain.code, filter: f, year });
  const [result, permissions, facets, report, nOfficial, nPending, nMissing, nComplete] =
    await Promise.all([
      searchDmsCases(cookie, {
        ...search,
        limit: PAGE_SIZE,
        offset: (Math.min(pageNo, MAX_PAGE) - 1) * PAGE_SIZE,
      }),
      loadMyDmsPermissions(cookie, officeId),
      loadDmsFacetCounts(cookie, search),
      loadDmsReport(cookie, officeId, year),
      chipCount('chinh-thuc'),
      chipCount('cho-duyet'),
      chipCount('thieu-scan'),
      chipCount('du-scan'),
    ]);
  if (result === 'error') {
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
  const isDraftView = filter === 'nhap' || filter === 'da-huy';
  // Dòng sổ chỉ lấy cho các hồ sơ đang hiện trên trang này, không tải cả sổ cả năm.
  const bookData = isDraftView
    ? null
    : await loadBookRowsForCases(
        cookie,
        officeId,
        bookCode,
        result.rows.map((r) => r.id),
      );
  const byCase = new Map<string, DmsBookRow>();
  if (bookData && bookData !== 'error')
    for (const r of bookData.rows) if (!byCase.has(r.case_id)) byCase.set(r.case_id, r);
  const spec = bookData && bookData !== 'error' ? bookData.book : undefined;
  const total = result.total ?? result.rows.length;
  const pageCount = Math.max(1, Math.min(MAX_PAGE, Math.ceil(total / PAGE_SIZE)));
  const page = Math.min(pageCount, pageNo);
  const pageRows = result.rows;
  const documents = report === 'error' ? undefined : report.find((r) => r.domain === domain.code);
  const counts: Record<DmsFilter, number | undefined> = {
    'chinh-thuc': nOfficial,
    'cho-duyet': nPending,
    'thieu-scan': nMissing,
    'du-scan': nComplete,
    nhap: undefined,
    'da-huy': undefined,
  };
  const href = (f: DmsFilter) => {
    const p = new URLSearchParams();
    if (f !== 'chinh-thuc') p.set('loc', f);
    if (q) p.set('q', q);
    if (sp.year) p.set('year', String(year));
    if (sp.nt) p.set('nt', sp.nt);
    if (sp.lt) p.set('lt', sp.lt);
    if (sp.dv) p.set('dv', sp.dv);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (filter !== 'chinh-thuc') p.set('loc', filter);
    if (q) p.set('q', q);
    if (sp.year) p.set('year', String(year));
    if (sp.nt) p.set('nt', sp.nt);
    if (sp.lt) p.set('lt', sp.lt);
    if (sp.dv) p.set('dv', sp.dv);
    if (n > 1) p.set('p', String(n));
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
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
          { label: `Hồ sơ chính thức ${year}`, value: nOfficial ?? '—' },
          { label: 'Tài liệu hiện hành', value: documents?.documents ?? '—' },
          { label: 'Thiếu scan', value: nMissing ?? '—', tone: 'danger' },
          { label: 'Sửa đổi chờ duyệt', value: nPending ?? '—', tone: 'warn' },
        ]}
      />
      <TabNav
        label={`Bộ lọc hồ sơ ${domain.label}`}
        compact
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
        {(() => {
          const cls = 'min-h-11 rounded-[10px] border border-line-strong bg-surface px-3 text-sm';
          const options = (
            list: readonly { value: string; label: string; n: number }[],
            now?: string,
          ) => {
            const rows =
              list.some((o) => o.value === now) || !now
                ? list
                : [...list, { value: now, label: now, n: 0 }];
            return rows.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.n.toLocaleString('vi-VN')})
              </option>
            ));
          };
          return (
            <>
              <label>
                <span className="sr-only">Loại tài liệu</span>
                <select name="lt" defaultValue={sp.lt ?? ''} className={cls}>
                  <option value="">Loại tài liệu</option>
                  {options(facets.kind, sp.lt)}
                </select>
              </label>
              <label>
                <span className="sr-only">Người tạo</span>
                <select name="nt" defaultValue={sp.nt ?? ''} className={cls}>
                  <option value="">Người tạo</option>
                  {options(facets.creator, sp.nt)}
                </select>
              </label>
              <label>
                <span className="sr-only">Đơn vị</span>
                <select name="dv" defaultValue={sp.dv ?? ''} className={cls}>
                  <option value="">Đơn vị</option>
                  {options(facets.branch, sp.dv)}
                </select>
              </label>
            </>
          );
        })()}
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
        <Link href="/dms/tim-kiem" className="text-sm">
          Tìm trong nội dung scan
        </Link>
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
          {page > 1 ? (
            <Link href={pageHref(page - 1)} rel="prev" className="px-3 py-1">
              ‹ Trước
            </Link>
          ) : null}
          {pageWindow(page, pageCount).map((n, i) =>
            n === '…' ? (
              <span key={`gap-${i}`} aria-hidden="true">
                …
              </span>
            ) : (
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
            ),
          )}
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} rel="next" className="px-3 py-1">
              Sau ›
            </Link>
          ) : null}
        </nav>
      ) : null}
      <p className="muted mt-3">
        Hiển thị {pageRows.length} / {formatTotal(total, result.totalCapped)} hồ sơ{' '}
        {isDraftView ? DMS_TAB_LABEL[tabForFilter(filter)].toLowerCase() : `chính thức năm ${year}`}
        . Nháp và nháp đã hủy không có {sttLabel}, không vào xuất sổ, không tính thống kê chính
        thức.
      </p>
    </section>
  );
}
