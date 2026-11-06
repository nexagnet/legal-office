import type { ThvCard } from '../components/ThvCardsForm';
import type { MailSettings } from '../components/MailSettingsForm';
import { API_URL } from './server';

export interface Member {
  readonly userId: string;
  readonly label: string;
  readonly role: string | null;
  readonly legalSigner: boolean;
  readonly hasLogin: boolean;
  readonly suspended?: boolean;
  readonly branches: readonly string[];
}

export interface AccessRow {
  readonly id: string;
  readonly targetUserId: string;
  readonly targetLabel: string;
  readonly kind: string;
  readonly role: string | null;
  readonly flag: boolean | null;
  readonly branchName: string | null;
  readonly status: string;
  readonly reason: string;
  readonly proposedBy: string;
  readonly decisionNote: string | null;
}

async function get<T>(path: string, cookie: string | null): Promise<T | 'error'> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    return res.ok ? ((await res.json()) as T) : 'error';
  } catch {
    return 'error';
  }
}

const q = (officeId: string) => `officeId=${encodeURIComponent(officeId)}`;

export const loadMembers = (cookie: string | null, officeId: string) =>
  get<Member[]>(`/office/members?${q(officeId)}`, cookie);
export const loadRequests = (cookie: string | null, officeId: string) =>
  get<AccessRow[]>(`/admin/access-requests?${q(officeId)}`, cookie);
export const loadMailSettings = (cookie: string | null, officeId: string) =>
  get<MailSettings>(`/office/mail-settings?${q(officeId)}`, cookie);
export async function loadThvCards(cookie: string | null, officeId: string): Promise<ThvCard[]> {
  const r = await get<ThvCard[]>(`/office/thv-cards?${q(officeId)}`, cookie);
  return r === 'error' ? [] : r;
}
