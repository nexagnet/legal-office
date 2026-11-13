import Link from 'next/link';
import { Button } from './ui/button';
import { DMS_DOMAINS, loadMyDmsPermissions } from '../lib/dms';
import { searchDmsCases, type DmsSearchCase } from '../lib/dms-browse';
import { loadPendingSubmissionCount } from '../lib/dms-submissions';

/** Tên dòng "việc còn dở" của từng nghiệp vụ (Vi bằng không có khái niệm này). */
const OPEN_LABEL: Record<string, string> = {
  tongdat: 'Chưa tống đạt',
  xacminh: 'Chưa có kết quả xác minh',
  tochuc: 'Chưa có biên bản N-08',
};

interface DomainStat {
  readonly slug: string;
  readonly code: string;
  readonly label: string;
  readonly total: number;
  readonly missing: number;
  readonly open: number | null;
  readonly overdue: number | null;
  readonly missingRows: readonly DmsSearchCase[];
}

/** Con số đếm trong DB (chỉ mục), bị chặn ở 10.000; lỗi thì 0 để không làm hỏng cả trang. */
const num = (r: { total: number | null } | 'error'): number => (r === 'error' ? 0 : (r.total ?? 0));

function Stat({
  href,
  label,
  value,
  tone,
}: {
  readonly href: string;
  readonly label: string;
  readonly value: number;
  readonly tone: 'warn' | 'danger';
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm no-underline"
        style={{ background: tone === 'danger' ? 'var(--danger-soft, #fdecec)' : '#f6ebcf' }}
      >
        <span>{label}</span>
        <strong>{value.toLocaleString('vi-VN')}</strong>
      </Link>
    </li>
  );
}

/**
 * Tổng quan DMS: mỗi nghiệp vụ một thẻ (số hồ sơ năm nay, việc còn dở, quá hạn, thiếu scan), mỗi số bấm sang danh sách
 * đã lọc sẵn bằng tham số URL của trang danh sách. Số đếm do DB tính (`/dms/case-search`, có chỉ mục và đã áp quyền xem),
 * không còn đếm trên 100 hồ sơ đầu như trước. Chỉ hiện nghiệp vụ người xem có quyền đọc.
 */
export async function DmsOverview({
  cookie,
  officeId,
}: {
  readonly cookie: string | null;
  readonly officeId: string;
}) {
  const year = Number(
    new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(
      new Date(),
    ),
  );
  const [perms, pendingSubmissions] = await Promise.all([
    loadMyDmsPermissions(cookie, officeId),
    loadPendingSubmissionCount(cookie, officeId),
  ]);
  // Không đọc được danh sách quyền thì hiện hết (số đếm vẫn do DB lọc theo quyền).
  const readable = (code: string) =>
    perms.length === 0 || perms.includes(`${code}.read.all`) || perms.includes(`${code}.read.own`);
  const stats: DomainStat[] = await Promise.all(
    DMS_DOMAINS.filter((d) => readable(d.code)).map(async (d) => {
      const base = { officeId, domain: d.code, year, limit: 1 } as const;
      const [total, missing, open, overdue] = await Promise.all([
        searchDmsCases(cookie, { ...base, filter: 'chinh-thuc' }),
        searchDmsCases(cookie, { ...base, filter: 'thieu-scan', limit: 5 }),
        d.code === 'vibang'
          ? null
          : searchDmsCases(cookie, { ...base, filter: 'chinh-thuc', open: true }),
        d.code === 'tongdat'
          ? searchDmsCases(cookie, { ...base, filter: 'chinh-thuc', overdue: true })
          : null,
      ]);
      return {
        slug: d.slug,
        code: d.code,
        label: d.label,
        total: num(total),
        missing: num(missing),
        open: open ? num(open) : null,
        overdue: overdue ? num(overdue) : null,
        missingRows: missing === 'error' ? [] : missing.rows,
      };
    }),
  );
  const missingList = stats.flatMap((s) => s.missingRows.map((r) => ({ row: r, slug: s.slug })));
  return (
    <section aria-labelledby="t">
      <h1 id="t">Tổng quan</h1>
      <p className="muted">
        Năm {year}. Chỉ tính hồ sơ chính thức bạn được quyền xem. Bấm vào một số để mở danh sách đã
        lọc.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <section
            key={s.code}
            aria-label={s.label}
            className="grid content-start gap-3 rounded-2xl bg-surface p-5 shadow-sm"
          >
            <h2 className="m-0 text-base">
              <Link href={`/dms/${s.slug}`}>{s.label}</Link>
            </h2>
            <p className="m-0">
              <strong className="text-3xl">
                {s.total >= 10_000 ? '10.000+' : s.total.toLocaleString('vi-VN')}
              </strong>{' '}
              <span className="muted">hồ sơ năm {year}</span>
            </p>
            <ul className="m-0 grid list-none gap-2 p-0">
              {s.open !== null ? (
                <Stat
                  href={`/dms/${s.slug}?mo=1`}
                  label={OPEN_LABEL[s.code] ?? 'Việc còn dở'}
                  value={s.open}
                  tone="warn"
                />
              ) : null}
              {s.overdue !== null ? (
                <Stat
                  href={`/dms/${s.slug}?qh=1`}
                  label="Quá hạn báo kết quả"
                  value={s.overdue}
                  tone="danger"
                />
              ) : null}
              <Stat
                href={`/dms/${s.slug}?loc=thieu-scan`}
                label="Thiếu bản scan"
                value={s.missing}
                tone="danger"
              />
            </ul>
          </section>
        ))}
      </div>
      <section aria-labelledby="need-scan" className="mt-4 rounded-2xl bg-surface p-5 shadow-sm">
        <h2 id="need-scan">Cần bổ sung scan</h2>
        {missingList.length === 0 ? (
          <p className="muted">Không có hồ sơ nào thiếu bản scan.</p>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0">
            {missingList.map(({ row, slug }) => (
              <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <strong>{row.title}</strong>{' '}
                  {row.case_number ? <span className="muted">{row.case_number}</span> : null}
                </span>
                <Link href={`/dms/${slug}/${row.id}?tab=tai-lieu`}>Mở</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {/* Chỉ Admin có số khác 0 (bản trình chờ duyệt do Admin xử lý). */}
      {pendingSubmissions > 0 ? (
        <section
          aria-labelledby="pending-sub"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-5 shadow-sm"
        >
          <div>
            <h2 id="pending-sub" className="mb-1">
              Bản trình chờ duyệt
            </h2>
            <p className="muted m-0 text-sm">
              {pendingSubmissions.toLocaleString('vi-VN')} bản trình đang chờ bạn duyệt.
            </p>
          </div>
          <Button asChild>
            <Link className="no-underline" href="/dms/trinh-duyet">
              Mở hàng chờ
            </Link>
          </Button>
        </section>
      ) : null}
    </section>
  );
}
