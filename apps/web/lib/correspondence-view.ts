/** Chi tiết một công văn đến hoặc đi, đúng như `GET /office/correspondence/:id`. */
export interface CorrespondenceAttachment {
  readonly id: number | string;
  readonly role: string;
  readonly name: string;
  readonly addedBy: string | null;
  readonly at: string;
}

export interface CorrespondenceEvent {
  readonly event: string;
  readonly actor: string | null;
  readonly at: string;
}

export interface CorrespondenceDetail {
  readonly id: string;
  readonly officeId: string;
  readonly direction: 'INBOUND' | 'OUTBOUND';
  readonly status: string;
  readonly refNo: string | null;
  readonly docType: string;
  readonly counterparty: string;
  readonly subject: string;
  readonly branchId: string;
  readonly caseKind: string | null;
  readonly caseId: string | null;
  readonly receivedOn: string | null;
  readonly issuedOn: string | null;
  readonly dueAt: string | null;
  readonly handlerUserId: string | null;
  readonly resultNote: string | null;
  readonly archiveRef: string | null;
  readonly sendMethod: string | null;
  readonly overdue: boolean;
  readonly createdAt: string;
  readonly attachments: readonly CorrespondenceAttachment[];
  readonly events: readonly CorrespondenceEvent[];
}

export const CASE_KIND_LABEL: Record<string, string> = {
  VIBANG: 'Vi bằng',
  SERVICE: 'Tống đạt',
  VERIFICATION: 'Xác minh',
  ENFORCEMENT: 'Thi hành án',
};

/** Trang hồ sơ liên quan. Mã hồ sơ là id nội bộ nên hiển thị loại hồ sơ, không bịa số hồ sơ. */
export function linkedCaseHref(kind: string | null, id: string | null): string | null {
  if (!kind || !id) return null;
  if (kind === 'VIBANG') return `/vi-bang/${id}`;
  if (kind === 'SERVICE') return `/tong-dat/${id}`;
  if (kind === 'VERIFICATION') return `/xac-minh/${id}`;
  if (kind === 'ENFORCEMENT') return `/to-chuc-tha/${id}`;
  return null;
}

export const CORRESPONDENCE_EVENT_LABEL: Record<string, string> = {
  CREATED: 'Vào sổ',
  ASSIGNED: 'Giao người xử lý',
  HANDLED: 'Ghi kết quả xử lý',
  SUBMITTED: 'Trình duyệt',
  APPROVED: 'Duyệt nội bộ',
  ISSUED: 'Ban hành',
  ATTACHED: 'Đính kèm tệp',
  LINKED: 'Gắn hồ sơ liên quan',
  UNLINKED: 'Bỏ liên kết hồ sơ',
};

export const ATTACHMENT_ROLE_LABEL: Record<string, string> = {
  FINAL_DOCUMENT: 'Bản cuối',
  SEND_PROOF: 'Chứng từ gửi đi',
  INCOMING: 'Công văn nhận',
  RESULT: 'Văn bản trả lời',
};

export interface ProgressStep {
  readonly label: string;
  readonly state: 'done' | 'current' | 'todo';
}

/** Tiến trình: đến (tiếp nhận → giao xử lý → đang xử lý → đã xử lý) và đi (soạn → trình duyệt → duyệt → ban hành). */
export function progressSteps(
  c: Pick<CorrespondenceDetail, 'direction' | 'status' | 'handlerUserId'>,
): ProgressStep[] {
  const rank =
    c.direction === 'INBOUND'
      ? c.status === 'HANDLED'
        ? 3
        : c.handlerUserId
          ? 1
          : 0
      : (({ DRAFT: 0, SUBMITTED: 1, APPROVED: 2, ISSUED: 3 } as Record<string, number>)[c.status] ??
        0);
  const labels =
    c.direction === 'INBOUND'
      ? ['Tiếp nhận', 'Giao xử lý', 'Đang xử lý', 'Đã xử lý']
      : ['Soạn thảo', 'Trình duyệt', 'Đã duyệt', 'Ban hành'];
  const doneAll = rank >= 3;
  return labels.map((label, i) => ({
    label,
    state: doneAll || i < rank ? 'done' : i === rank ? 'current' : 'todo',
  }));
}
