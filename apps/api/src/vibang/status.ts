import { HttpStatus } from '@nestjs/common';
import type { Op } from './vibang.repo';

const FORBIDDEN = new Set([
  'ROLE_LACKS_PERMISSION',
  'BRANCH_NOT_GRANTED',
  'NOT_RESPONSIBLE_THV',
  'ADMIN_ONLY',
  'SIGNING_AUTHORITY_NOT_GRANTED',
  'ADMIN_OR_HEAD_ONLY',
  'NOT_ASSIGNED_HANDLER',
]);
const NOT_FOUND = new Set([
  'CASE_NOT_FOUND',
  'CORRECTION_NOT_FOUND',
  'REQUEST_NOT_FOUND',
  'DOCUMENT_NOT_FOUND',
  'BRANCH_NOT_FOUND',
]);
const INVALID = new Set([
  'INVALID_STATUS',
  'INVALID_DOCUMENT',
  'INVALID_NUMBER',
  'INVALID_REGISTRATION',
  'INVALID_CONTACT',
  'REASON_REQUIRED',
  'REFERENCE_REQUIRED',
  'INVALID_OUTCOME',
  'INVALID_EVIDENCE',
  'INVALID_REASON',
  'INVALID_HANDLER',
  'EVIDENCE_REQUIRED',
  'STATUTORY_PROOF_REQUIRED',
]);

/** 2xx khi thành công; 403 từ chối quyền; 404 không thấy (kể cả khác tenant); 422 dữ liệu sai; 409 sai trạng thái. */
export function statusFor(op: Op): number {
  if (op.ok) return HttpStatus.OK;
  if (FORBIDDEN.has(op.code)) return HttpStatus.FORBIDDEN;
  if (NOT_FOUND.has(op.code)) return HttpStatus.NOT_FOUND;
  if (INVALID.has(op.code)) return HttpStatus.UNPROCESSABLE_ENTITY;
  return HttpStatus.CONFLICT;
}
