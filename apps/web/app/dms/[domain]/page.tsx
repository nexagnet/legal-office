import Link from 'next/link';
import { ErrorRetry } from '../../../components/ErrorRetry';
import { notFound } from 'next/navigation';
import { DmsCaseSuggest } from '../../../components/DmsCaseSuggest';
import { AdminBanner } from '../../../components/admin-banner';
import { DmsCaseTable } from '../../../components/DmsCaseTable';
import { DmsDomainTable } from '../../../components/DmsDomainTable';
import { DmsSavedFilters } from '../../../components/DmsSavedFilters';
import { DmsActiveChips, DmsFilterFields } from '../../../components/DmsFilterBar';
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
  filterToParams,
  formatTotal,
  loadBookRowsForCases,
  loadDmsFacetCounts,
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
    /** Bấm thẻ số = bật đúng bộ lọc tương ứng (Figma 05/11). */
    links: { missing: string; open: string; returned: string };
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
      return [official, docs('Giấy tờ cần tống đạt'), open('Chưa tống đạt'), missing];
    case 'xacminh':
      return [official, docs('Tài liệu hiện hành'), open('Chưa có kết quả'), missing];
    case 'tochuc':
      return [official, docs('Tài liệu hiện hành'), open('Chưa có biên bản N-08'), missing];
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
  const recordedView = !vanThu && filter !== 'nhap' && filter !== 'da-huy';
  const search = {
    from: range.from,
    to: range.to,
    thv: vanThu ? undefined : extra.thv,
    open: recordedView ? extra.open : undefined,
    returned: recordedView ? extra.returned : undefined,
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
    'chinh-thuc': vanThu || isDraftView ? nOfficial : undefined,
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
    kind: sp.lt,
    branch: sp.dv,
    thv: search.thv,
    open: search.open,
    returned: search.returned,
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
  };
  const showScanSelect = !isDraftView;
  const showsTable = !!listLayout && !!(draftKind ? !vanThu : spec) && pageRows.length > 0;
  const sttLabel = domain.code === 'vtden' ? 'Số đến' : 'STT';
  return (
    <section aria-labelledby="t" className="dms-list" data-domain={domain.code}>
      <h1 id="t">{vanThu ? 'Văn thư' : domain.label}</h1>
      {draftKind && !vanThu ? (
        <AdminBanner
          title={`${domain.label} · ${draftKind === 'nhap' ? 'Nháp' : 'Đã hủy'}`}
          sub={`${draftKind === 'nhap' ? 'Nháp' : 'Nháp đã hủy'} chưa ghi sổ ${bookCode} và chưa có STT. Bạn chỉ thấy nháp của mình và nháp được cấp quyền xem (draft.view.granted).`}
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
      ) : draftKind ? (
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
            links: kpiLinks,
          })}
        />
      )}
      <TabNav
        label={`Bộ lọc hồ sơ ${domain.label}`}
        soft
        active={filter}
        tabs={chipSet.map((k) => ({
          key: k,
          label: DMS_FILTER_LABEL[k],
          href: href(k),
          count: counts[k],
          tone:
            !vanThu && !isDraftView && (k === 'nhap' || k === 'da-huy')
              ? ('warn' as const)
              : undefined,
        }))}
        action={
          <span className="dms-actionbar">
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
                <PdfPrintButton
                  variant="secondary"
                  url={`/api/dms/books/${bookCode}?officeId=${officeId}&year=${year}&format=pdf`}
                />
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
      <form method="get" action={base} role="search" className="dms-filters">
        {!showScanSelect ? <input type="hidden" name="loc" value={filter} /> : null}
        <DmsCaseSuggest
          officeId={officeId}
          domain={domain.code}
          basePath={base}
          status={filterToParams(filter, year).status}
          year={filterToParams(filter, year).year}
          defaultValue={q}
        />
        {vanThu ? (
          <label>
            <span className="sr-only">Năm</span>
            <select name="year" defaultValue={year} className="dms-select" style={{ width: 96 }}>
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
        ) : null}
        {vanThu ? (
          <>
            <Button type="submit" variant="secondary" className="dms-find">
              Tìm
            </Button>
            <details className="dms-adv">
              <summary>Bộ lọc nâng cao</summary>
              <div className="dms-adv-body">
                {(() => {
                  const options = (
                    list: readonly { value: string; label: string; n: number }[],
                    now?: string,
                  ) => {
                    // Mục không có giá trị (vd "(chưa gán)") không lọc được và trùng giá trị rỗng của ô chọn, nên bỏ.
                    list = list.filter((o) => o.value !== '');
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
                        <select
                          name="lt"
                          defaultValue={sp.lt ?? ''}
                          className="dms-select"
                          style={{ width: 112 }}
                        >
                          <option value="">Loại tài liệu</option>
                          {options(facets.kind, sp.lt)}
                        </select>
                      </label>
                      <label>
                        <span className="sr-only">Người tạo</span>
                        <select
                          name="nt"
                          defaultValue={sp.nt ?? ''}
                          className="dms-select"
                          style={{ width: 98 }}
                        >
                          <option value="">Người tạo</option>
                          {options(facets.creator, sp.nt)}
                        </select>
                      </label>
                      <label>
                        <span className="sr-only">Đơn vị</span>
                        <select
                          name="dv"
                          defaultValue={sp.dv ?? ''}
                          className="dms-select"
                          style={{ width: 78 }}
                        >
                          <option value="">Đơn vị</option>
                          {options(facets.branch, sp.dv)}
                        </select>
                      </label>
                    </>
                  );
                })()}
                {showScanSelect ? (
                  <label>
                    <span className="sr-only">Tình trạng scan</span>
                    <select
                      name="loc"
                      defaultValue={
                        filter === 'thieu-scan' || filter === 'du-scan' ? filter : 'chinh-thuc'
                      }
                      className="dms-select"
                      style={{ width: 126 }}
                    >
                      <option value="chinh-thuc">Tình trạng scan</option>
                      <option value="thieu-scan">Thiếu scan</option>
                      <option value="du-scan">Đủ scan</option>
                    </select>
                  </label>
                ) : null}
                <DmsSavedFilters
                  officeId={officeId}
                  domain={domain.code}
                  basePath={base}
                  current={viewToSavedParams({
                    filter,
                    year: sp.year ? year : undefined,
                    q,
                    creator: sp.nt,
                    kind: sp.lt,
                    branch: sp.dv,
                  })}
                />
              </div>
            </details>
          </>
        ) : (
          <>
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
            >
              <DmsSavedFilters
                officeId={officeId}
                domain={domain.code}
                basePath={base}
                current={viewToSavedParams(view)}
              />
            </DmsFilterFields>
            <Button type="submit" variant="secondary" className="dms-find">
              Tìm
            </Button>
          </>
        )}
      </form>
      {vanThu ? null : (
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
      )}
      {range.inverted ? (
        <p className="dms-range-note" role="alert">
          “Từ” đang muộn hơn “Đến” nên không có hồ sơ nào. Hãy đổi lại hai mốc thời gian.
        </p>
      ) : hasRange && vanThu ? (
        <p className="dms-range-note" role="status">
          Đang lọc theo thời điểm ghi sổ (nháp: giờ tạo), giờ Việt Nam
          {range.tu ? `, từ ${range.tu.replace('T', ' ')}` : ''}
          {range.den ? `, đến hết ${range.den.replace('T', ' ')}` : ''}. Ô “Năm” không áp dụng khi
          đã chọn khoảng này.
        </p>
      ) : null}
      <div className="dms-card">
        {/* Liên kết nằm đè lên ô trống của đầu bảng; khi không vẽ bảng (trạng thái trống) phải xếp theo dòng, kẻo đè thông báo. */}
        <Link
          href="/dms/tim-kiem"
          className={`dms-scan-link dms-card-link${showsTable ? '' : ' dms-card-link--flow'}`}
        >
          Tìm trong nội dung scan
        </Link>
        {showsTable && listLayout ? (
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
            tableKey={`DmsDomainTable-${domain.code}${draftKind ? '-nhap' : ''}`}
          />
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
            {vanThu && !isDraftView
              ? `Sổ năm ${year} · ${formatTotal(total, result.totalCapped)} bản ghi chính thức · Nháp và nháp đã hủy không có ${sttLabel}, không vào xuất sổ · bấm dòng để xem chi tiết (không có nút xóa)`
              : `Hiển thị ${pageRows.length} / ${formatTotal(total, result.totalCapped)} hồ sơ ${
                  isDraftView
                    ? DMS_TAB_LABEL[tabForFilter(filter)].toLowerCase()
                    : hasRange
                      ? 'chính thức trong khoảng đã chọn'
                      : `chính thức năm ${year}`
                }. Nháp và nháp đã hủy không có ${sttLabel}, không vào xuất sổ, không tính thống kê chính thức.`}
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
