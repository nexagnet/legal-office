export type StatusTone = 'ok' | 'warn' | 'danger' | 'idle';

const OK = new Set(['COMPLETED', 'DELIVERED', 'CONCLUDED']);
const DANGER = new Set(['UNDELIVERABLE', 'TERMINATED']);
const WARN = new Set(['ASSIGNED', 'IN_PROGRESS', 'OPEN', 'PARTIAL', 'CONCLUSION_PROPOSED']);

/** Sắc thái của trạng thái nghiệp vụ trên danh sách. Trạng thái lạ → trung tính. */
export function statusTone(status: string): StatusTone {
  if (OK.has(status)) return 'ok';
  if (DANGER.has(status)) return 'danger';
  if (WARN.has(status)) return 'warn';
  return 'idle';
}
