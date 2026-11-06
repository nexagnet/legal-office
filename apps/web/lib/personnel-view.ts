/** Một dòng sổ S-06 (bản mới nhất của một người). Bảo hiểm chỉ ghi tình trạng và ghi chú, không có số tiền. */
export interface PersonnelRow {
  readonly person_id: string;
  readonly version: number;
  readonly branch_id: string;
  readonly full_name: string;
  readonly gender: 'M' | 'F';
  readonly specialty: string | null;
  readonly bailiff_decision_ref: string | null;
  readonly executor_decision_ref: string | null;
  readonly is_office_head: boolean;
  readonly is_partner: boolean;
  readonly labor_contract_ref: string | null;
  readonly insurance_purchased: boolean | null;
  readonly insurance_note: string | null;
  readonly contributing: boolean | null;
  readonly contribution_note: string | null;
  readonly note: string | null;
  readonly work_status: 'ACTIVE' | 'LEFT';
}

export interface PersonnelVersion extends PersonnelRow {
  readonly saved_by: string;
  readonly saved_at: string;
}

export type PersonnelTab = 'tat-ca' | 'dang-lam' | 'da-nghi' | 'thieu-ho-so';

export const PERSONNEL_TABS: readonly { key: PersonnelTab; label: string }[] = [
  { key: 'tat-ca', label: 'Tất cả' },
  { key: 'dang-lam', label: 'Đang làm việc' },
  { key: 'da-nghi', label: 'Đã nghỉ' },
  { key: 'thieu-ho-so', label: 'Thiếu hồ sơ' },
];

export function parsePersonnelTab(v: string | undefined): PersonnelTab {
  return PERSONNEL_TABS.some((t) => t.key === v) ? (v as PersonnelTab) : 'tat-ca';
}

/** Thiếu hồ sơ: người đang làm việc mà chưa có hợp đồng lao động hoặc chưa ghi tình trạng bảo hiểm. */
export function isIncomplete(r: PersonnelRow): boolean {
  return (
    r.work_status === 'ACTIVE' && (!r.labor_contract_ref?.trim() || r.insurance_purchased === null)
  );
}

export function filterPersonnel(rows: readonly PersonnelRow[], tab: PersonnelTab): PersonnelRow[] {
  switch (tab) {
    case 'dang-lam':
      return rows.filter((r) => r.work_status === 'ACTIVE');
    case 'da-nghi':
      return rows.filter((r) => r.work_status === 'LEFT');
    case 'thieu-ho-so':
      return rows.filter(isIncomplete);
    default:
      return [...rows];
  }
}

export interface PersonnelSummary {
  readonly total: number;
  readonly active: number;
  readonly left: number;
  readonly executors: number;
  readonly missingContract: number;
  readonly insuranceUnset: number;
}

export function summarizePersonnel(rows: readonly PersonnelRow[]): PersonnelSummary {
  const active = rows.filter((r) => r.work_status === 'ACTIVE');
  return {
    total: rows.length,
    active: active.length,
    left: rows.length - active.length,
    executors: active.filter((r) => r.executor_decision_ref?.trim()).length,
    missingContract: active.filter((r) => !r.labor_contract_ref?.trim()).length,
    insuranceUnset: active.filter((r) => r.insurance_purchased === null).length,
  };
}

export function personnelRoles(r: PersonnelRow): string {
  const roles = [
    r.is_office_head ? 'Trưởng văn phòng' : null,
    r.is_partner ? 'Thành viên góp vốn' : null,
    r.executor_decision_ref?.trim() ? 'Thừa hành viên' : null,
    r.bailiff_decision_ref?.trim() ? 'Thừa phát lại' : null,
  ].filter((x): x is string => x !== null);
  return roles.length > 0 ? roles.join(', ') : '—';
}

export function insuranceLabel(v: boolean | null): string {
  return v === null ? 'Chưa ghi' : v ? 'Đã mua' : 'Chưa mua';
}
