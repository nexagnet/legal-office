import { cookies } from 'next/headers';
import { loadSession, type Session } from '../app/session';

/** Cookie của yêu cầu hiện tại, để chuyển tiếp sang API. */
export async function requestCookie(): Promise<string | null> {
  const all = (await cookies()).getAll();
  return all.length === 0 ? null : all.map((c) => `${c.name}=${c.value}`).join('; ');
}

export async function currentSession(): Promise<Session> {
  return loadSession(await requestCookie());
}

export const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export interface HandlerOption {
  readonly userId: string;
  readonly label: string;
}

/** Danh sách THV để giao việc. API chỉ trả cho Admin; người khác (hoặc lỗi) nhận danh sách rỗng. */
export async function loadHandlerOptions(cookie: string | null): Promise<HandlerOption[]> {
  try {
    const res = await fetch(`${API_URL}/vibang/thv`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return ((await res.json()) as { items: HandlerOption[] }).items;
  } catch {
    return [];
  }
}

/** Người có quyền ký pháp lý của văn phòng, để chọn khi vào sổ quyết định. Lỗi hoặc không có quyền thì rỗng. */
export async function loadSignerOptions(
  cookie: string | null,
  officeId: string,
): Promise<HandlerOption[]> {
  try {
    const res = await fetch(`${API_URL}/office/signers?officeId=${encodeURIComponent(officeId)}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return ((await res.json()) as { items: HandlerOption[] }).items;
  } catch {
    return [];
  }
}
