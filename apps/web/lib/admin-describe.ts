import type { AccessRow } from './admin-api';
import { ACCESS_KIND_LABEL, ROLE_LABEL } from './messages';

/** Một dòng mô tả đề xuất, dùng ở danh sách Phân quyền. */
export function describeRequest(r: AccessRow): string {
  const kind = ACCESS_KIND_LABEL[r.kind] ?? r.kind;
  if (r.kind === 'ADD_MEMBER') {
    const extra = [r.flag ? 'có quyền ký pháp lý' : null, r.branchName].filter(Boolean);
    return `${kind}: ${ROLE_LABEL[r.role ?? ''] ?? r.role}${extra.length ? ` (${extra.join(', ')})` : ''}`;
  }
  if (r.role) return `${kind}: ${ROLE_LABEL[r.role] ?? r.role}`;
  if (r.kind === 'SET_LEGAL_SIGNER') return `${kind}: ${r.flag ? 'cấp' : 'thu hồi'}`;
  return `${kind}: ${r.branchName ?? ''}`;
}
