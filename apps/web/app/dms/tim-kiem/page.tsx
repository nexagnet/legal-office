import Link from 'next/link';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/field';
import {
  DMS_DOMAINS,
  OCR_PAGE_SIZE,
  VAN_THU_DOMAINS,
  searchDmsOcr,
  type DmsOcrFilters,
} from '../../../lib/dms';
import { loadDmsOcrFacets, type DmsFacetOption } from '../../../lib/dms-browse';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const ALL_DOMAINS = [...DMS_DOMAINS, ...VAN_THU_DOMAINS];
const slugOf = (code: string) => ALL_DOMAINS.find((d) => d.code === code);
/** Trang sâu vô nghĩa với tìm toàn văn: kết quả được xếp theo độ liên quan, quá 200 kết quả thì nên thu hẹp bộ lọc. */
const MAX_OFFSET = 200;
const SELECT = 'min-h-11 rounded-[10px] border border-line-strong bg-surface px-3 text-sm';

const options = (list: readonly DmsFacetOption[], now?: string) => {
  const rows =
    !now || list.some((o) => o.value === now) ? list : [...list, { value: now, label: now, n: 0 }];
  return rows.map((o) => (
    <option key={o.value} value={o.value}>
      {o.label} ({o.n.toLocaleString('vi-VN')})
    </option>
  ));
};

/** Tìm toàn văn trong nội dung các tệp scan (OCR). Kết quả chỉ trỏ về hồ sơ gốc, không sửa gì. */
export default async function DmsSearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    domain?: string;
    year?: string;
    nt?: string;
    lt?: string;
    dv?: string;
    p?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 200);
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Tìm trong nội dung scan</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để tìm hồ sơ.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  const domain = ALL_DOMAINS.find((d) => d.code === sp.domain)?.code;
  const year = Number(sp.year);
  const page = Math.max(1, Math.floor(Number(sp.p)) || 1);
  const filters: DmsOcrFilters = {
    domain,
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : undefined,
    creator: sp.nt || undefined,
    kind: sp.lt || undefined,
    branch: sp.dv || undefined,
    offset: Math.min(MAX_OFFSET, (page - 1) * OCR_PAGE_SIZE),
  };
  const cookie = await requestCookie();
  const [result, facets] = await Promise.all([
    q && officeId ? searchDmsOcr(cookie, officeId, q, filters) : Promise.resolve(null),
    officeId
      ? loadDmsOcrFacets(cookie, officeId, domain)
      : Promise.resolve({ creator: [], branch: [], kind: [], year: [] }),
  ]);
  const pageHref = (n: number) => {
    const p = new URLSearchParams({ q });
    if (domain) p.set('domain', domain);
    if (filters.year) p.set('year', String(filters.year));
    if (filters.creator) p.set('nt', filters.creator);
    if (filters.kind) p.set('lt', filters.kind);
    if (filters.branch) p.set('dv', filters.branch);
    if (n > 1) p.set('p', String(n));
    return `/dms/tim-kiem?${p}`;
  };
  return (
    <section aria-labelledby="t">
      <h1 id="t">Tìm trong nội dung scan</h1>
      <form method="get" role="search" className="mb-4 flex flex-wrap items-center gap-3">
        <label className="min-w-72 flex-1">
          <span className="sr-only">Từ khóa</span>
          <Input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={200}
            placeholder="Từ khóa trong chữ nhận dạng từ bản scan…"
          />
        </label>
        <label>
          <span className="sr-only">Nghiệp vụ</span>
          <select name="domain" defaultValue={domain ?? ''} className={SELECT}>
            <option value="">Mọi nghiệp vụ</option>
            {ALL_DOMAINS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Năm ghi sổ</span>
          <select name="year" defaultValue={filters.year ?? ''} className={SELECT}>
            <option value="">Mọi năm</option>
            {options(facets.year, filters.year ? String(filters.year) : undefined)}
          </select>
        </label>
        <label>
          <span className="sr-only">Loại tài liệu</span>
          <select name="lt" defaultValue={filters.kind ?? ''} className={SELECT}>
            <option value="">Loại tài liệu</option>
            {options(facets.kind, filters.kind)}
          </select>
        </label>
        <label>
          <span className="sr-only">Người tạo</span>
          <select name="nt" defaultValue={filters.creator ?? ''} className={SELECT}>
            <option value="">Người tạo</option>
            {options(facets.creator, filters.creator)}
          </select>
        </label>
        <label>
          <span className="sr-only">Đơn vị</span>
          <select name="dv" defaultValue={filters.branch ?? ''} className={SELECT}>
            <option value="">Đơn vị</option>
            {options(facets.branch, filters.branch)}
          </select>
        </label>
        <Button type="submit">Tìm</Button>
      </form>
      <p className="muted mb-3">
        Chữ trong tệp scan được nhận dạng tự động sau khi tải lên (thường trong 1 đến 2 phút). Chỉ
        hiện hồ sơ trong phạm vi quyền của bạn. Kết quả xếp theo độ khớp; số trong ngoặc là số hồ sơ
        chính thức của từng lựa chọn.
      </p>
      {result === null ? null : result === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tìm được</h2>
          <p>Máy chủ chưa trả về kết quả. Vui lòng thử lại sau.</p>
        </div>
      ) : result.rows.length === 0 ? (
        <div className="state" role="status">
          <h2>Không có kết quả</h2>
          <p>
            Không có tệp scan nào khớp “{q}”{page > 1 ? ' ở trang này' : ''}. Thử bỏ bớt bộ lọc hoặc
            đổi từ khóa.
          </p>
        </div>
      ) : (
        <>
          <ul className="grid gap-3">
            {result.rows.map((r) => {
              const d = slugOf(r.domain);
              return (
                <li key={r.file_id} className="rounded-2xl border border-line bg-surface p-4">
                  <p className="font-semibold">
                    {d ? (
                      <Link href={`/dms/${d.slug}/${r.case_id}?tab=tai-lieu`}>{r.case_title}</Link>
                    ) : (
                      r.case_title
                    )}{' '}
                    <span className="muted">· {d?.label ?? r.domain}</span>
                  </p>
                  <p className="muted">
                    {r.document_title} · {r.file_label}
                  </p>
                  <p>{r.snippet}</p>
                </li>
              );
            })}
          </ul>
          {page > 1 || (result.hasMore && (page - 1) * OCR_PAGE_SIZE < MAX_OFFSET) ? (
            <nav aria-label="Phân trang" className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} rel="prev">
                  ‹ Trước
                </Link>
              ) : null}
              <span aria-current="page" className="font-semibold">
                Trang {page}
              </span>
              {result.hasMore && (page - 1) * OCR_PAGE_SIZE < MAX_OFFSET ? (
                <Link href={pageHref(page + 1)} rel="next">
                  Sau ›
                </Link>
              ) : null}
            </nav>
          ) : null}
          {result.hasMore && (page - 1) * OCR_PAGE_SIZE >= MAX_OFFSET ? (
            <p className="muted mt-3">
              Đã tới giới hạn {MAX_OFFSET + OCR_PAGE_SIZE} kết quả. Hãy thu hẹp bằng bộ lọc hoặc từ
              khóa cụ thể hơn.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
