import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DmsCaseTable } from '../../../components/DmsCaseTable';
import { KpiStrip } from '../../../components/KpiStrip';
import { NewDmsCaseButton } from '../../../components/NewDmsCaseButton';
import { NewDmsCaseForm } from '../../../components/NewDmsCaseForm';
import { TabNav } from '../../../components/ui/tab-nav';
import {
  BOOK_OF_DOMAIN,
  DMS_FILTER_LABEL,
  DMS_TAB_LABEL,
  activeDmsFilter,
  activeDmsTab,
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
  type DmsDomain,
  type DmsFilter,
  type DmsTab,
} from '../../../lib/dms';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const TABS: readonly DmsTab[] = ['chinh-thuc', 'nhap', 'da-huy'];
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
  const bookCode = BOOK_OF_DOMAIN[domain.code];
  if (!bookCode)
    return <VanThuList domain={domain} officeId={officeId} tab={activeDmsTab(sp.tab)} />;

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
  return (
    <section aria-labelledby="t">
      <h1 id="t">{domain.label}</h1>
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
            <Link href={`/dms/so/${bookCode.toLowerCase()}`}>Xuất {bookCode}</Link>
            {canDraft(permissions, domain.code) ? (
              <NewDmsCaseButton
                officeId={officeId}
                domainCode={domain.code}
                label={domain.label}
                redirectBase={base}
              />
            ) : null}
          </span>
        }
      />
      <form
        method="get"
        action={base}
        className="mb-3 flex flex-wrap items-end gap-3"
        role="search"
      >
        {filter !== 'chinh-thuc' ? <input type="hidden" name="loc" value={filter} /> : null}
        <label className="flex flex-col gap-1 text-sm">
          Tìm hồ sơ
          <input
            name="q"
            defaultValue={q}
            maxLength={200}
            placeholder="Tên hồ sơ, người yêu cầu, nội dung…"
            className="min-w-72"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Năm
          <input
            name="year"
            type="number"
            min={2000}
            max={2100}
            defaultValue={year}
            className="w-24"
          />
        </label>
        <button type="submit">Tìm</button>
      </form>
      <DmsCaseTable
        rows={rows}
        caption={`Danh sách hồ sơ ${domain.label}`}
        basePath={base}
        book={!isDraftView && spec ? { spec, byCase } : undefined}
      />
      <p className="muted mt-3">
        Hiển thị {rows.length} hồ sơ{' '}
        {isDraftView ? DMS_TAB_LABEL[tabForFilter(filter)].toLowerCase() : `chính thức năm ${year}`}
        . Nháp và nháp đã hủy không có STT, không vào xuất sổ, không tính thống kê chính thức.
      </p>
    </section>
  );
}

/** Ba sổ Văn thư giữ bố cục cũ cho tới khi làm riêng theo Figma (PR Văn thư). */
async function VanThuList({
  domain,
  officeId,
  tab,
}: {
  readonly domain: DmsDomain;
  readonly officeId: string;
  readonly tab: DmsTab;
}) {
  const cookie = await requestCookie();
  const [rows, permissions] = await Promise.all([
    loadDmsCases(cookie, officeId, domain.code, tab),
    loadMyDmsPermissions(cookie, officeId),
  ]);
  const base = `/dms/${domain.slug}`;
  return (
    <section aria-labelledby="t">
      <h1 id="t">{domain.label}</h1>
      <TabNav
        label={`Nhóm hồ sơ ${domain.label}`}
        active={tab}
        tabs={TABS.map((k) => ({
          key: k,
          label: DMS_TAB_LABEL[k],
          href: k === 'chinh-thuc' ? base : `${base}?tab=${k}`,
        }))}
      />
      {'book' in domain ? (
        <p className="mb-2">
          <Link href={`/dms/so/${domain.bookSlug}`}>Xem trước và xuất sổ {domain.label}</Link>
        </p>
      ) : null}
      {canDraft(permissions, domain.code) ? (
        <NewDmsCaseForm officeId={officeId} domainCode={domain.code} />
      ) : null}
      {rows === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
          <p>Máy chủ chưa trả về danh sách. Vui lòng thử lại sau.</p>
        </div>
      ) : (
        <>
          <KpiStrip
            label={`Tổng hợp ${DMS_TAB_LABEL[tab].toLowerCase()}`}
            items={[
              { label: 'Hồ sơ', value: rows.length },
              { label: 'Tài liệu', value: rows.reduce((n, r) => n + r.document_count, 0) },
              {
                label: 'Thiếu scan',
                value: rows.filter((r) => r.document_count > 0 && r.scan_count === 0).length,
                tone: 'danger',
              },
            ]}
          />
          <DmsCaseTable rows={rows} caption={`Danh sách hồ sơ ${domain.label}`} basePath={base} />
          <p className="muted mt-3">
            Nháp và nháp đã hủy không có {domain.code === 'vtden' ? 'Số đến' : 'STT'}, không vào
            xuất sổ, không tính thống kê chính thức.
          </p>
        </>
      )}
    </section>
  );
}
