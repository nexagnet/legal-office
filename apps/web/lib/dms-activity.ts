import { getJson } from './case-api';

/** Nhóm lọc của Lịch sử hoạt động; khớp tham số `group` của `GET /dms/activity`. */
export type ActivityGroup = 'case' | 'document' | 'file' | 'submission' | 'permission';

export const ACTIVITY_GROUPS: readonly (readonly [ActivityGroup, string])[] = [
  ['case', 'Hồ sơ'],
  ['document', 'Tài liệu'],
  ['file', 'Tệp & scan'],
  ['submission', 'Trình / Duyệt'],
  ['permission', 'Phân quyền'],
];

export const isActivityGroup = (v: string | undefined): v is ActivityGroup =>
  ACTIVITY_GROUPS.some(([k]) => k === v);

export interface ActivityRow {
  readonly id: number | string;
  readonly at: string;
  readonly actor_id: string;
  /** Tên hiển thị của người làm; null với tài khoản hệ thống (dọn scan tự động). */
  readonly actor_label: string | null;
  readonly action: string;
  readonly target_type: string;
  readonly target_id: string;
  readonly detail: Record<string, unknown>;
  readonly case_id: string | null;
  readonly case_number: string | null;
  readonly case_title: string | null;
  readonly domain: string | null;
  readonly submission_id: string | null;
  readonly submission_title: string | null;
}

export interface ActivityList {
  readonly rows: readonly ActivityRow[];
  readonly total: number;
}

/** Lịch sử hoạt động của văn phòng. Chỉ Admin có dữ liệu; người khác nhận danh sách rỗng từ máy chủ. */
export function loadActivity(
  cookie: string | null,
  p: {
    readonly officeId: string;
    readonly group?: ActivityGroup;
    readonly q?: string;
    readonly limit?: number;
    readonly offset?: number;
  },
): Promise<ActivityList | 404 | 'error'> {
  const q = new URLSearchParams({
    officeId: p.officeId,
    limit: String(p.limit ?? 50),
    offset: String(p.offset ?? 0),
  });
  if (p.group) q.set('group', p.group);
  if (p.q?.trim()) q.set('q', p.q.trim().slice(0, 200));
  return getJson<ActivityList>(`/dms/activity?${q}`, cookie);
}

const ACTION_LABEL: Readonly<Record<string, string>> = {
  'dms.case.create_draft': 'Tạo nháp hồ sơ',
  'dms.case.update_draft': 'Sửa nháp hồ sơ',
  'dms.case.cancel_draft': 'Hủy nháp hồ sơ',
  'dms.case.record': 'Xác nhận lưu chính thức (cấp số hồ sơ)',
  'dms.case.set_returned': 'Đổi ô "Đã trả kết quả"',
  'dms.case.set_branch': 'Gán chi nhánh cho hồ sơ',
  'dms.case.set_thv': 'Ghi tên thừa hành viên',
  'dms.case.admin_edit': 'Admin sửa hồ sơ đã ghi sổ',
  'dms.thv.confirm': 'Thừa hành viên xác nhận',
  'dms.document.add': 'Thêm tài liệu',
  'dms.document.update_draft': 'Sửa nháp tài liệu',
  'dms.document.admin_edit': 'Admin sửa tài liệu đã ghi sổ',
  'dms.file.attach': 'Tải tệp lên',
  'dms.file.download': 'Tải tệp về',
  'dms.scan.delete': 'Xóa file scan',
  'dms.scan.download_deleted': 'Tải scan đã xóa',
  'dms.scan.purge': 'Dọn scan hết hạn 30 ngày (tự động)',
  'dms.submission.create': 'Gửi bản trình',
  'dms.submission.add_files': 'Thêm scan vào bản trình',
  'dms.submission.decide': 'Duyệt / từ chối bản trình',
  'dms.submission.download': 'Tải scan của bản trình',
  'dms.permission.propose': 'Đề xuất đổi quyền',
  'dms.permission.review': 'Duyệt đề xuất đổi quyền',
  'dms.permission.apply': 'Áp dụng đổi quyền',
  'dms.permission.override': 'Đặt quyền riêng cho tài khoản',
  'dms.group.create': 'Tạo nhóm quyền',
  'dms.group.copy': 'Sao chép nhóm quyền',
  'dms.group.set_status': 'Đổi trạng thái nhóm quyền',
  'dms.amendment.propose': 'Gửi yêu cầu sửa đổi (luồng cũ)',
  'dms.amendment.review': 'Duyệt yêu cầu sửa đổi (luồng cũ)',
  'dms.amendment.apply': 'Áp dụng yêu cầu sửa đổi (luồng cũ)',
};

export const actionLabel = (action: string): string => ACTION_LABEL[action] ?? action;

const STATUS: Readonly<Record<string, string>> = {
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
};

/** Chi tiết ngắn của một dòng, chỉ từ các trường đã biết của nhật ký (không in nguyên văn jsonb). */
export function activityNote(row: Pick<ActivityRow, 'action' | 'detail'>): string {
  const d = row.detail;
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  switch (row.action) {
    case 'dms.scan.delete':
      return str('label');
    case 'dms.case.set_returned':
      return d.returned === true ? 'Đã trả kết quả' : d.returned === false ? 'Bỏ đánh dấu' : '';
    case 'dms.submission.decide':
      return STATUS[str('status')] ?? '';
    case 'dms.case.record':
      return str('case_number');
    default:
      return '';
  }
}
