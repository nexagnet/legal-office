import type { CaseItem } from './cases';
import {
  MY_WORK_DOMAIN_LABEL,
  myWorkHref,
  myWorkStatusLabel,
  type MyWorkItem,
} from './my-work-view';
import { APPROVAL_KIND_LABEL } from './messages';

export type GroupTone = 'danger' | 'warn' | 'info';

export interface WorkRow {
  readonly key: string;
  readonly title: string;
  readonly meta: string;
  readonly href: string;
  readonly action: string;
}

export interface WorkGroup {
  readonly title: string;
  readonly tone: GroupTone;
  readonly rows: readonly WorkRow[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const vnDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);

/** Số ngày (theo ngày lịch Việt Nam) từ `a` đến `b`; dương khi `b` sau `a`. */
function dayDiff(a: Date, b: Date): number {
  return Math.round((Date.parse(vnDay(b)) - Date.parse(vnDay(a))) / DAY_MS);
}

const group = (title: string, tone: GroupTone, rows: WorkRow[]): WorkGroup[] =>
  rows.length === 0 ? [] : [{ title: `${title} (${rows.length})`, tone, rows }];

/** Việc của tôi xếp theo độ gấp: quá hạn, hôm nay, trong tuần, còn lại. Mỗi việc đúng một dòng. */
export function groupMyWork(items: readonly MyWorkItem[], now: Date): WorkGroup[] {
  const overdue: WorkRow[] = [];
  const today: WorkRow[] = [];
  const week: WorkRow[] = [];
  const rest: WorkRow[] = [];
  for (const it of items) {
    const href = myWorkHref(it);
    if (!href) continue;
    const row: WorkRow = {
      key: `${it.domain}-${it.refId}`,
      title: it.label,
      meta: `${MY_WORK_DOMAIN_LABEL[it.domain] ?? it.domain} · ${myWorkStatusLabel(it)}`,
      href,
      action: it.overdue ? 'Làm tiếp' : 'Mở',
    };
    const days = it.deadlineAt ? dayDiff(now, new Date(it.deadlineAt)) : null;
    if (it.overdue || (days !== null && days < 0)) overdue.push(row);
    else if (days === 0) today.push(row);
    else if (days !== null && days <= 7) week.push(row);
    else rest.push(row);
  }
  return [
    ...group('Quá hạn', 'danger', overdue),
    ...group('Hôm nay', 'warn', today),
    ...group('Tuần này', 'info', week),
    ...group('Đang xử lý', 'info', rest),
  ];
}

export interface PendingApproval {
  readonly kind: string;
  readonly subjectId: string;
  readonly createdAt: string;
}

/** Đề xuất chờ duyệt: cũ hơn một ngày lên đầu, hôm nay tiếp theo. */
export function groupApprovals(rows: readonly PendingApproval[], now: Date): WorkGroup[] {
  const old: WorkRow[] = [];
  const fresh: WorkRow[] = [];
  const sorted = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const r of sorted) {
    const age = dayDiff(new Date(r.createdAt), now);
    const row: WorkRow = {
      key: `${r.kind}-${r.subjectId}`,
      title: APPROVAL_KIND_LABEL[r.kind] ?? r.kind,
      meta: age <= 0 ? 'Gửi hôm nay' : `Gửi ${age} ngày trước`,
      href: '/hop-duyet',
      action: 'Duyệt',
    };
    (age >= 1 ? old : fresh).push(row);
  }
  return [...group('Quá 1 ngày', 'danger', old), ...group('Hôm nay', 'warn', fresh)];
}

/** Hồ sơ Vi bằng đang chờ Kế toán xác nhận MISA (bước kế tiếp = cấp số), cũ nhất lên trước. */
export function groupMisaQueue(cases: readonly CaseItem[], now: Date): WorkGroup[] {
  const old: WorkRow[] = [];
  const fresh: WorkRow[] = [];
  const queue = cases
    .filter((c) => c.nextStep === 'MISA_NUMBER')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const c of queue) {
    const age = dayDiff(new Date(c.createdAt), now);
    const row: WorkRow = {
      key: `MISA-${c.id}`,
      title: c.title,
      meta: [c.branchName, age <= 0 ? 'Tiếp nhận hôm nay' : `Tiếp nhận ${age} ngày trước`]
        .filter(Boolean)
        .join(' · '),
      href: `/vi-bang/${c.id}`,
      action: 'Xác nhận MISA',
    };
    (age >= 1 ? old : fresh).push(row);
  }
  return [...group('Quá 1 ngày', 'danger', old), ...group('Hôm nay', 'warn', fresh)];
}
