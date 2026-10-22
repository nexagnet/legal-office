import Link from 'next/link';
import { ModuleState } from '../components/ModuleState';
import { isOpenCase, loadCases, summarizeCases } from '../lib/cases';
import { DeadlineReminders } from '../components/DeadlineReminders';
import { loadDeadlines } from '../lib/deadlines-api';
import { CASE_STATUS_LABEL } from '../lib/messages';
import { API_URL, currentSession, requestCookie } from '../lib/server';
import { NAV, OVERVIEW } from './nav';

export const dynamic = 'force-dynamic';

/** Bốn nghiệp vụ trên màn Tổng quan (Figma 56:2). */
const DOMAINS = [
  {
    slug: 'vi-bang',
    name: 'VI BẰNG',
    sub: 'Giai đoạn 1 · đã chốt nghiệp vụ',
    meta: 'Quản lý hồ sơ, cấp số, bản scan',
  },
  {
    slug: 'tong-dat',
    name: 'TỐNG ĐẠT',
    sub: 'Khung nghiệp vụ đã chốt · duyệt UX chi tiết',
    meta: 'Hợp đồng N-01, biên bản N-02, S-01',
  },
  {
    slug: 'xac-minh',
    name: 'XÁC MINH',
    sub: 'Khung nghiệp vụ đã chốt · duyệt UX chi tiết',
    meta: 'Hợp đồng N-05, quyết định N-06, S-04',
  },
  {
    slug: 'to-chuc-tha',
    name: 'TỔ CHỨC THI HÀNH ÁN',
    sub: 'Khung nghiệp vụ đã chốt · duyệt UX chi tiết',
    meta: 'Hợp đồng N-07, hồ sơ N-08, S-05',
  },
] as const;

const COMMON_WORK = [
  'Khách hàng, hồ sơ và hợp đồng',
  'Sổ sách S-01, S-02, S-04, S-05, S-06',
  'Công văn, quyết định, kho tài liệu',
  'Vật tư giấy/mực theo FIFO',
  'Quản lý nhân sự và chi nhánh',
  'Không có phân hệ kế toán; dùng MISA',
];

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

const canSeeCases = (roles: readonly string[]) =>
  (NAV.find((n) => n.slug === 'vi-bang')?.roles ?? []).some((r) => roles.includes(r));

export default async function HomePage() {
  const session = await currentSession();
  if (session.status !== 'authenticated' || !canSeeCases(session.roles)) {
    return <ModuleState item={OVERVIEW} session={session} />;
  }
  const cookie = await requestCookie();
  const cases = await loadCases(cookie);
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
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  const deadlines = officeId ? await loadDeadlines(cookie, officeId) : 'error';
  const activity = officeId ? await loadActivity(cookie, officeId) : [];
  const activityMax = Math.max(1, ...activity.map(activityTotal));
  const sum = summarizeCases(cases);
  const today = cases.filter(isOpenCase).slice(0, 4);
  const reminders: string[] = [
    sum.unassigned > 0 ? `${sum.unassigned} hồ sơ chưa phân công THV` : '',
    sum.awaitingReturn > 0 ? `${sum.awaitingReturn} hồ sơ đã ký/đóng dấu, chờ trả khách` : '',
  ].filter(Boolean);
  const visible = DOMAINS.filter((d) =>
    (NAV.find((n) => n.slug === d.slug)?.roles ?? []).some((r) => session.roles.includes(r)),
  );
  const canReview = (NAV.find((n) => n.slug === 'hop-duyet')?.roles ?? []).some((r) =>
    session.roles.includes(r),
  );
  return (
    <section aria-labelledby="t">
      <h1 id="t" className="sr-only">
        Tổng quan hoạt động Văn phòng
      </h1>
      <div className="domains">
        {visible.map((d) => (
          <Link key={d.slug} href={`/${d.slug}`} className="domain" data-domain={d.slug}>
            <span className="domain-flag" aria-hidden="true" />
            <span className="domain-name">{d.name}</span>
            <span className="domain-sub">{d.sub}</span>
            <span className="domain-meta">
              <span className="domain-meta-line">{d.meta}</span>
              {d.slug === 'vi-bang' ? (
                <span className="domain-count">
                  {sum.open} đang xử lý · {sum.unassigned} chưa phân công · {sum.awaitingReturn} chờ
                  trả khách
                </span>
              ) : null}
            </span>
          </Link>
        ))}
      </div>
      <div className="panel common-work">
        <h2>Công việc chung toàn Văn phòng</h2>
        <ul>
          {COMMON_WORK.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <div className="panels">
        <div className="panel">
          <h2>Hồ sơ cần xử lý</h2>
          {today.length === 0 ? (
            <p className="muted">Không có hồ sơ đang xử lý.</p>
          ) : (
            <ul className="rows">
              {today.map((c) => (
                <li key={c.id}>
                  <Link href={`/vi-bang/${c.id}`}>{c.title}</Link>
                  <span className="badge" data-status={c.status}>
                    {CASE_STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          <h2>Nhắc việc và cảnh báo</h2>
          <p>
            <Link href="/viec-cua-toi">Việc của tôi: hồ sơ đang giao cho bạn</Link>
          </p>
          {canReview ? (
            <p>
              <Link href="/hop-duyet">Hộp duyệt: đề xuất chờ duyệt, trả lại, nộp lại</Link>
            </p>
          ) : null}
          {reminders.length === 0 ? (
            <p className="muted">Không có việc cần nhắc.</p>
          ) : (
            <ul className="reminders">
              {reminders.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {activity.length > 0 ? (
        <section className="panel branch-activity" aria-labelledby="act-t">
          <h2 id="act-t">Hoạt động theo địa điểm</h2>
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
        </section>
      ) : null}
      <DeadlineReminders items={deadlines} />
    </section>
  );
}
