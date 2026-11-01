import { messageFor } from './messages';

/**
 * Phân quyền theo NHÓM QUYỀN DMS (Figma N11 · P0–P12). Quyền hiệu lực = các nhóm của người đó; không có vai trò nào tự cấp quyền.
 * Mọi thay đổi quyền/thành viên nhóm đi qua yêu cầu đề xuất → Admin khác duyệt (Admin tự đề xuất thì áp dụng ngay, có nhật ký).
 * Tệp này chỉ gom kiểu dữ liệu, nhãn tiếng Việt và hàm thuần; việc kiểm quyền thật nằm ở DB.
 */

export interface DmsGroup {
  readonly id: string;
  readonly name: string;
  readonly permissions: readonly string[];
  readonly member_ids: readonly string[];
  /** Từ migration 0088; thiếu khi nói chuyện với API cũ thì coi như nhóm tùy chỉnh đang dùng, phiên bản 1. */
  readonly kind?: 'TEMPLATE' | 'CUSTOM';
  readonly description?: string | null;
  readonly status?: 'ACTIVE' | 'RETIRED';
  readonly version?: number;
  readonly source_group_id?: string | null;
  /** Từ migration 0100, lấy từ nhật ký: người tạo nhóm, và người duyệt thay đổi quyền gần nhất. Thiếu = chưa biết. */
  readonly created_by?: string | null;
  readonly created_at?: string | null;
  readonly approved_by?: string | null;
  readonly approved_at?: string | null;
}

export const isGroupActive = (g: DmsGroup): boolean => (g.status ?? 'ACTIVE') === 'ACTIVE';
export const isTemplateGroup = (g: DmsGroup): boolean => g.kind === 'TEMPLATE';
export const groupVersion = (g: DmsGroup): number => g.version ?? 1;

export type RequestKind = 'GRANT' | 'REVOKE' | 'ADD_MEMBER' | 'REMOVE_MEMBER';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface PermissionRequest {
  readonly id: string;
  readonly group_id: string;
  readonly kind: RequestKind;
  readonly permission: string | null;
  readonly user_id: string | null;
  readonly reason: string;
  readonly status: RequestStatus;
  readonly proposed_by: string;
  readonly proposed_at: string;
  readonly reviewed_by: string | null;
  readonly reviewed_at: string | null;
  readonly review_reason: string | null;
  /** Admin tự đề xuất: có hiệu lực ngay, không cần ai duyệt (vẫn ghi nhật ký). */
  readonly auto_applied?: boolean;
}

/* ───────────── Nhãn quyền ───────────── */

export const PERMISSION_DOMAINS = [
  ['vibang', 'Vi bằng'],
  ['tongdat', 'Tống đạt'],
  ['xacminh', 'Xác minh điều kiện THA'],
  ['tochuc', 'Tổ chức thi hành án'],
  ['vtden', 'Văn thư · Văn bản đến'],
  ['vtdi', 'Văn thư · Văn bản đi'],
  ['vtnb', 'Văn thư · Văn bản nội bộ'],
] as const;

export const PERMISSION_ACTIONS = [
  ['read', 'Xem hồ sơ'],
  ['draft', 'Tạo, sửa, hủy bản nháp'],
  ['confirm', 'Xác nhận lưu chính thức'],
  ['add_document', 'Thêm tài liệu và tải tệp lên'],
  ['download', 'Tải tệp, in'],
  ['amend_request', 'Đề nghị sửa đổi hồ sơ đã lưu'],
] as const;

export const SCOPE_LABEL: Readonly<Record<string, string>> = {
  own: 'Hồ sơ do tôi tạo',
  all: 'Mọi hồ sơ của văn phòng',
};

/** Quyền không thuộc một nghiệp vụ. */
export const SPECIAL_PERMISSIONS: Readonly<Record<string, string>> = {
  'dms.permission.propose': 'Đề xuất đổi quyền',
  'dms.permission.approve': 'Duyệt thay đổi quyền',
  'dms.amendment.approve': 'Duyệt yêu cầu sửa đổi hồ sơ',
  'dms.stock.write': 'Nhập, xuất, kiểm kê văn phòng phẩm',
  'dms.legacy.import': 'Nhập tài liệu cũ',
  'dms.legacy.read': 'Xem tài liệu cũ đã nhập',
  'dms.audit.export': 'Xuất bản sao nhật ký phân quyền',
};

const DOMAIN_LABEL = new Map<string, string>(PERMISSION_DOMAINS);
const ACTION_LABEL = new Map<string, string>(PERMISSION_ACTIONS);

export interface ParsedPermission {
  readonly domain: string;
  readonly action: string;
  readonly scope: string;
}

export function parsePermission(code: string): ParsedPermission | null {
  const m = /^([a-z]+)\.([a-z_]+)\.(own|all)$/.exec(code);
  const domain = m?.[1];
  const action = m?.[2];
  const scope = m?.[3];
  return domain && action && scope && DOMAIN_LABEL.has(domain) && ACTION_LABEL.has(action)
    ? { domain, action, scope }
    : null;
}

export function permissionLabel(code: string): string {
  const special = SPECIAL_PERMISSIONS[code];
  if (special) return special;
  const p = parsePermission(code);
  if (!p) return code;
  return `${DOMAIN_LABEL.get(p.domain)} · ${ACTION_LABEL.get(p.action)} (${SCOPE_LABEL[p.scope]})`;
}

/** Quyền nhạy cảm: tải/in tệp, lưu chính thức, quản trị quyền, kho, nhập tài liệu cũ (Figma P0: Nhạy cảm / Bảo lưu). */
export function isSensitivePermission(code: string): boolean {
  if (code in SPECIAL_PERMISSIONS) return true;
  const p = parsePermission(code);
  return p?.action === 'download' || p?.action === 'confirm';
}

/** Mô tả ngắn: các nghiệp vụ nhóm đụng tới, hoặc "Quản trị" nếu có quyền duyệt/đề xuất. */
export function summarizeGroup(g: DmsGroup): string {
  const domains = [
    ...new Set(
      g.permissions.map((c) => parsePermission(c)?.domain).filter((d): d is string => !!d),
    ),
  ];
  const names = PERMISSION_DOMAINS.filter(([k]) => domains.includes(k)).map(([, label]) => label);
  const admin = g.permissions.some((c) => c.startsWith('dms.'));
  const parts = [...names, ...(admin ? ['Quản trị'] : [])];
  return parts.length > 0 ? parts.join(', ') : 'Chưa có quyền nào';
}

/**
 * Phạm vi mặc định của nhóm (cột "Phạm vi mặc định", Figma P3). Suy từ quyền, không lưu riêng:
 * có quyền duyệt thay đổi quyền → toàn văn phòng; chỉ có quyền "hồ sơ do tôi tạo" → hồ sơ của chính mình;
 * còn lại → theo địa điểm được gán.
 */
export function defaultScopeLabel(g: DmsGroup): string {
  if (g.permissions.includes('dms.permission.approve')) return 'Toàn văn phòng';
  const parsed = g.permissions.map((c) => parsePermission(c)).filter((p) => p !== null);
  if (parsed.length > 0 && parsed.every((p) => p.scope === 'own')) return 'Hồ sơ do tôi tạo';
  return 'Theo địa điểm';
}

export interface PermissionSection {
  readonly title: string;
  readonly items: readonly {
    readonly code: string;
    readonly label: string;
    /** Tên hành động (không kèm phạm vi) và nhãn phạm vi; quyền quản trị thì không có phạm vi. */
    readonly action: string;
    readonly scope: string | null;
  }[];
  /** Hành động của nghiệp vụ này mà nhóm không có (cả hai phạm vi). Rỗng với mục Quản trị. */
  readonly missing: readonly string[];
}

/** Gom quyền của một nhóm theo nghiệp vụ để hiển thị (P6). Quyền quản trị đứng cuối. */
export function groupPermissionSections(permissions: readonly string[]): PermissionSection[] {
  const sections: PermissionSection[] = [];
  for (const [domain, title] of PERMISSION_DOMAINS) {
    const items = permissions
      .map((code) => ({ code, p: parsePermission(code) }))
      .filter((x) => x.p?.domain === domain)
      .sort((a, b) => actionRank(a.p?.action) - actionRank(b.p?.action))
      .map(({ code, p }) => {
        const action = ACTION_LABEL.get(p?.action ?? '') ?? code;
        const scope = SCOPE_LABEL[p?.scope ?? ''] ?? '';
        return { code, label: `${action} · ${scope}`, action, scope };
      });
    const have = new Set(
      permissions
        .map((c) => parsePermission(c))
        .filter((x) => x?.domain === domain)
        .map((x) => x?.action),
    );
    const missing = PERMISSION_ACTIONS.filter(([a]) => !have.has(a)).map(([, label]) => label);
    if (items.length > 0) sections.push({ title, items, missing });
  }
  const special = permissions
    .filter((c) => c in SPECIAL_PERMISSIONS)
    .map((code) => {
      const label = SPECIAL_PERMISSIONS[code] ?? code;
      return { code, label, action: label, scope: null };
    });
  if (special.length > 0) sections.push({ title: 'Quản trị', items: special, missing: [] });
  return sections;
}

const actionRank = (a: string | undefined) =>
  PERMISSION_ACTIONS.findIndex(([k]) => k === a) + (a === undefined ? 99 : 0);

/** Mọi mã quyền có thể gán vào nhóm (đúng danh mục DB cho phép). */
export function allPermissionCodes(): string[] {
  return [
    ...PERMISSION_DOMAINS.flatMap(([d]) =>
      PERMISSION_ACTIONS.flatMap(([a]) => (['own', 'all'] as const).map((s) => `${d}.${a}.${s}`)),
    ),
    ...Object.keys(SPECIAL_PERMISSIONS),
  ];
}

/* ───────────── Quyền riêng theo tài khoản (migration 0099) ───────────── */

/** Quyền quản trị phân quyền chỉ theo nhóm, không cấp/thu riêng (DB từ chối). */
const GROUP_ONLY = new Set([
  'dms.permission.propose',
  'dms.permission.approve',
  'dms.amendment.approve',
]);
export const isOverridable = (code: string): boolean => !GROUP_ONLY.has(code);

/** Mọi mã quyền tick được trên cây quyền riêng. */
export function overridableCodes(): string[] {
  return allPermissionCodes().filter(isOverridable);
}

export interface UserOverride {
  readonly id: string;
  readonly user_id: string;
  readonly permission: string;
  readonly effect: 'GRANT' | 'REVOKE';
  readonly set_by: string;
  readonly set_at: string;
  readonly reason: string;
  readonly ended_by: string | null;
  readonly ended_at: string | null;
  readonly end_reason: string | null;
}

export type PermissionSource = 'group' | 'grant' | 'revoke' | 'none';

/** Nền của các nhóm (chỉ phần cấp/thu riêng được) mà một danh sách mã quyền tạo ra. */
export const overridableBaseline = (groupCodes: readonly string[]): Set<string> =>
  new Set(groupCodes.filter(isOverridable));

/** Một quyền đến từ đâu: theo nhóm, cấp riêng, thu riêng, hay không có. `desired` là tập đang tick. */
export function permissionSource(
  code: string,
  baseline: ReadonlySet<string>,
  desired: ReadonlySet<string>,
): PermissionSource {
  const inBase = baseline.has(code);
  const on = desired.has(code);
  if (inBase && on) return 'group';
  if (!inBase && on) return 'grant';
  if (inBase && !on) return 'revoke';
  return 'none';
}

/** Tập quyền mong muốn từ nền nhóm + các dòng quyền riêng đang hiệu lực. */
export function applyOverrides(
  baseline: ReadonlySet<string>,
  active: readonly Pick<UserOverride, 'permission' | 'effect'>[],
): Set<string> {
  const out = new Set(baseline);
  for (const o of active) {
    if (o.effect === 'GRANT') out.add(o.permission);
    else out.delete(o.permission);
  }
  return out;
}

export const PERMISSION_SOURCE_LABEL: Readonly<Record<Exclude<PermissionSource, 'none'>, string>> =
  {
    group: 'Theo nhóm',
    grant: 'Thêm riêng',
    revoke: 'Bỏ riêng',
  };

/** Hai tập quyền có giống nhau không (để biết đã tick lệch so với nền hay chưa). */
export const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && [...a].every((x) => b.has(x));

/* ───────────── Yêu cầu đổi quyền ───────────── */

export const KIND_LABEL: Readonly<Record<RequestKind, string>> = {
  GRANT: 'Thêm quyền',
  REVOKE: 'Thu hồi quyền',
  ADD_MEMBER: 'Gán nhóm',
  REMOVE_MEMBER: 'Gỡ khỏi nhóm',
};

export const STATUS_LABEL: Readonly<Record<RequestStatus, string>> = {
  PENDING: 'Chờ Admin duyệt',
  APPROVED: 'Đã áp dụng',
  REJECTED: 'Bị từ chối',
};

/** Mã hiển thị ngắn của một yêu cầu, ví dụ PQ-3F9A. Chỉ để gọi cho tiện; mã thật là UUID. */
export const requestCode = (id: string): string =>
  `PQ-${id.replace(/-/g, '').slice(-4).toUpperCase()}`;

export interface NameBook {
  readonly groupName: (id: string) => string;
  readonly userName: (id: string | null) => string;
}

/** Câu mô tả một yêu cầu: "Văn thư chi nhánh · thêm Xem scan", "Hoàng An Nhiên → Văn thư chi nhánh". */
export function describeRequest(r: PermissionRequest, names: NameBook): string {
  const group = names.groupName(r.group_id);
  switch (r.kind) {
    case 'GRANT':
      return `Nhóm “${group}”: thêm quyền ${permissionLabel(r.permission ?? '')}`;
    case 'REVOKE':
      return `Nhóm “${group}”: thu hồi quyền ${permissionLabel(r.permission ?? '')}`;
    case 'ADD_MEMBER':
      return `Gán ${names.userName(r.user_id)} vào nhóm “${group}”`;
    default:
      return `Gỡ ${names.userName(r.user_id)} khỏi nhóm “${group}”`;
  }
}

/** Đối tượng của yêu cầu: người (gán/gỡ) hoặc nhóm (đổi quyền). */
export function requestSubject(r: PermissionRequest, names: NameBook): string {
  return r.kind === 'ADD_MEMBER' || r.kind === 'REMOVE_MEMBER'
    ? names.userName(r.user_id)
    : names.groupName(r.group_id);
}

/** Yêu cầu còn khớp trạng thái hiện tại của nhóm không (DB kiểm lại khi duyệt; đây chỉ để báo trước). */
export function isRequestStale(r: PermissionRequest, group: DmsGroup | undefined): boolean {
  if (!group) return true;
  switch (r.kind) {
    case 'GRANT':
      return group.permissions.includes(r.permission ?? '');
    case 'REVOKE':
      return !group.permissions.includes(r.permission ?? '');
    case 'ADD_MEMBER':
      return r.user_id !== null && group.member_ids.includes(r.user_id);
    default:
      return r.user_id === null || !group.member_ids.includes(r.user_id);
  }
}

export type RequestResult = 'pending' | 'applied' | 'auto' | 'rejected';

export function resultOf(r: PermissionRequest): RequestResult {
  if (r.status === 'PENDING') return 'pending';
  if (r.status === 'REJECTED') return 'rejected';
  return r.auto_applied ? 'auto' : 'applied';
}

export const RESULT_LABEL: Readonly<Record<RequestResult, string>> = {
  pending: 'Chờ duyệt',
  applied: 'Đã áp dụng',
  auto: 'Đã áp dụng (Admin tự đề xuất)',
  rejected: 'Bị từ chối',
};

/** Nhóm nào của một người, và quyền hiệu lực là hợp các quyền của các nhóm đó (P2). */
export function groupsOfUser(groups: readonly DmsGroup[], userId: string): DmsGroup[] {
  // Nhóm ngừng dùng không cấp quyền hiệu lực (DB bỏ qua), nên không tính ở đây.
  return groups.filter((g) => isGroupActive(g) && g.member_ids.includes(userId));
}

export function effectivePermissions(
  groups: readonly DmsGroup[],
  userId: string,
  overrides: readonly Pick<UserOverride, 'permission' | 'effect'>[] = [],
): string[] {
  const fromGroups = new Set(groupsOfUser(groups, userId).flatMap((g) => g.permissions));
  for (const o of overrides) {
    if (o.effect === 'GRANT') fromGroups.add(o.permission);
    else fromGroups.delete(o.permission);
  }
  return [...fromGroups].sort();
}

/** Tên hiển thị tách khỏi nhãn "Tên (email)" do API ghép sẵn. */
export function splitLabel(label: string): { name: string; email: string | null } {
  const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(label);
  const name = m?.[1];
  const email = m?.[2];
  return name && email ? { name, email } : { name: email ?? label, email: null };
}

export function makeNameBook(
  groups: readonly DmsGroup[],
  people: readonly { userId: string; label: string }[],
): NameBook {
  const g = new Map(groups.map((x) => [x.id, x.name]));
  const p = new Map(people.map((x) => [x.userId, splitLabel(x.label).name]));
  return {
    groupName: (id) => g.get(id) ?? 'Nhóm không còn',
    userName: (id) => (id ? (p.get(id) ?? 'Người dùng khác') : '—'),
  };
}

/* ───────────── Dòng "người dùng và quyền hiệu lực" ───────────── */

export interface PersonRow {
  readonly userId: string;
  readonly label: string;
  readonly name: string;
  readonly email: string | null;
  readonly isAdmin: boolean;
  readonly hasLogin: boolean;
  /** Tạm khóa: không đăng nhập, không có quyền hiệu lực; dữ liệu và lịch sử giữ nguyên. */
  readonly suspended: boolean;
  readonly legacyRole: string | null;
  readonly branches: readonly string[];
  readonly groups: readonly DmsGroup[];
  /** Yêu cầu đang chờ liên quan người này (gán / gỡ nhóm). */
  readonly pending: readonly PermissionRequest[];
}

export type AccountState = 'active' | 'no-access' | 'waiting' | 'suspended';

/** Admin (vai ADMIN) mặc nhiên đủ quyền; người khác có quyền khi thuộc ít nhất một nhóm. */
export function accountState(p: PersonRow): AccountState {
  if (p.suspended) return 'suspended';
  if (p.isAdmin || p.groups.length > 0) return 'active';
  return p.pending.length > 0 ? 'waiting' : 'no-access';
}

export const ACCOUNT_STATE_LABEL: Readonly<Record<AccountState, string>> = {
  active: 'Hoạt động',
  'no-access': 'Đã tạo, chưa có quyền',
  waiting: 'Chờ phê duyệt',
  suspended: 'Tạm khóa',
};

interface MemberInput {
  readonly userId: string;
  readonly label: string;
  readonly role: string | null;
  readonly hasLogin: boolean;
  readonly suspended?: boolean;
  readonly branches: readonly string[];
}

/** Gộp các dòng thành viên (một người có thể có nhiều vai) thành một dòng mỗi người. */
export function buildPersonRows(
  members: readonly MemberInput[],
  groups: readonly DmsGroup[],
  requests: readonly PermissionRequest[],
): PersonRow[] {
  const byUser = new Map<string, MemberInput[]>();
  for (const m of members) byUser.set(m.userId, [...(byUser.get(m.userId) ?? []), m]);
  const pending = requests.filter((r) => r.status === 'PENDING');
  return [...byUser.entries()].map(([userId, rows]) => {
    const first = rows[0] as MemberInput;
    const { name, email } = splitLabel(first.label);
    // THANH_VIEN chỉ là tư cách thành viên không quyền, không phải "vai cũ" đáng hiển thị.
    const nonAdmin =
      rows.find((r) => r.role && r.role !== 'ADMIN' && r.role !== 'THANH_VIEN')?.role ?? null;
    return {
      userId,
      label: first.label,
      name,
      email,
      isAdmin: rows.some((r) => r.role === 'ADMIN'),
      hasLogin: rows.some((r) => r.hasLogin),
      suspended: rows.some((r) => r.suspended === true),
      legacyRole: nonAdmin,
      branches: [...new Set(rows.flatMap((r) => r.branches))],
      groups: groupsOfUser(groups, userId),
      pending: pending.filter((r) => r.user_id === userId),
    };
  });
}

export const normalizeText = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Các lý do hệ thống chặn một đề xuất (Figma Q5 · "Hệ thống chặn trước"). Chỉ liệt kê luật DB đang thật sự ép. */
export const BLOCK_RULES: readonly string[] = [
  'Đề xuất trùng với yêu cầu đang chờ',
  'Đề xuất không đổi được gì (quyền đã có, hoặc người đó đã ở trong nhóm)',
  'Thu hồi quyền duyệt hoặc gỡ người duyệt cuối cùng của văn phòng',
  'Người không phải Admin tự duyệt đề xuất của chính mình',
  'Cấp tư cách hành nghề: không có mã quyền nào làm việc này, quản lý riêng ở Thẻ THV',
];

/* ───────────── Thông báo lỗi riêng của phân quyền ───────────── */

/** NO_CHANGE ở đây khác nghĩa với NO_CHANGE của kho, nên có câu riêng trước khi rơi về bảng chung. */
const PERMISSION_MESSAGES: Readonly<Record<string, string>> = {
  NO_CHANGE: 'Đề xuất này không đổi được gì: quyền đã có hoặc người đó đã ở trong nhóm.',
  ALREADY_PENDING: 'Đã có một đề xuất giống hệt đang chờ duyệt.',
  GROUP_NOT_FOUND: 'Không tìm thấy nhóm quyền, hoặc bạn chưa được phép đề xuất.',
  UNKNOWN_PERMISSION: 'Mã quyền không hợp lệ.',
  REQUEST_STALE: 'Nhóm đã đổi sau khi đề xuất được gửi. Hãy gửi lại đề xuất mới.',
  WOULD_REMOVE_LAST_APPROVER: 'Không thể làm văn phòng mất người duyệt cuối cùng.',
  GROUP_NAME_IN_USE: 'Đã có nhóm quyền trùng tên.',
  GROUP_RETIRED: 'Nhóm này đã ngừng dùng. Hãy dùng lại nhóm trước khi đề xuất thay đổi.',
  MEMBER_SUSPENDED: 'Đã tạm khóa tài khoản.',
  MEMBER_REACTIVATED: 'Đã mở khóa tài khoản.',
  TEMPLATE_PROTECTED:
    'Nhóm mẫu được bảo vệ, không sửa trực tiếp. Hãy sao chép thành nhóm tùy chỉnh.',
};

export function permissionMessage(code: string | undefined): string {
  return (code ? PERMISSION_MESSAGES[code] : undefined) ?? messageFor(code);
}

const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

export const formatWhen = (iso: string): string => dateTime.format(new Date(iso));

/** Giới hạn bắt buộc theo nghiệp vụ (Figma P2): luật cứng, không nhóm quyền hay quyền riêng nào mở được. */
const RECORD_LIMIT =
  'Bản nháp sửa tự do đến khi xác nhận lưu chính thức. Sau đó không xóa, không sửa trực tiếp; chỉ sửa qua đề nghị kèm bản quét căn cứ.';
const BOOK_LIMIT =
  'Số đến và STT do hệ thống tự đánh; không tự cấp số hoặc ký hiệu văn bản pháp lý.';
export const DOMAIN_LIMIT: Readonly<Record<string, string>> = {
  vibang: RECORD_LIMIT,
  tongdat: RECORD_LIMIT,
  xacminh: RECORD_LIMIT,
  tochuc: RECORD_LIMIT,
  vtden: BOOK_LIMIT,
  vtdi: BOOK_LIMIT,
  vtnb: BOOK_LIMIT,
};

/** Cột "Phạm vi" của bảng quyền hiệu lực: một phạm vi thì ghi thẳng; nhiều phạm vi thì kèm số hành động. */
export function scopeSummary(actions: readonly { readonly scope: 'own' | 'all' }[]): string {
  const all = actions.filter((a) => a.scope === 'all').length;
  const own = actions.length - all;
  if (all > 0 && own > 0)
    return `${SCOPE_LABEL.all} (${all} hành động) · ${SCOPE_LABEL.own} (${own} hành động)`;
  return SCOPE_LABEL[all > 0 ? 'all' : 'own'] ?? '';
}

export interface EffectiveRow {
  readonly domain: string;
  readonly title: string;
  readonly actions: readonly { readonly label: string; readonly scope: 'own' | 'all' }[];
  readonly sources: readonly string[];
}

/** Quyền hiệu lực của một người theo từng nghiệp vụ (P2): mỗi hành động lấy phạm vi rộng nhất trong các nhóm của họ. */
export function effectiveByDomain(
  groups: readonly DmsGroup[],
  userId: string,
  overrides: readonly Pick<UserOverride, 'permission' | 'effect'>[] = [],
): EffectiveRow[] {
  const mine = groupsOfUser(groups, userId);
  const revoked = new Set(overrides.filter((o) => o.effect === 'REVOKE').map((o) => o.permission));
  const rows: EffectiveRow[] = [];
  for (const [domain, title] of PERMISSION_DOMAINS) {
    const hits = [
      ...mine.flatMap((g) =>
        g.permissions
          .filter((code) => !revoked.has(code))
          .map((code) => ({ p: parsePermission(code), name: g.name })),
      ),
      ...overrides
        .filter((o) => o.effect === 'GRANT')
        .map((o) => ({ p: parsePermission(o.permission), name: 'Thêm riêng' })),
    ];
    const inDomain = hits.filter((h) => h.p?.domain === domain);
    if (inDomain.length === 0) continue;
    const actions: { label: string; scope: 'own' | 'all' }[] = [];
    for (const [action, label] of PERMISSION_ACTIONS) {
      const has = (scope: string) =>
        inDomain.some((h) => h.p?.action === action && h.p.scope === scope);
      if (has('all')) actions.push({ label, scope: 'all' });
      else if (has('own')) actions.push({ label, scope: 'own' });
    }
    rows.push({ domain, title, actions, sources: [...new Set(inDomain.map((h) => h.name))] });
  }
  return rows;
}

/** Dòng gọn, truyền được sang component máy khách (không kèm danh sách quyền của nhóm). */
export interface MemberRow {
  readonly userId: string;
  readonly name: string;
  readonly email: string | null;
  readonly branches: readonly string[];
  readonly isAdmin: boolean;
  readonly state: AccountState;
  readonly groupNames: readonly string[];
  /** Có đề xuất đang chờ liên quan người này. */
  readonly pending: boolean;
  readonly legacyRole: string | null;
  readonly suspended: boolean;
}

export function toMemberRow(p: PersonRow): MemberRow {
  return {
    userId: p.userId,
    name: p.name,
    email: p.email,
    branches: p.branches,
    isAdmin: p.isAdmin,
    state: accountState(p),
    groupNames: p.groups.map((g) => g.name),
    pending: p.pending.length > 0,
    legacyRole: p.legacyRole,
    suspended: p.suspended,
  };
}
