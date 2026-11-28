import { colsToParam } from '../../../lib/dms-col-filters';
import Link from 'next/link';
import { ErrorRetry } from '../../../components/ErrorRetry';
import { notFound } from 'next/navigation';
import { AdminBanner } from '../../../components/admin-banner';
import { DmsCaseTable } from '../../../components/DmsCaseTable';
import { DmsDomainTable } from '../../../components/DmsDomainTable';
import { DmsFilterNavBusy } from '../../../components/DmsFilterNavBusy';
import { DmsListBusy } from '../../../components/DmsListBusy';
import { DmsSavedFilters } from '../../../components/DmsSavedFilters';
import { DmsActiveChips, DmsFilterFields, DmsWorkChips } from '../../../components/DmsFilterBar';
import { KpiStrip, type Kpi } from '../../../components/KpiStrip';
import { NewDmsCaseButton } from '../../../components/NewDmsCaseButton';
import { PdfPrintButton } from '../../../components/PdfPrintButton';
import { Button } from '../../../components/ui/button';
import { TabNav } from '../../../components/ui/tab-nav';
import {
  BOOK_OF_DOMAIN,
  VAN_THU_DOMAINS,
  DMS_FILTER_LABEL,
  DMS_TAB_LABEL,
  activeDmsFilter,
  canAddDocument,
  canDraft,
  domainBySlug,
  type DmsBookRow as BookRowT,
  loadDmsReportFull,
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
  exportCasesHref,
  pageWindow,
  parseExtraView,
  searchDmsCases,
  TOTAL_CAP,
  viewHref,
  viewToSavedParams,
} from '../../../lib/dms-browse';
import type { DmsView } from '../../../lib/dms-filter-params';
import { dmsDateRange } from '../../../lib/dms-date-range';
import { listLayoutFor, vanThuLayout } from '../../../lib/dms-list-layout';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 10;
/** API đếm tối đa 10.001 hồ sơ: không có trang nào sau mốc đó (thu hẹp bộ lọc để thấy tiếp). */
const MAX_PAGE = Math.ceil((TOTAL_CAP + 1) / PAGE_SIZE);
// Ba chip trạng thái. Thiếu/Đủ scan đã chuyển vào ngăn "Bộ lọc khác" (Figma 05/11); chip "Chờ duyệt sửa đổi" đã bỏ từ N4.
const CHIPS: readonly DmsFilter[] = ['chinh-thuc', 'nhap', 'da-huy'];

/** Bốn thẻ số đầu danh sách theo Figma DMS v2 (mỗi nghiệp vụ một bộ, không bịa số: thiếu dữ liệu hiện "—"). */
function kpiItems(
  code: string,
  v: {
    year: number;
    official: number | undefined;
    documents: number | undefined;
    missingScan: number | undefined;
    returned: number | undefined;
    stillOpen: number | undefined;
    drafts: number | undefined;
    /** Bấm thẻ số = bật đúng bộ lọc tương ứng (Figma 05/11). */
    links: { missing: string; open: string; returned: string; drafts: string };
  },
): Kpi[] {
  const official: Kpi = { label: `Hồ sơ chính thức ${v.year}`, value: v.official ?? '—' };
  const missing: Kpi = {
    label: 'Thiếu scan',
    value: v.missingScan ?? '—',
    tone: 'danger',
    href: v.links.missing,
  };
  const docs = (label: string): Kpi => ({ label, value: v.documents ?? '—' });
  const open = (label: string): Kpi => ({
    label,
    value: v.stillOpen ?? '—',
    tone: 'warn',
    href: v.links.open,
  });
  switch (code) {
    case 'tongdat':
      return [official, docs('Tài liệu hiện hành'), open('Chưa tống đạt'), missing];
    case 'xacminh':
      return [official, docs('Tài liệu hiện hành'), open('Chưa có kết quả'), missing];
    case 'tochuc':
      return [official, docs('Tài liệu hiện hành'), open('Chưa có biên bản N-08'), missing];
    case 'vtden':
    case 'vtdi':
    case 'vtnb':
      return [
        official,
        docs('Tài liệu hiện hành'),
        missing,
        {
          label: 'Nháp đang hoạt động',
          value: v.drafts ?? '—',
          tone: 'warn',
          href: v.links.drafts,
        },
      ];
    default:
      return [
        official,
        docs('Tài liệu hiện hành'),
        missing,
        { label: 'Đã trả kết quả', value: v.returned ?? '—', tone: 'ok', href: v.links.returned },
      ];
  }
}

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
    tu?: string;
    den?: string;
    thv?: string | string[];
    mo?: string;
    tra?: string;
    ky?: string;
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
  // Khoảng ngày giờ chính xác (giờ Việt Nam, đến phút); có khoảng thì không lọc theo năm.
  const extra = parseExtraView(sp);
  const range = dmsDateRange(sp.tu, sp.den, extra.ky);
  const hasRange = Boolean(range.from || range.to);
  // Thừa hành viên, việc còn dở, đã trả chỉ áp cho bốn nghiệp vụ; hai bộ sau chỉ ở danh sách chính thức (nháp không có).
  const recordedView = filter !== 'nhap' && filter !== 'da-huy';
  const search = {
    from: range.from,
    to: range.to,
    thv: vanThu ? undefined : extra.thv,
    open: recordedView && !vanThu ? extra.open : undefined,
    returned: recordedView && !vanThu ? extra.returned : undefined,
    overdue: recordedView && domain.code === 'tongdat' ? extra.overdue : undefined,
    fa: vanThu ? undefined : extra.fa,
    fb: vanThu ? undefined : extra.fb,
    cols: extra.cols,
    officeId,
    domain: domain.code,
    filter,
    year,
    q,
    creator: sp.nt,
    branch: sp.dv,
  };
  const chipCount = (f: DmsFilter) =>
    countDmsCases(cookie, { officeId, domain: domain.code, filter: f, year });
  const [result, permissions, facets, report, nOfficial, nMissing, nDraft, nCancelled, nMyDrafts] =
    await Promise.all([
      searchDmsCases(cookie, {
        ...search,
        limit: PAGE_SIZE,
        offset: (Math.min(pageNo, MAX_PAGE) - 1) * PAGE_SIZE,
      }),
      loadMyDmsPermissions(cookie, officeId),
      loadDmsFacetCounts(cookie, search),
      loadDmsReportFull(cookie, officeId, year),
      chipCount('chinh-thuc'),
      chipCount('thieu-scan'),
      chipCount('nhap'),
      chipCount('da-huy'),
      session.userId && (filter === 'nhap' || filter === 'da-huy')
        ? countDmsCases(cookie, {
            officeId,
            domain: domain.code,
            filter: 'nhap',
            year,
            creator: session.userId,
          })
        : Promise.resolve(undefined),
    ]);
  if (result === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{domain.label}</h1>
        <ErrorRetry
          title="Lỗi tải dữ liệu"
          message="Không tải được hồ sơ. Kiểm tra kết nối và thử lại."
        />
      </section>
    );
  }
  const isDraftView = filter === 'nhap' || filter === 'da-huy';
  const chipSet = CHIPS;
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
  const rowsByCase = new Map<string, BookRowT[]>();
  if (bookData && bookData !== 'error')
    for (const r of bookData.rows) {
      if (!byCase.has(r.case_id)) byCase.set(r.case_id, r);
      rowsByCase.set(r.case_id, [...(rowsByCase.get(r.case_id) ?? []), r]);
    }
  const spec = bookData && bookData !== 'error' ? bookData.book : undefined;
  const total = result.total ?? result.rows.length;
  const pageCount = Math.max(1, Math.min(MAX_PAGE, Math.ceil(total / PAGE_SIZE)));
  const page = Math.min(pageCount, pageNo);
  const pageRows = result.rows;
  const documents =
    report === 'error' ? undefined : report.rows.find((r) => r.domain === domain.code);
  const stillOpen = report === 'error' ? undefined : report.pending[domain.code];
  // Figma: chỉ hai chip Nháp và Đã hủy kèm số trong ngoặc; số của bốn chip còn lại nằm ở các thẻ số phía trên.
  const counts: Record<DmsFilter, number | undefined> = {
    'chinh-thuc': isDraftView ? nOfficial : undefined,
    'thieu-scan': undefined,
    'du-scan': undefined,
    nhap: nDraft,
    'da-huy': nCancelled,
  };
  const listLayout = vanThu ? (spec ? vanThuLayout(spec) : undefined) : listLayoutFor(domain.code);
  const draftKind = filter === 'nhap' || filter === 'da-huy' ? filter : undefined;
  const userId = session.userId;
  const myDrafts = draftKind ? nMyDrafts : undefined;
  const draftKpis: Kpi[] = [
    { label: 'Nháp đang hoạt động', value: nDraft ?? '—' },
    { label: 'Nháp của tôi', value: myDrafts ?? '—', tone: 'ok' },
    {
      label: 'Được cấp quyền xem',
      value: myDrafts !== undefined && nDraft !== undefined ? nDraft - myDrafts : '—',
      tone: 'danger',
    },
    { label: 'Đã hủy', value: nCancelled ?? '—', tone: 'warn' },
  ];
  // Một cách nhìn duy nhất cho mọi liên kết của trang (chip, trang, thẻ số, ×): xem DmsView.
  const view: DmsView = {
    filter,
    year: sp.year ? year : undefined,
    q,
    creator: sp.nt,
    branch: sp.dv,
    thv: search.thv,
    open: search.open,
    returned: search.returned,
    overdue: search.overdue,
    fa: search.fa,
    fb: search.fb,
    cols: search.cols,
    tu: range.tu,
    den: range.den,
    ky: range.ky,
  };
  const href = (f: DmsFilter, keepRange = true) =>
    viewHref(
      base,
      keepRange
        ? { ...view, filter: f }
        : { ...view, filter: f, tu: undefined, den: undefined, ky: undefined },
    );
  const pageHref = (n: number) => viewHref(base, view, { page: n });
  const kpiLinks = {
    missing: viewHref(base, { ...view, filter: 'thieu-scan' }),
    open: viewHref(base, { ...view, filter: 'chinh-thuc', open: true }),
    returned: viewHref(base, { ...view, filter: 'chinh-thuc', returned: true }),
    drafts: viewHref(base, { ...view, filter: 'nhap' }),
  };
  const showScanSelect = !isDraftView;
  const showsTable = !!listLayout && !!(draftKind ? !vanThu : spec) && pageRows.length > 0;
  const sttLabel = domain.code === 'vtden' ? 'Số đến' : 'STT';
  return (
    <section aria-labelledby="t" className="dms-list" data-domain={domain.code}>
      <DmsFilterNavBusy />
      <div className="dms-title-row">
        <h1 id="t">{vanThu ? 'Văn thư' : domain.label}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {vanThu ? (
            <PdfPrintButton
              variant="secondary"
              url={`/api/dms/books/${bookCode}?officeId=${officeId}&year=${year}&format=pdf`}
            />
          ) : (
            <Button asChild className="min-h-10 px-5 text-[15px] font-bold">
              <Link className="no-underline" href={`/dms/so/${bookCode.toLowerCase()}`}>
                Xuất sổ {bookCode}
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
        </div>
      </div>
      {draftKind ? (
        <AdminBanner
          title={`${domain.label} · ${draftKind === 'nhap' ? 'Nháp' : 'Đã hủy'}`}
          sub={`${draftKind === 'nhap' ? 'Nháp' : 'Nháp đã hủy'} chưa ghi sổ ${bookCode}, chưa có ${sttLabel}. Chỉ hiện nháp của bạn hoặc nháp được cấp quyền xem.`}
        />
      ) : null}
      {vanThu ? (
        <div className="dms-vt-tabs">
          <TabNav
            label="Ba sổ Văn thư"
            soft
            active={domain.slug}
            tabs={VAN_THU_DOMAINS.map((d) => ({
              key: d.slug,
              label: d.label,
              href: `/dms/${d.slug}`,
            }))}
          />
        </div>
      ) : null}
      {draftKind ? (
        <KpiStrip label={`Tổng hợp nháp ${domain.label}`} items={draftKpis} />
      ) : (
        <KpiStrip
          label={`Tổng hợp ${domain.label} năm ${year}`}
          items={kpiItems(domain.code, {
            year,
            official: nOfficial,
            documents: documents?.documents,
            missingScan: nMissing,
            returned: report === 'error' ? undefined : report.returned[domain.code],
            stillOpen,
            drafts: nDraft,
            links: kpiLinks,
          })}
        />
      )}
      {
        <div className="dms-tb">
          <div className="dms-tb-row">
            <span className="dms-tb-label">Hồ sơ</span>
            <nav aria-label={`Bộ lọc hồ sơ ${domain.label}`} className="dms-seg">
              {chipSet.map((k) => (
                <Link key={k} href={href(k)} aria-current={k === filter ? 'page' : undefined}>
                  {DMS_FILTER_LABEL[k]}
                  {counts[k] === undefined ? null : ` (${counts[k]})`}
                </Link>
              ))}
            </nav>
            <span className="dms-tb-actions">
              <DmsSavedFilters
                officeId={officeId}
                domain={domain.code}
                basePath={base}
                current={viewToSavedParams(view)}
              />
              {recordedView ? (
                <Button asChild variant="secondary">
                  <a
                    className="no-underline"
                    href={exportCasesHref({ ...search, from: range.from, to: range.to })}
                    title="Tải Excel đúng danh sách đang lọc (tối đa 10.000 hồ sơ)"
                  >
                    Xuất Excel (đang lọc)
                  </a>
                </Button>
              ) : null}
              <details className="dms-pop dms-pop-menu">
                <summary aria-label="Thêm thao tác">
                  <span aria-hidden="true">⋯</span>
                </summary>
                <div className="dms-pop-body dms-menu">
                  {vanThu ? (
                    <a
                      href={`/api/dms/books/${bookCode}?officeId=${officeId}&year=${year}&format=csv`}
                    >
                      Xuất sổ {bookCode} (CSV)
                    </a>
                  ) : (
                    <Link href={`/dms/so/${bookCode.toLowerCase()}`}>Xuất {bookCode}</Link>
                  )}
                  <Link href="/dms/tim-kiem">Tìm trong nội dung scan</Link>
                </div>
              </details>
            </span>
          </div>
          {recordedView && !vanThu ? (
            <div className="dms-tb-row">
              <span className="dms-tb-label">Việc cần làm</span>
              <DmsWorkChips
                base={base}
                view={view}
                facets={facets}
                domain={domain.code}
                userId={userId}
              />
            </div>
          ) : null}
          <form method="get" action={base} aria-label="Bộ lọc" className="dms-tb-row dms-tb-form">
            <span className="dms-tb-label">Bộ lọc</span>
            {!showScanSelect ? <input type="hidden" name="loc" value={filter} /> : null}
            {q ? <input type="hidden" name="q" value={q} /> : null}
            {colsToParam(search.cols) ? (
              <input type="hidden" name="cl" value={colsToParam(search.cols)} />
            ) : null}
            <DmsFilterFields
              view={view}
              range={range}
              facets={facets}
              domain={domain.code}
              year={year}
              years={Array.from({ length: 6 }, (_, i) => yearOfVn(new Date()) - 4 + i)
                .concat(year)
                .filter((y, i, a) => a.indexOf(y) === i)
                .sort((x, y) => y - x)}
              yearChosen={Boolean(sp.year) && year !== yearOfVn(new Date())}
              recordedView={recordedView}
            />
          </form>
          <DmsActiveChips
            base={base}
            view={view}
            range={range}
            facets={facets}
            domain={domain.code}
            year={year}
            yearChosen={Boolean(sp.year) && year !== yearOfVn(new Date())}
            recordedView={recordedView}
            matchText={formatTotal(total, result.totalCapped)}
          />
        </div>
      }
      {range.inverted ? (
        <p className="dms-range-note" role="alert">
          “Từ” đang muộn hơn “Đến” nên không có hồ sơ nào. Hãy đổi lại hai mốc thời gian.
        </p>
      ) : null}
      <div className="dms-card">
        {showsTable && listLayout ? (
          <DmsListBusy>
            <DmsDomainTable
              rows={pageRows}
              caption={`Danh sách hồ sơ ${domain.label}`}
              basePath={base}
              layout={listLayout}
              spec={spec}
              byCase={rowsByCase}
              sttLabel={sttLabel}
              draft={draftKind ? { kind: draftKind, userId } : undefined}
              canMarkReturned={canAddDocument(permissions, domain.code)}
              filterCtx={draftKind ? undefined : { domain: domain.code, officeId }}
              tableKey={`DmsDomainTable-${domain.code}${draftKind ? '-nhap' : ''}`}
            />
          </DmsListBusy>
        ) : (
          <DmsCaseTable
            rows={pageRows}
            caption={`Danh sách hồ sơ ${domain.label}`}
            basePath={base}
            book={!isDraftView && spec ? { spec, byCase } : undefined}
            sttLabel={sttLabel}
            emptyText={
              draftKind === 'nhap'
                ? 'Chưa có nháp nào. Nháp của bạn và nháp được cấp quyền xem sẽ hiện ở đây.'
                : draftKind === 'da-huy'
                  ? 'Chưa có nháp nào bị hủy.'
                  : canDraft(permissions, domain.code)
                    ? `Chưa có hồ sơ nào trong năm ${year}. Bấm "${vanThu ? '+ Thêm bản ghi' : '+ Tạo hồ sơ'}" để bắt đầu.`
                    : `Chưa có hồ sơ nào trong năm ${year}.`
            }
            emptyAction={
              draftKind !== 'da-huy' && canDraft(permissions, domain.code) ? (
                <NewDmsCaseButton
                  officeId={officeId}
                  domainCode={domain.code}
                  label={domain.label}
                  buttonLabel={vanThu ? '+ Thêm bản ghi' : '+ Tạo hồ sơ'}
                  redirectBase={base}
                />
              ) : undefined
            }
          />
        )}
        <div className="dms-foot">
          <p>
            {`Hiển thị ${pageRows.length} / ${formatTotal(total, result.totalCapped)} hồ sơ ${
              isDraftView
                ? DMS_TAB_LABEL[tabForFilter(filter)].toLowerCase()
                : hasRange
                  ? 'chính thức trong khoảng đã chọn'
                  : `chính thức năm ${year}`
            }.`}
          </p>
          {pageCount > 1 ? (
            <nav aria-label="Phân trang" className="dms-pager">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} rel="prev" aria-label="Trang trước">
                  ‹
                </Link>
              ) : null}
              {pageWindow(page, pageCount).map((n, i) =>
                n === '…' ? (
                  <span key={`gap-${i}`} aria-hidden="true">
                    …
                  </span>
                ) : (
                  <Link key={n} href={pageHref(n)} aria-current={n === page ? 'page' : undefined}>
                    {n}
                  </Link>
                ),
              )}
              {page < pageCount ? (
                <Link href={pageHref(page + 1)} rel="next" aria-label="Trang sau">
                  ›
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </div>
    </section>
  );
}
