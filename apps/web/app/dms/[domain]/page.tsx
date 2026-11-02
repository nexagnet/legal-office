import Link from 'next/link';
import { ErrorRetry } from '../../../components/ErrorRetry';
import { notFound } from 'next/navigation';
import { DmsCaseSuggest } from '../../../components/DmsCaseSuggest';
import { AdminBanner } from '../../../components/admin-banner';
import { DmsCaseTable } from '../../../components/DmsCaseTable';
import { DmsDomainTable } from '../../../components/DmsDomainTable';
import { DmsSavedFilters } from '../../../components/DmsSavedFilters';
import { KpiStrip, type Kpi } from '../../../components/KpiStrip';
import { NewDmsCaseButton } from '../../../components/NewDmsCaseButton';
import { Button } from '../../../components/ui/button';
import { TabNav } from '../../../components/ui/tab-nav';
import {
  BOOK_OF_DOMAIN,
  VAN_THU_DOMAINS,
  DMS_FILTER_LABEL,
  DMS_TAB_LABEL,
  activeDmsFilter,
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
  searchDmsCases,
  TOTAL_CAP,
  viewToSavedParams,
} from '../../../lib/dms-browse';
import { listLayoutFor, vanThuLayout } from '../../../lib/dms-list-layout';
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

/** Bốn thẻ số đầu danh sách theo Figma DMS v2 (mỗi nghiệp vụ một bộ, không bịa số: thiếu dữ liệu hiện "—"). */
function kpiItems(
  code: string,
  v: {
    year: number;
    official: number | undefined;
    documents: number | undefined;
    missingScan: number | undefined;
    pendingAmendment: number | undefined;
    stillOpen: number | undefined;
  },
): Kpi[] {
  const official: Kpi = { label: `Hồ sơ chính thức ${v.year}`, value: v.official ?? '—' };
  const missing: Kpi = { label: 'Thiếu scan', value: v.missingScan ?? '—', tone: 'danger' };
  const docs = (label: string): Kpi => ({ label, value: v.documents ?? '—' });
  const open = (label: string): Kpi => ({ label, value: v.stillOpen ?? '—', tone: 'warn' });
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
        { label: 'Sửa đổi chờ duyệt', value: v.pendingAmendment ?? '—', tone: 'warn' },
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
  const [
    result,
    permissions,
    facets,
    report,
    nOfficial,
    nPending,
    nMissing,
    nDraft,
    nCancelled,
    nMyDrafts,
  ] = await Promise.all([
    searchDmsCases(cookie, {
      ...search,
      limit: PAGE_SIZE,
      offset: (Math.min(pageNo, MAX_PAGE) - 1) * PAGE_SIZE,
    }),
    loadMyDmsPermissions(cookie, officeId),
    loadDmsFacetCounts(cookie, search),
    loadDmsReportFull(cookie, officeId, year),
    chipCount('chinh-thuc'),
    domain.code === 'vibang' ? chipCount('cho-duyet') : Promise.resolve(undefined),
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
  const chipSet: readonly DmsFilter[] =
    vanThu || isDraftView ? ['chinh-thuc', 'nhap', 'da-huy'] : FILTERS;
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
    'chinh-thuc': chipSet === FILTERS ? undefined : nOfficial,
    'cho-duyet': undefined,
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
  const showScanSelect = !isDraftView && filter !== 'cho-duyet';
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
            pendingAmendment: nPending,
            stillOpen,
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
            chipSet === FILTERS && (k === 'nhap' || k === 'da-huy') ? ('warn' as const) : undefined,
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
              defaultValue={filter === 'thieu-scan' || filter === 'du-scan' ? filter : 'chinh-thuc'}
              className="dms-select"
              style={{ width: 126 }}
            >
              <option value="chinh-thuc">Tình trạng scan</option>
              <option value="thieu-scan">Thiếu scan</option>
              <option value="du-scan">Đủ scan</option>
            </select>
          </label>
        ) : null}
        <Button type="submit" variant="secondary" className="dms-find">
          Tìm
        </Button>
        {vanThu ? null : (
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
        )}
      </form>
      <div className="dms-card">
        <Link href="/dms/tim-kiem" className="dms-scan-link dms-card-link">
          Tìm trong nội dung scan
        </Link>
        {listLayout && (draftKind ? !vanThu : spec) && pageRows.length > 0 ? (
          <DmsDomainTable
            rows={pageRows}
            caption={`Danh sách hồ sơ ${domain.label}`}
            basePath={base}
            layout={listLayout}
            spec={spec}
            byCase={rowsByCase}
            sttLabel={sttLabel}
            draft={draftKind ? { kind: draftKind, userId } : undefined}
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
