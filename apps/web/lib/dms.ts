import { API_URL } from './server';

/** Bốn nghiệp vụ DMS. `slug` là đường dẫn web, `code` là mã miền ở API/DB. */
export const DMS_DOMAINS = [
  { slug: 'vi-bang', code: 'vibang', label: 'Vi bằng' },
  { slug: 'tong-dat', code: 'tongdat', label: 'Tống đạt' },
  { slug: 'xac-minh', code: 'xacminh', label: 'Xác minh điều kiện THA' },
  { slug: 'to-chuc-tha', code: 'tochuc', label: 'Tổ chức thi hành án' },
] as const;

/** Ba sổ Văn thư: dùng chung lõi hồ sơ/nháp/scan với bốn nghiệp vụ; `book` là mã sổ xuất. */
export const VAN_THU_DOMAINS = [
  { slug: 'van-ban-den', code: 'vtden', label: 'Văn bản đến', book: 'VT-DEN', bookSlug: 'vt-den' },
  { slug: 'van-ban-di', code: 'vtdi', label: 'Văn bản đi', book: 'VT-DI', bookSlug: 'vt-di' },
  {
    slug: 'van-ban-noi-bo',
    code: 'vtnb',
    label: 'Văn bản nội bộ',
    book: 'VT-NB',
    bookSlug: 'vt-nb',
  },
] as const;

export type DmsDomain = (typeof DMS_DOMAINS)[number] | (typeof VAN_THU_DOMAINS)[number];

export const domainBySlug = (slug: string): DmsDomain | undefined =>
  [...DMS_DOMAINS, ...VAN_THU_DOMAINS].find((d) => d.slug === slug);

export const isVanThu = (code: string): boolean => VAN_THU_DOMAINS.some((d) => d.code === code);

export interface DmsCaseRow {
  readonly id: string;
  readonly domain: string;
  readonly title: string;
  readonly status: 'DRAFT' | 'RECORDED' | 'CANCELLED';
  readonly created_by: string;
  readonly created_at: string;
  readonly recorded_at: string | null;
  /** Số tài liệu logic còn hiệu lực (không tính đã hủy). */
  readonly document_count: number;
  /** Số tệp scan của các tài liệu đó. Phiên bản cũ và bằng chứng sửa đổi chờ duyệt không tính ở đây. */
  readonly scan_count: number;
}

export type DmsTab = 'chinh-thuc' | 'nhap' | 'da-huy';

const TAB_STATUS: Record<DmsTab, DmsCaseRow['status']> = {
  'chinh-thuc': 'RECORDED',
  nhap: 'DRAFT',
  'da-huy': 'CANCELLED',
};

/** `?tab=` lạ rơi về "Chính thức" để không ai thấy nhầm bản nháp của người khác (DB vẫn lọc theo quyền). */
export function activeDmsTab(raw: string | undefined): DmsTab {
  return raw === 'nhap' || raw === 'da-huy' ? raw : 'chinh-thuc';
}
export const statusForTab = (tab: DmsTab) => TAB_STATUS[tab];

/** Sổ nghiệp vụ của từng miền (Văn thư có sổ riêng, không nằm ở đây). */
export const BOOK_OF_DOMAIN: Readonly<Record<string, string>> = {
  tongdat: 'S-01',
  vibang: 'S-02',
  xacminh: 'S-04',
  tochuc: 'S-05',
};

/** Bộ lọc danh sách (chip): chính thức, thiếu/đủ scan (trong số chính thức), nháp, đã hủy. */
export type DmsFilter = 'chinh-thuc' | 'cho-duyet' | 'thieu-scan' | 'du-scan' | 'nhap' | 'da-huy';

export const DMS_FILTER_LABEL: Record<DmsFilter, string> = {
  'chinh-thuc': 'Chính thức',
  'cho-duyet': 'Chờ duyệt sửa đổi',
  'thieu-scan': 'Thiếu scan',
  'du-scan': 'Đủ scan',
  nhap: 'Nháp',
  'da-huy': 'Đã hủy',
};

export function activeDmsFilter(raw: string | undefined): DmsFilter {
  return raw === 'cho-duyet' ||
    raw === 'thieu-scan' ||
    raw === 'du-scan' ||
    raw === 'nhap' ||
    raw === 'da-huy'
    ? raw
    : 'chinh-thuc';
}

/** Hồ sơ nào cần tải về từ API cho bộ lọc này (thiếu/đủ scan lọc trong nhóm chính thức). */
export const tabForFilter = (f: DmsFilter): DmsTab =>
  f === 'nhap' ? 'nhap' : f === 'da-huy' ? 'da-huy' : 'chinh-thuc';

/** Lọc theo chip và ô tìm (tên hồ sơ hoặc bất kỳ ô nào của dòng sổ; không phân biệt hoa thường). */
export function filterDmsCases(
  rows: readonly DmsCaseRow[],
  filter: DmsFilter,
  q: string,
  cellsOf: (caseId: string) => readonly string[] = () => [],
  pendingIds: ReadonlySet<string> = new Set(),
): DmsCaseRow[] {
  const needle = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (filter === 'cho-duyet' && !pendingIds.has(r.id)) return false;
    if (filter === 'thieu-scan' && !(r.document_count > 0 && r.scan_count === 0)) return false;
    if (filter === 'du-scan' && !(r.document_count > 0 && r.scan_count > 0)) return false;
    if (!needle) return true;
    return [r.title, ...cellsOf(r.id)].some((s) => s.toLowerCase().includes(needle));
  });
}

export const DMS_TAB_LABEL: Record<DmsTab, string> = {
  'chinh-thuc': 'Chính thức',
  nhap: 'Nháp',
  'da-huy': 'Đã hủy',
};

/** Tình trạng scan của một hồ sơ: chưa có tài liệu, thiếu scan, hay đủ. Chỉ là gợi ý hiển thị. */
export function scanState(row: Pick<DmsCaseRow, 'document_count' | 'scan_count'>) {
  if (row.document_count === 0) return 'no-documents' as const;
  return row.scan_count === 0 ? ('missing' as const) : ('ok' as const);
}

/** Có quyền tạo nháp ở miền này (own hoặc all) theo danh sách quyền hiệu lực của chính mình. */
export function canDraft(permissions: readonly string[], domainCode: string): boolean {
  return (
    permissions.includes(`${domainCode}.draft.own`) ||
    permissions.includes(`${domainCode}.draft.all`)
  );
}

async function getJson<T>(path: string, cookie: string | null): Promise<T | 'error'> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return (await res.json()) as T;
  } catch {
    return 'error';
  }
}

export async function loadDmsCases(
  cookie: string | null,
  officeId: string,
  domainCode: string,
  tab: DmsTab,
): Promise<DmsCaseRow[] | 'error'> {
  const q = new URLSearchParams({
    officeId,
    domain: domainCode,
    status: statusForTab(tab),
    limit: '100',
  });
  const body = await getJson<{ rows: DmsCaseRow[] }>(`/dms/cases?${q}`, cookie);
  return body === 'error' ? 'error' : body.rows;
}

export async function loadMyDmsPermissions(
  cookie: string | null,
  officeId: string,
): Promise<string[]> {
  const body = await getJson<{ permissions: string[] }>(
    `/dms/me/permissions?officeId=${encodeURIComponent(officeId)}`,
    cookie,
  );
  return body === 'error' ? [] : body.permissions;
}

export interface DmsCaseDetail extends DmsCaseRow {
  readonly office_id: string;
  readonly attributes: Record<string, unknown>;
  readonly cancelled_at: string | null;
  readonly cancel_reason: string | null;
  readonly thv_user_id: string | null;
  /** null = chưa ghi tên THV; true/false = THV đã xác nhận đúng nội dung hiện tại hay chưa. */
  readonly thv_confirmed: boolean | null;
}

export interface DmsDocumentRow {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly is_official: boolean;
  readonly status: 'DRAFT' | 'RECORDED' | 'CANCELLED';
  readonly file_count: number;
  readonly scan_count: number;
  readonly attributes: Record<string, unknown>;
}

export interface DmsFileRow {
  readonly id: string;
  readonly label: string;
  readonly is_scan: boolean;
  readonly version: number;
  readonly mime: string;
  readonly size_bytes: number | string;
  readonly created_at: string;
}

/** Quyền xác nhận lưu chính thức ở miền này (own hoặc all). Chỉ để ẩn/hiện nút; máy chủ vẫn kiểm. */
export function canConfirm(permissions: readonly string[], domainCode: string): boolean {
  return (
    permissions.includes(`${domainCode}.confirm.own`) ||
    permissions.includes(`${domainCode}.confirm.all`)
  );
}

export function canAddDocument(permissions: readonly string[], domainCode: string): boolean {
  return (
    permissions.includes(`${domainCode}.add_document.own`) ||
    permissions.includes(`${domainCode}.add_document.all`)
  );
}

export async function loadDmsCase(
  cookie: string | null,
  id: string,
): Promise<DmsCaseDetail | 'error' | 'not-found'> {
  try {
    const res = await fetch(`${API_URL}/dms/cases/${encodeURIComponent(id)}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (res.status === 404) return 'not-found';
    return res.ok ? ((await res.json()) as DmsCaseDetail) : 'error';
  } catch {
    return 'error';
  }
}

export async function loadDmsDocuments(
  cookie: string | null,
  caseId: string,
): Promise<DmsDocumentRow[] | 'error'> {
  const body = await getJson<{ rows: DmsDocumentRow[] }>(
    `/dms/cases/${encodeURIComponent(caseId)}/documents`,
    cookie,
  );
  return body === 'error' ? 'error' : body.rows;
}

export async function loadDmsFiles(
  cookie: string | null,
  documentId: string,
): Promise<DmsFileRow[]> {
  const body = await getJson<{ rows: DmsFileRow[] }>(
    `/dms/documents/${encodeURIComponent(documentId)}/files`,
    cookie,
  );
  return body === 'error' ? [] : body.rows;
}

export interface DmsBookColumn {
  readonly no: number;
  readonly heading: string;
  readonly key: string;
  readonly group?: string;
  readonly tick?: boolean;
}

export interface DmsBookSpec {
  readonly code: string;
  readonly domain: string;
  readonly form: string;
  readonly title: string;
  /** S-01: mỗi giấy tờ một dòng (thuộc tính nằm ở tài liệu); các sổ còn lại: mỗi hồ sơ một dòng. */
  readonly source: 'case' | 'document';
  readonly columns: readonly DmsBookColumn[];
}

export interface DmsBookRow {
  readonly stt: number;
  readonly case_id: string;
  readonly document_id: string | null;
  readonly case_title: string;
  readonly case_attributes: Record<string, unknown>;
  readonly doc_kind: string | null;
  readonly doc_attributes: Record<string, unknown> | null;
}

/** Sổ nghiệp vụ; `withVanThu` thêm ba sổ Văn thư (để dựng form nhập ở trang chi tiết). */
export async function loadDmsBooks(
  cookie: string | null,
  withVanThu = false,
): Promise<DmsBookSpec[] | 'error'> {
  const body = await getJson<{ books: DmsBookSpec[]; vanthu?: DmsBookSpec[] }>(
    '/dms/books',
    cookie,
  );
  if (body === 'error') return 'error';
  return withVanThu ? [...body.books, ...(body.vanthu ?? [])] : body.books;
}

export async function loadDmsBookRows(
  cookie: string | null,
  officeId: string,
  book: string,
  year: number,
): Promise<{ book: DmsBookSpec; rows: DmsBookRow[] } | 'error'> {
  const q = new URLSearchParams({ officeId, year: String(year), limit: '2000' });
  const body = await getJson<{ book: DmsBookSpec; rows: DmsBookRow[] }>(
    `/dms/books/${encodeURIComponent(book)}?${q}`,
    cookie,
  );
  return body === 'error' ? 'error' : body;
}

/** Các cột nhập tay của một sổ (bỏ STT). Dùng dựng form nhập thuộc tính ở bản nháp. */
export const inputColumns = (spec: Pick<DmsBookSpec, 'columns'>): DmsBookColumn[] =>
  spec.columns.filter((c) => c.key !== 'stt' && c.key !== 'title');

const strOf = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/** Ô của một dòng sổ, như API xuất CSV: ô thiếu để trống, cột đánh dấu hiện ✓. */
export function bookCell(spec: DmsBookSpec, col: DmsBookColumn, row: DmsBookRow): string {
  if (col.key === 'stt') return String(row.stt);
  if (col.key === 'title') return strOf(row.case_title);
  const attrs = spec.source === 'document' ? (row.doc_attributes ?? {}) : row.case_attributes;
  const v = strOf(attrs[col.key]) || (col.key === 'loai_van_ban' ? strOf(row.doc_kind) : '');
  return col.tick ? (v === '' ? '' : '✓') : v;
}

/** Nhóm cột liên tiếp cùng `group` thành một ô tiêu đề gộp. */
export function headerGroups(
  columns: readonly DmsBookColumn[],
): { label: string | null; span: number; cols: DmsBookColumn[] }[] {
  const out: { label: string | null; span: number; cols: DmsBookColumn[] }[] = [];
  for (const c of columns) {
    const last = out[out.length - 1];
    if (c.group && last && last.label === c.group) {
      last.span += 1;
      last.cols.push(c);
    } else out.push({ label: c.group ?? null, span: 1, cols: [c] });
  }
  return out;
}

export interface DmsThvOption {
  readonly userId: string;
  readonly label: string;
}

/** Danh sách thừa hành viên để chọn ghi tên (dùng chung với nghiệp vụ Vi bằng). */
export async function loadThvOptions(cookie: string | null): Promise<DmsThvOption[]> {
  const body = await getJson<{ items: DmsThvOption[] }>('/vibang/thv', cookie);
  return body === 'error' ? [] : body.items;
}

export interface DmsThvPendingRow {
  readonly case_id: string;
  readonly domain: string;
  readonly title: string;
  readonly created_at: string;
  /** Đã từng xác nhận nhưng nội dung đã đổi sau đó nên phải xác nhận lại. */
  readonly stale: boolean;
}

export async function loadThvPending(cookie: string | null): Promise<DmsThvPendingRow[] | 'error'> {
  const body = await getJson<{ rows: DmsThvPendingRow[] }>('/dms/thv/pending', cookie);
  return body === 'error' ? 'error' : body.rows;
}

export interface DmsThvReview {
  readonly case_id: string;
  readonly domain: string;
  readonly title: string;
  readonly attributes: Record<string, unknown>;
  readonly documents: readonly {
    readonly id: string;
    readonly kind: string;
    readonly title: string;
    readonly is_official: boolean;
    readonly attributes: Record<string, unknown>;
  }[];
  readonly confirmed: boolean;
}

export async function loadThvReview(
  cookie: string | null,
  id: string,
): Promise<DmsThvReview | 'error' | 'not-found'> {
  try {
    const res = await fetch(`${API_URL}/dms/thv/cases/${encodeURIComponent(id)}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (res.status === 404) return 'not-found';
    return res.ok ? ((await res.json()) as DmsThvReview) : 'error';
  } catch {
    return 'error';
  }
}

export interface DmsAmendmentRow {
  readonly id: string;
  readonly case_id: string;
  readonly document_id: string | null;
  readonly kind: 'CASE_FIELDS' | 'DOCUMENT_FIELDS' | 'FILE_VERSION';
  readonly n11: boolean;
  readonly proposed: { title?: string; attributes?: Record<string, unknown> };
  readonly reason: string;
  readonly status: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** ADMIN = Admin gửi nên có hiệu lực ngay; WINDOW chỉ còn ở yêu cầu cũ (đã bỏ tự duyệt theo giờ 2026-11-01). */
  readonly auto_via: 'ADMIN' | 'WINDOW' | null;
  readonly requested_by: string;
  readonly requested_at: string;
  readonly reviewed_at: string | null;
  readonly review_note: string | null;
}

export const AMENDMENT_STATUS_LABEL: Record<DmsAmendmentRow['status'], string> = {
  PENDING: 'Chờ Admin duyệt',
  APPROVED: 'Đã áp dụng',
  REJECTED: 'Bị từ chối',
};

export function amendmentSummary(a: Pick<DmsAmendmentRow, 'proposed' | 'kind'>): string {
  const parts: string[] = [];
  if (a.proposed.title) parts.push(`Tiêu đề → ${a.proposed.title}`);
  for (const [k, v] of Object.entries(a.proposed.attributes ?? {}))
    parts.push(`${k} → ${String(v)}`);
  return parts.join('; ') || 'Phiên bản tệp mới';
}

export async function loadDmsAmendments(
  cookie: string | null,
  officeId: string,
  opts: { caseId?: string; status?: DmsAmendmentRow['status'] } = {},
): Promise<DmsAmendmentRow[] | 'error'> {
  const q = new URLSearchParams({ officeId, limit: '200' });
  if (opts.caseId) q.set('caseId', opts.caseId);
  if (opts.status) q.set('status', opts.status);
  const body = await getJson<{ rows: DmsAmendmentRow[] }>(`/dms/amendments?${q}`, cookie);
  return body === 'error' ? 'error' : body.rows;
}

export interface DmsReportRow {
  readonly domain: string;
  readonly recorded_cases: number;
  readonly documents: number;
  readonly scans: number;
  readonly amendments: number;
  readonly last_stt: number | null;
}

export const DMS_DOMAIN_LABELS: Record<string, string> = {
  vibang: 'Vi bằng',
  tongdat: 'Tống đạt',
  xacminh: 'Xác minh điều kiện THA',
  tochuc: 'Tổ chức thi hành án',
  vtden: 'Văn thư · Văn bản đến',
  vtdi: 'Văn thư · Văn bản đi',
  vtnb: 'Văn thư · Văn bản nội bộ',
};

export async function loadDmsReport(
  cookie: string | null,
  officeId: string,
  year: number,
): Promise<DmsReportRow[] | 'error'> {
  const body = await getJson<{ rows: DmsReportRow[] }>(
    `/dms/report?officeId=${encodeURIComponent(officeId)}&year=${year}`,
    cookie,
  );
  return body === 'error' ? 'error' : body.rows;
}

export interface DmsSearchRow {
  readonly case_id: string;
  readonly case_title: string;
  readonly domain: string;
  readonly document_title: string;
  readonly file_id: string;
  readonly file_label: string;
  readonly snippet: string;
}

/** Tìm toàn văn trong chữ OCR của tệp scan; chỉ trả hồ sơ người xem được quyền thấy. */
export async function searchDmsOcr(
  cookie: string | null,
  officeId: string,
  q: string,
): Promise<DmsSearchRow[] | 'error'> {
  const params = new URLSearchParams({ officeId, q, limit: '30' });
  const body = await getJson<{ rows: DmsSearchRow[] }>(`/dms/search?${params}`, cookie);
  return body === 'error' ? 'error' : body.rows;
}
