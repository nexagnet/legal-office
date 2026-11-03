import { getJson } from './case-api';

/** Trạng thái một bản trình (N4): chờ Admin duyệt, đã duyệt, bị từ chối (có lý do). */
export type SubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
};

export const SUBMISSION_STATUSES: readonly SubmissionStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

export const isSubmissionStatus = (v: string | undefined): v is SubmissionStatus =>
  v === 'PENDING' || v === 'APPROVED' || v === 'REJECTED';

export interface SubmissionRow {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: SubmissionStatus;
  readonly case_id: string | null;
  readonly case_title: string | null;
  /** Số hồ sơ của hồ sơ liên quan (nếu có). */
  readonly case_number: string | null;
  readonly submitted_by: string;
  readonly submitted_at: string;
  readonly decided_by: string | null;
  readonly decided_at: string | null;
  readonly decision_note: string | null;
  readonly file_count: number;
}

export interface SubmissionFile {
  readonly id: string;
  readonly label: string;
  readonly mime: string;
  readonly sha256: string;
  readonly size_bytes: number | string;
  readonly created_by: string;
  readonly created_at: string;
}

export interface SubmissionDetail extends SubmissionRow {
  readonly office_id: string;
  readonly files: readonly SubmissionFile[];
}

export interface SubmissionList {
  readonly rows: readonly SubmissionRow[];
  readonly total: number;
}

/** Danh sách bản trình: người gửi chỉ thấy bản của mình, Admin thấy cả văn phòng (do máy chủ quyết định). */
export function loadSubmissions(
  cookie: string | null,
  p: {
    readonly officeId: string;
    readonly status?: SubmissionStatus;
    readonly q?: string;
    readonly limit?: number;
    readonly offset?: number;
  },
): Promise<SubmissionList | 404 | 'error'> {
  const q = new URLSearchParams({ officeId: p.officeId });
  if (p.status) q.set('status', p.status);
  if (p.q?.trim()) q.set('q', p.q.trim().slice(0, 200));
  q.set('limit', String(p.limit ?? 50));
  q.set('offset', String(p.offset ?? 0));
  return getJson<SubmissionList>(`/dms/submissions?${q}`, cookie);
}

export function loadSubmission(
  cookie: string | null,
  id: string,
): Promise<SubmissionDetail | 404 | 'error'> {
  return getJson<SubmissionDetail>(`/dms/submissions/${encodeURIComponent(id)}`, cookie);
}

/** Số bản trình chờ duyệt (huy hiệu ở thanh bên). Người không phải Admin luôn nhận 0. */
export async function loadPendingSubmissionCount(
  cookie: string | null,
  officeId: string,
): Promise<number> {
  const body = await getJson<{ pending: number }>(
    `/dms/submissions/pending-count?officeId=${encodeURIComponent(officeId)}`,
    cookie,
  );
  return body === 404 || body === 'error' ? 0 : body.pending;
}
