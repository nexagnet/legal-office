import { API_URL } from './server';

/**
 * Họ tên hiển thị theo mã người, cho mọi vai trong phạm vi cùng văn phòng (không phải danh bạ: chỉ tra được mã đã biết).
 * Lỗi hoặc không có quyền thì trả bảng rỗng; nơi gọi tự rơi về "Đã phân công".
 */
export async function loadPeopleNames(
  cookie: string | null,
  ids: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))].slice(0, 200);
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  try {
    const res = await fetch(`${API_URL}/people/names?ids=${unique.join(',')}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return names;
    const body = (await res.json()) as { items: { userId: string; displayName: string }[] };
    for (const p of body.items) names.set(p.userId, p.displayName);
  } catch {
    // bỏ qua: màn hình vẫn dùng được, chỉ thiếu tên
  }
  return names;
}
