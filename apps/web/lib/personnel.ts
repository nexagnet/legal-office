import type { PersonnelRow } from './personnel-view';
import { API_URL } from './server';

export * from './personnel-view';

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
