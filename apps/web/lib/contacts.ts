export interface ContactEntry {
  readonly id: string;
  readonly kind: string;
  readonly outcome: string;
  readonly actorUserId: string;
  readonly at: string;
}

export const CONTACT_KIND_LABEL: Record<string, string> = {
  REMINDER: 'Nhắc khách đến nhận',
  RESULT: 'Báo kết quả',
};

export const CONTACT_OUTCOME_LABEL: Record<string, string> = {
  REMINDED: 'Đã nhắc',
  REACHED: 'Đã liên hệ được khách',
  NO_ANSWER: 'Không liên lạc được',
};
