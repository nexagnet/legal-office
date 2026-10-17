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
  readonly intakeNo?: string | null;
  readonly createdByLabel?: string | null;
  readonly customerPhone?: string | null;
  readonly customerIdNumber?: string | null;
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

export interface CaseLegal {
  readonly placeAddress: string | null;
  readonly contract: {
    readonly ref: string | null;
    readonly serviceKind: string | null;
    readonly signedOn: string | null;
    readonly validFrom: string | null;
    readonly validTo: string | null;
    readonly status: string | null;
  };
  readonly customer: {
    readonly kind: string | null;
    readonly name: string | null;
    readonly idNumber: string | null;
    readonly address: string | null;
    readonly phone: string | null;
    readonly taxCode: string | null;
    readonly representative: string | null;
  };
  readonly number: { readonly label: string | null; readonly allocatedAt: string | null };
  readonly misa: {
    readonly status: string | null;
    readonly reference: string | null;
    readonly confirmedAt: string | null;
  };
  readonly signed: { readonly at: string | null; readonly byLabel: string | null };
  readonly stamped: { readonly at: string | null; readonly byLabel: string | null };
  readonly registration: { readonly status: string | null; readonly deadlineAt: string | null };
  readonly finalScan: { readonly sha256: string | null; readonly lockedAt: string | null };
}

export interface HistoryEntry {
  readonly at: string;
  readonly kind: string;
  readonly actorUserId: string | null;
  readonly actorLabel: string | null;
  readonly detail: string | null;
}
