import type { PersonnelRow } from './personnel-view';
import { API_URL } from './server';

export * from './personnel-view';

/** Hồ sơ lao động của một tài khoản (bản mới nhất) hoặc null nếu chưa ghép; 'error' khi không đủ quyền hay lỗi. */
export async function loadPersonnelByUser(
  cookie: string | null,
  officeId: string,
  userId: string,
): Promise<PersonnelRow | null | 'error'> {
  try {
    const res = await fetch(
      `${API_URL}/office/personnel/by-user?officeId=${encodeURIComponent(officeId)}&userId=${encodeURIComponent(userId)}`,
      { headers: cookie ? { cookie } : {}, cache: 'no-store' },
    );
    if (!res.ok) return 'error';
    const text = await res.text();
    return text ? ((JSON.parse(text) as PersonnelRow | null) ?? null) : null;
  } catch {
    return 'error';
  }
}

export interface UnlinkedPerson {
  readonly person_id: string;
  readonly full_name: string;
  readonly work_status: 'ACTIVE' | 'LEFT';
  readonly specialty: string | null;
}

/** Hồ sơ lao động chưa gắn tài khoản, để ghép tay. */
export async function loadUnlinkedPersonnel(
  cookie: string | null,
  officeId: string,
): Promise<UnlinkedPerson[]> {
  try {
    const res = await fetch(
      `${API_URL}/office/personnel/unlinked?officeId=${encodeURIComponent(officeId)}`,
      { headers: cookie ? { cookie } : {}, cache: 'no-store' },
    );
    return res.ok ? ((await res.json()) as UnlinkedPerson[]) : [];
  } catch {
    return [];
  }
}

/** Sổ S-06 (bản mới nhất mỗi người). Chỉ Admin và Trưởng văn phòng; lỗi hoặc không đủ quyền thì trả 'error'. */
export async function loadPersonnel(
  cookie: string | null,
  officeId: string,
): Promise<PersonnelRow[] | 'error'> {
  try {
    const res = await fetch(
      `${API_URL}/office/personnel?officeId=${encodeURIComponent(officeId)}`,
      {
        headers: cookie ? { cookie } : {},
        cache: 'no-store',
      },
    );
    if (!res.ok) return 'error';
    return (await res.json()) as PersonnelRow[];
  } catch {
    return 'error';
  }
}
