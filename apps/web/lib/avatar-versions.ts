/**
 * Phiên bản ảnh đại diện theo mã người, gom nhiều yêu cầu trong cùng một nhịp thành MỘT lần gọi `/api/people/avatars`.
 * Mọi chỗ hiện người dùng dùng chung component Avatar nên tự lấy ảnh qua đây; không phải truyền từng nơi.
 * `null` = không có ảnh (hoặc không xem được). Sau khi đổi/gỡ ảnh gọi `invalidateAvatar` để mọi nơi cập nhật ngay.
 */
const known = new Map<string, number | null>();
const waiting = new Set<string>();
const listeners = new Set<() => void>();
let scheduled = false;

const notify = () => listeners.forEach((l) => l());

export function subscribeAvatars(l: () => void): () => void {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export function avatarVersionSnapshot(id: string): number | null | undefined {
  return known.get(id);
}

async function flush() {
  scheduled = false;
  const ids = [...waiting].slice(0, 200);
  ids.forEach((i) => waiting.delete(i));
  if (ids.length === 0) return;
  try {
    const res = await fetch(`/api/people/avatars?ids=${ids.join(',')}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('avatars');
    const body = (await res.json()) as { items: { userId: string; version: number }[] };
    for (const id of ids) known.set(id, null);
    for (const it of body.items) known.set(it.userId, it.version);
  } catch {
    for (const id of ids) known.set(id, null);
  }
  notify();
  if (waiting.size > 0) schedule();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => void flush(), 30);
}

/** Xin phiên bản ảnh của một người (chưa biết thì xếp hàng chờ gọi theo lô). */
export function requestAvatar(id: string): void {
  if (known.has(id) || waiting.has(id)) return;
  waiting.add(id);
  schedule();
}

/** Quên phiên bản đã nhớ (sau khi chính mình đổi/gỡ ảnh) để mọi Avatar tải lại. */
export function invalidateAvatar(id: string): void {
  known.delete(id);
  notify();
}
