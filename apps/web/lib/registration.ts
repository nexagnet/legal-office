export interface Registration {
  readonly caseId: string;
  readonly numberLabel: string;
  readonly thvLabel: string | null;
  readonly madeAt: string | null;
  readonly regStatus: string;
  readonly deadlineAt: string | null;
  readonly incidentReason: string | null;
  readonly overdue: boolean;
}

export const REG_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Chưa cập nhật',
  PENDING: 'Đang cập nhật',
  SUBMITTED: 'Đã gửi Sở',
  CONFIRMED: 'Đã cập nhật',
  FAILED: 'Có sự cố',
};

export const REG_REASON_LABEL: Record<string, string> = {
  SO_REJECTED: 'Sở từ chối tiếp nhận',
  SYSTEM_UNAVAILABLE: 'Hệ thống không truy cập được',
  DEADLINE_MISSED: 'Quá hạn',
  OTHER: 'Lý do khác',
};

export const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
