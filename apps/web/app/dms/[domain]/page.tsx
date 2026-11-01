import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DmsCaseTable } from '../../../components/DmsCaseTable';
import { KpiStrip } from '../../../components/KpiStrip';
import { NewDmsCaseButton } from '../../../components/NewDmsCaseButton';
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

const FILTERS: readonly DmsFilter[] = ['chinh-thuc', 'thieu-scan', 'du-scan', 'nhap', 'da-huy'];

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
  searchParams: Promise<{ tab?: string; loc?: string; q?: string; year?: string }>;
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
  const pending =
    pendingAmendments === 'error'
      ? 0
      : new Set(pendingAmendments.filter((a) => officialIds.has(a.case_id)).map((a) => a.case_id))
          .size;
  const rows = filterDmsCases(drafts ?? officialYear, filter, q, (id) => {
    const row = byCase.get(id);
    return row && spec ? spec.columns.map((c) => bookCell(spec, c, row)) : [];
  });
  const missingScan = officialYear.filter((r) => r.document_count > 0 && r.scan_count === 0);
  const counts: Record<DmsFilter, number | undefined> = {
    'chinh-thuc': officialYear.length,
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
                <a
                  className="btn-link"
                  href={`/api/dms/books/${bookCode}?officeId=${officeId}&year=${year}&format=csv`}
                >
                  Xuất Excel
                </a>
                <Link className="btn-link" href={`/dms/so/${vanThu.bookSlug}`}>
                  Xuất PDF để in
                </Link>
              </>
            ) : (
              <Link className="btn-link" href={`/dms/so/${bookCode.toLowerCase()}`}>
                Xuất {bookCode}
              </Link>
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
      <form method="get" action={base} className="filters" role="search">
        {filter !== 'chinh-thuc' ? <input type="hidden" name="loc" value={filter} /> : null}
        <label className="filter-search">
          <span className="sr-only">Tìm hồ sơ</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={200}
            placeholder="Tìm số văn bản, tên người, trích yếu, nội dung…"
          />
        </label>
        <label>
          <span className="sr-only">Năm</span>
          <input name="year" type="number" min={2000} max={2100} defaultValue={year} />
        </label>
        <button type="submit" className="primary">
          Tìm
        </button>
      </form>
      <DmsCaseTable
        rows={rows}
        caption={`Danh sách hồ sơ ${domain.label}`}
        basePath={base}
        book={!isDraftView && spec ? { spec, byCase } : undefined}
        sttLabel={sttLabel}
      />
      <p className="muted mt-3">
        Hiển thị {rows.length} hồ sơ{' '}
        {isDraftView ? DMS_TAB_LABEL[tabForFilter(filter)].toLowerCase() : `chính thức năm ${year}`}
        . Nháp và nháp đã hủy không có {sttLabel}, không vào xuất sổ, không tính thống kê chính
        thức.
      </p>
    </section>
  );
}
