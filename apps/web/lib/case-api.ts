import { API_URL } from './server';

export interface CaseDetail {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly responsibleThvUserId: string | null;
  readonly branchName?: string | null;
  readonly customerName?: string | null;
  readonly thvLabel?: string | null;
  readonly handoverRecipient?: string | null;
  readonly handoverOn?: string | null;
}

export async function getJson<T>(path: string, cookie: string | null): Promise<T | 404 | 'error'> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (res.status === 404) return 404;
    if (!res.ok) return 'error';
    return (await res.json()) as T;
  } catch {
    return 'error';
  }
}
