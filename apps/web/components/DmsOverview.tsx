import Link from 'next/link';
import { KpiStrip } from './KpiStrip';
import {
  DMS_DOMAINS,
  loadDmsAmendments,
  loadDmsCases,
  loadDmsReport,
  type DmsCaseRow,
} from '../lib/dms';

const BAR: Record<string, string> = {
  vibang: 'bg-[#1f4fa3]',
  tongdat: 'bg-[#1f8a5a]',
  xacminh: 'bg-[#7c3aed]',
  tochuc: 'bg-[#a35a14]',
};
const SHORT: Record<string, string> = {
  vibang: 'Vi bằng',
  tongdat: 'Tống đạt',
  xacminh: 'Xác minh THA',
  tochuc: 'Tổ chức THA',
};

/** Tổng quan DMS (Figma T1): thẻ số, hồ sơ theo nghiệp vụ, hồ sơ cần bổ sung scan. Số liệu chỉ từ hồ sơ đã lưu chính thức trong quyền của người xem. */
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
  const [report, pending, ...lists] = await Promise.all([
    loadDmsReport(cookie, officeId, year),
    loadDmsAmendments(cookie, officeId, { status: 'PENDING' }),
    ...DMS_DOMAINS.map((d) => loadDmsCases(cookie, officeId, d.code, 'chinh-thuc')),
  ]);
  const rows = (report === 'error' ? [] : report).filter((r) =>
    DMS_DOMAINS.some((d) => d.code === r.domain),
  );
  const total = rows.reduce((n, r) => n + r.recorded_cases, 0);
  const docs = rows.reduce((n, r) => n + r.documents, 0);
  const missing: { row: DmsCaseRow; slug: string }[] = [];
  lists.forEach((l, i) => {
    if (l === 'error') return;
    for (const r of l)
      if (r.document_count > 0 && r.scan_count === 0)
        missing.push({ row: r, slug: DMS_DOMAINS[i]!.slug });
  });
  const countOf = (code: string) => rows.find((r) => r.domain === code)?.recorded_cases ?? 0;
  const max = Math.max(1, ...DMS_DOMAINS.map((d) => countOf(d.code)));
  return (
    <section aria-labelledby="t">
      <h1 id="t">Tổng quan</h1>
      <KpiStrip
        label={`Tổng quan hồ sơ năm ${year}`}
        items={[
          { label: `Hồ sơ năm ${year}`, value: total },
          { label: 'Tài liệu hiện hành', value: docs, tone: 'ok' },
          { label: 'Hồ sơ thiếu scan', value: missing.length, tone: 'danger' },
          {
            label: 'Yêu cầu sửa đổi chờ duyệt',
            value: pending === 'error' ? 0 : pending.length,
            tone: 'warn',
          },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="by-domain" className="rounded-2xl bg-surface p-5 shadow-sm">
          <h2 id="by-domain">Hồ sơ theo nghiệp vụ</h2>
          <ul className="m-0 grid list-none gap-3 p-0">
            {DMS_DOMAINS.map((d) => {
              const n = countOf(d.code);
              return (
                <li
                  key={d.code}
                  className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm"
                >
                  <Link href={`/dms/${d.slug}`}>{SHORT[d.code]}</Link>
                  <span
                    className={`h-3 rounded ${BAR[d.code]}`}
                    style={{ width: `${Math.max(2, (n / max) * 100)}%` }}
                    aria-hidden="true"
                  />
                  <strong>{n}</strong>
                </li>
              );
            })}
          </ul>
        </section>
        <section aria-labelledby="need-scan" className="rounded-2xl bg-surface p-5 shadow-sm">
          <h2 id="need-scan">Cần bổ sung scan</h2>
          {missing.length === 0 ? (
            <p className="muted">Không có hồ sơ nào thiếu bản scan.</p>
          ) : (
            <ul className="m-0 grid list-none gap-3 p-0">
              {missing.slice(0, 6).map(({ row, slug }) => (
                <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <strong>{row.title}</strong>{' '}
                    <span className="muted">
                      {row.scan_count}/{row.document_count} tài liệu có scan
                    </span>
                  </span>
                  <Link href={`/dms/${slug}/${row.id}?tab=tai-lieu`}>Mở</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
