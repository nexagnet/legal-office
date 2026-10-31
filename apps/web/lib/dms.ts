import { API_URL } from './server';

/** Bốn nghiệp vụ DMS. `slug` là đường dẫn web, `code` là mã miền ở API/DB. */
export const DMS_DOMAINS = [
  { slug: 'vi-bang', code: 'vibang', label: 'Vi bằng' },
  { slug: 'tong-dat', code: 'tongdat', label: 'Tống đạt' },
  { slug: 'xac-minh', code: 'xacminh', label: 'Xác minh điều kiện THA' },
  { slug: 'to-chuc-tha', code: 'tochuc', label: 'Tổ chức thi hành án' },
] as const;

export type DmsDomain = (typeof DMS_DOMAINS)[number];

export const domainBySlug = (slug: string): DmsDomain | undefined =>
  DMS_DOMAINS.find((d) => d.slug === slug);

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
