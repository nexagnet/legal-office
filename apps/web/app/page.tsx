import Link from 'next/link';
import { FileText, Gavel, Search, Send, type LucideIcon } from 'lucide-react';
import { ModuleState } from '../components/ModuleState';
import { WorkGroups } from '../components/WorkGroups';
import { loadCases, summarizeCases } from '../lib/cases';
import { loadMyWork, type MyWorkItem } from '../lib/my-work';
import { groupApprovals, groupMisaQueue, groupMyWork, type PendingApproval } from '../lib/overview';
import { DeadlineReminders } from '../components/DeadlineReminders';
import { loadDeadlines } from '../lib/deadlines-api';
import { API_URL, currentSession, requestCookie } from '../lib/server';
import { NAV, OVERVIEW } from './nav';

export const dynamic = 'force-dynamic';

/** Bốn nghiệp vụ trên màn Tổng quan (Figma N12 D3–D5). */
const DOMAINS = [
  { slug: 'vi-bang', name: 'Vi bằng', work: 'VIBANG' },
  { slug: 'tong-dat', name: 'Tống đạt', work: 'TONG_DAT' },
  { slug: 'xac-minh', name: 'Xác minh THA', work: 'XAC_MINH' },
  { slug: 'to-chuc-tha', name: 'Thi hành án', work: 'THI_HANH' },
] as const;

const DOMAIN_ICON: Readonly<Record<string, LucideIcon>> = {
  'vi-bang': FileText,
  'tong-dat': Send,
  'xac-minh': Search,
  'to-chuc-tha': Gavel,
};

function DomainIcon({ slug }: { readonly slug: string }) {
  const Icon = DOMAIN_ICON[slug] ?? FileText;
  return <Icon aria-hidden="true" />;
}

interface BranchActivity {
  readonly branchId: string;
  readonly branchName: string;
  readonly vibangCases: number;
  readonly vibangNumbers: number;
  readonly tongDatDocuments: number;
  readonly xacMinhCases: number;
  readonly thiHanhCases: number;
  readonly correspondence: number;
}

const activityTotal = (b: BranchActivity) =>
  b.vibangCases + b.tongDatDocuments + b.xacMinhCases + b.thiHanhCases + b.correspondence;

/** Hoạt động theo địa điểm từ đầu năm đến hôm nay (giờ Việt Nam); lỗi thì ẩn khối, không chặn trang. */
async function loadActivity(cookie: string | null, officeId: string): Promise<BranchActivity[]> {
  const to = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  const qs = new URLSearchParams({ officeId, from: `${to.slice(0, 4)}-01-01`, to });
  try {
    const res = await fetch(`${API_URL}/office/branches/activity?${qs.toString()}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    return res.ok ? ((await res.json()) as BranchActivity[]) : [];
  } catch {
    return [];
  }
}

/** Đề xuất chờ duyệt (chỉ vai có Hộp duyệt); lỗi thì 'error', không chặn trang. */
async function loadApprovals(
  cookie: string | null,
  officeId: string,
): Promise<PendingApproval[] | 'error'> {
  try {
    const res = await fetch(
      `${API_URL}/approvals/pending?officeId=${encodeURIComponent(officeId)}`,
      {
        headers: cookie ? { cookie } : {},
        cache: 'no-store',
      },
    );
    return res.ok ? ((await res.json()) as PendingApproval[]) : 'error';
  } catch {
    return 'error';
  }
}

const canSeeCases = (roles: readonly string[]) =>
  (NAV.find((n) => n.slug === 'vi-bang')?.roles ?? []).some((r) => roles.includes(r));

export default async function HomePage() {
  const session = await currentSession();
  if (session.status !== 'authenticated' || !canSeeCases(session.roles)) {
    return <ModuleState item={OVERVIEW} session={session} />;
  }
  const cookie = await requestCookie();
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  const canReview = (NAV.find((n) => n.slug === 'hop-duyet')?.roles ?? []).some((r) =>
    session.roles.includes(r),
  );
  const [cases, deadlines, activity, myWork, approvals] = await Promise.all([
    loadCases(cookie),
    officeId ? loadDeadlines(cookie, officeId) : Promise.resolve('error' as const),
    officeId ? loadActivity(cookie, officeId) : Promise.resolve([] as BranchActivity[]),
    officeId ? loadMyWork(cookie, officeId) : Promise.resolve([] as MyWorkItem[]),
    officeId && canReview
      ? loadApprovals(cookie, officeId)
      : Promise.resolve([] as PendingApproval[]),
  ]);
  if (cases === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Tổng quan</h1>
        <div className="state" role="alert">
          <h2>Không tải được số liệu</h2>
          <p>Máy chủ chưa trả về danh sách hồ sơ. Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  const now = new Date();
  const activityMax = Math.max(1, ...activity.map(activityTotal));
  const sum = summarizeCases(cases);
  const work = myWork === 'error' ? [] : myWork;
  const approvalRows = approvals === 'error' ? [] : approvals;
  const overdueDeadlines = deadlines === 'error' ? 0 : deadlines.filter((d) => d.overdue).length;
  const visible = DOMAINS.filter((d) =>
    (NAV.find((n) => n.slug === d.slug)?.roles ?? []).some((r) => session.roles.includes(r)),
  );
  const domainNote = (d: (typeof DOMAINS)[number]) => {
    if (d.slug === 'vi-bang') return `${sum.open} hồ sơ đang xử lý`;
    const n = work.filter((w) => w.domain === d.work).length;
    return n > 0 ? `${n} việc của tôi` : 'Mở danh sách';
  };
  const reviewer =
    canReview && (['TRUONG_VP', 'ADMIN'] as const).some((r) => session.roles.includes(r));
  const accountant = session.roles.every((r) => r === 'KE_TOAN');
  const misaGroups = groupMisaQueue(cases, now);
  const misaCount = misaGroups.reduce((n, g) => n + g.rows.length, 0);
  const groups = accountant
    ? misaGroups
    : reviewer
      ? groupApprovals(approvalRows, now)
      : groupMyWork(work, now);
  const health = [
    {
      n: approvalRows.length,
      label: 'Chờ duyệt',
      note: 'Đề xuất chuyển giao, uỷ quyền',
      href: '/hop-duyet',
    },
    {
      n: overdueDeadlines,
      label: 'Hạn quá',
      note: 'Trong mục Nhắc hạn bên dưới',
      href: '#nhac-han',
    },
    {
      n: sum.unassigned,
      label: 'Chưa phân công',
      note: 'Hồ sơ Vi bằng chưa có THV',
      href: '/vi-bang',
    },
    {
      n: sum.awaitingReturn,
      label: 'Chờ trả khách',
      note: 'Đã ký hoặc đóng dấu',
      href: '/vi-bang',
    },
  ];
  return (
    <section aria-labelledby="t">
      <h1 id="t" className="sr-only">
        Tổng quan hoạt động Văn phòng
      </h1>
      <div className="domain-chips">
        {visible.map((d) => (
          <Link key={d.slug} href={`/${d.slug}`} className="domain-chip" data-domain={d.slug}>
            <DomainIcon slug={d.slug} />
            <span>
              <strong>{d.name}</strong>
              {domainNote(d)}
            </span>
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-5 max-lg:grid-cols-1">
        <WorkGroups
          title={accountant ? 'Chờ xác nhận MISA' : reviewer ? 'Chờ duyệt' : 'Cần làm hôm nay'}
          hint={
            accountant
              ? 'Hồ sơ Vi bằng chờ bạn xác nhận thu đủ trên MISA, cũ nhất lên trước'
              : reviewer
                ? 'Việc cần quyết định của bạn, cũ nhất lên trước'
                : 'Xếp theo độ gấp, mỗi dòng một việc'
          }
          groups={groups}
          empty={
            accountant
              ? 'Không có hồ sơ nào chờ xác nhận MISA.'
              : reviewer
                ? 'Không có đề xuất nào chờ duyệt.'
                : 'Không có việc nào giao cho bạn.'
          }
        />
        {accountant ? (
          <section className="panel" aria-labelledby="misa-t">
            <h2 id="misa-t">Đối soát MISA</h2>
            <p className="muted">
              Hệ thống không ghi số tiền; bạn xác nhận thu đủ trên MISA rồi cấp số Vi bằng.
            </p>
            <p className="m-0 mt-3 text-3xl font-bold text-accent">{misaCount}</p>
            <p className="muted">hồ sơ đang chờ xác nhận</p>
            <p>
              <Link href="/vi-bang">Mở danh sách Vi bằng →</Link>
            </p>
          </section>
        ) : reviewer ? (
          <section className="panel" aria-labelledby="health-t">
            <h2 id="health-t">Sức khoẻ văn phòng</h2>
            <p className="muted">Nhìn nhanh, chi tiết ở Báo cáo</p>
            <ul className="m-0 mt-3 list-none p-0">
              {health.map((h) => (
                <li key={h.label} className="border-b border-line">
                  <Link
                    href={h.href}
                    className="flex items-center gap-4 py-3 text-ink no-underline hover:bg-surface-2"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-lg font-bold text-accent">
                      {h.n}
                    </span>
                    <span className="grid gap-0.5">
                      <span className="font-semibold">{h.label}</span>
                      <span className="text-[13px] text-muted">{h.note}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div id="nhac-han">
            <DeadlineReminders items={deadlines} />
          </div>
        )}
      </div>
      {reviewer ? (
        <div id="nhac-han" className="mt-5">
          <DeadlineReminders items={deadlines} />
        </div>
      ) : null}
      {activity.length > 0 ? (
        <details className="panel branch-activity mt-5">
          <summary className="cursor-pointer font-semibold">
            Hoạt động theo địa điểm: {activity.length} trụ sở, ẩn mặc định cho gọn
          </summary>
          <p className="muted">
            Từ đầu năm đến nay: hồ sơ Vi bằng, văn bản tống đạt, hồ sơ xác minh, thi hành án và công
            văn.
          </p>
          <ul>
            {activity.map((b) => (
              <li key={b.branchId}>
                <span className="branch-activity-name">
                  {b.branchName}
                  <strong>{activityTotal(b)}</strong>
                </span>
                <span className="branch-bar" aria-hidden="true">
                  <span
                    style={{ width: `${Math.round((activityTotal(b) / activityMax) * 100)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <p>
            <Link href="/bao-cao">Xem trong Báo cáo →</Link>
          </p>
        </details>
      ) : null}
    </section>
  );
}
