import { API_URL } from './server';

export interface CaseItem {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly createdAt: string;
  readonly responsibleThvUserId: string | null;
  readonly branchName?: string | null;
  /** Null với vai Kế toán (dữ liệu cá nhân). */
  readonly customerName?: string | null;
  readonly thvLabel?: string | null;
  readonly numberLabel?: string | null;
  readonly intakeNo?: string | null;
  readonly createdByLabel?: string | null;
  readonly nextStep?: string | null;
}

/** Hồ sơ Vi bằng trong phạm vi quyền của người xem. `'error'` khi API không trả lời được. */
export async function loadCases(cookie: string | null): Promise<CaseItem[] | 'error'> {
  try {
    const res = await fetch(`${API_URL}/vibang/cases?limit=100`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return 'error';
    return ((await res.json()) as { items: CaseItem[] }).items;
  } catch {
    return 'error';
  }
}

const FINISHED = new Set(['RETURNED', 'CANCELLED']);

export interface CaseSummary {
  readonly open: number;
  readonly unassigned: number;
  readonly awaitingReturn: number;
  readonly returned: number;
}

/** Số liệu tổng quan chỉ tính từ các trạng thái hồ sơ API thật sự có. */
export function summarizeCases(cases: readonly CaseItem[]): CaseSummary {
  return {
    open: cases.filter((c) => !FINISHED.has(c.status)).length,
    unassigned: cases.filter((c) => c.status === 'INTAKE' && !c.responsibleThvUserId).length,
    awaitingReturn: cases.filter((c) => c.status === 'SIGNED' || c.status === 'STAMPED').length,
    returned: cases.filter((c) => c.status === 'RETURNED').length,
  };
}

export const isOpenCase = (c: CaseItem) => !FINISHED.has(c.status);
