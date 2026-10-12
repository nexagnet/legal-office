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
