/** Mã kết quả của API → câu tiếng Việt cho người dùng. Mã lạ giữ nguyên để dễ báo lỗi. */
const MESSAGES: Record<string, string> = {
  ROLE_LACKS_PERMISSION: 'Vai trò của bạn không được thực hiện thao tác này.',
  BRANCH_NOT_GRANTED: 'Bạn chưa được cấp quyền ở chi nhánh này.',
  NOT_ASSIGNED_HANDLER: 'Bạn không phải người phụ trách hồ sơ này.',
  ADMIN_ONLY: 'Chỉ Admin được thực hiện thao tác này.',
  REFERENCE_REQUIRED: 'Cần nhập mã tham chiếu.',
  TITLE_REQUIRED: 'Cần nhập tiêu đề hồ sơ.',
  CUSTOMER_NOT_FOUND: 'Không tìm thấy khách hàng.',
  CONTRACT_NOT_FOUND: 'Không tìm thấy hợp đồng của khách này.',
  BRANCH_NOT_FOUND: 'Không tìm thấy chi nhánh.',
  INVALID_CUSTOMER: 'Loại khách hàng không hợp lệ.',
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  EDIT_WINDOW_CLOSED: 'Đã quá 48 giờ, hãy lập đề nghị thay đổi.',
  EDIT_WINDOW_OPEN: 'Còn trong 48 giờ, có thể sửa trực tiếp.',
  CASE_FINAL: 'Hồ sơ đã kết thúc, không thể thay đổi.',
  NOTHING_TO_CHANGE: 'Không có gì để thay đổi.',
  REASON_REQUIRED: 'Cần nhập lý do.',
  INVALID_VALUE: 'Giá trị mới không hợp lệ.',
  REQUEST_NOT_PENDING: 'Đề nghị này đã được xử lý.',
  CANCEL_NOT_ALLOWED: 'Hồ sơ đã qua bước pháp lý, không huỷ được ở đây.',
  CASE_NOT_FOUND: 'Không tìm thấy hồ sơ.',
  INVALID_HANDLER: 'Người này không phải THV hợp lệ.',
  ALREADY_ASSIGNED: 'Hồ sơ đã giao cho THV này.',
  CASE_NOT_ASSIGNABLE: 'Hồ sơ này không còn giao được.',
  MISA_NOT_CONFIRMED: 'Kế toán chưa xác nhận thu đủ trên MISA.',
  NUMBER_NOT_ALLOCATED: 'Hồ sơ chưa được cấp số.',
  INVALID_CASE_STATUS: 'Trạng thái hồ sơ chưa phù hợp cho bước này.',
  SIGNATURE_NOT_CONFIRMED: 'Chưa xác nhận đã ký.',
  STAMP_NOT_CONFIRMED: 'Chưa xác nhận đã đóng dấu.',
  FINAL_SCAN_MISSING: 'Chưa có bản scan cuối của Vi bằng.',
  REVOKE_PENDING: 'Đang có đề nghị thu hồi xác nhận MISA chờ xử lý.',
  DOCUMENT_NOT_FOUND: 'Không tìm thấy văn bản.',
  REQUEST_NOT_FOUND: 'Không tìm thấy yêu cầu hoặc đề xuất.',
  DEADLINE_REQUIRED: 'Cần nhập hạn tống đạt.',
  CASE_NOT_OPEN: 'Hồ sơ xác minh không còn ở trạng thái đang mở.',
  HANDLER_REQUIRED: 'Hồ sơ cần được giao THV phụ trách trước.',
  INVALID_PARTY: 'Cần nhập tên bên liên quan.',
  CONCLUSION_REQUIRED: 'Cần nhập nội dung kết luận.',
  ROUNDS_INCOMPLETE: 'Còn vòng xác minh chưa hoàn thành.',
  ADMIN_OR_HEAD_ONLY: 'Chỉ Admin hoặc Trưởng văn phòng được thực hiện thao tác này.',
  INVALID_DECISION: 'Cần nhập số, loại, trích yếu và ngày ký của quyết định.',
  AGENCY_ONLY_FORM: 'Loại văn bản này chỉ dành cho cơ quan, không vào sổ tại Văn phòng.',
  DUPLICATE_DECISION_NO: 'Số quyết định này đã có trong sổ.',
  CASE_LINK_NOT_FOUND: 'Không tìm thấy hồ sơ được liên kết.',
  INVALID_ITEM: 'Cần nhập tên và đơn vị tính của vật tư.',
  DUPLICATE_ITEM: 'Vật tư này đã có trong danh mục.',
  ITEM_NOT_FOUND: 'Không tìm thấy vật tư.',
  INVALID_QUANTITY: 'Số lượng hoặc nội dung ghi kèm chưa hợp lệ.',
  INSUFFICIENT_STOCK: 'Tồn kho không đủ để xuất.',
  BATCH_NOT_FOUND: 'Không tìm thấy lô.',
  NO_CHANGE: 'Số còn lại không thay đổi.',
  INVALID_FORM: 'Mã biểu mẫu hoặc tiêu đề chưa hợp lệ.',
  FORM_NOT_FOUND: 'Chưa có bản nào của biểu mẫu này.',
  FILE_NOT_FOUND: 'Không tìm thấy tệp của biểu mẫu.',
  ALREADY_REJECTED: 'Đề xuất này đã bị từ chối, cần tạo đề xuất mới.',
  ALREADY_RETURNED: 'Đề xuất này đã được trả lại để bổ sung.',
  NOT_RETURNED: 'Đề xuất này không ở trạng thái trả lại nên chưa nộp lại được.',
  SUBJECT_FINAL: 'Đề xuất này đã hoàn tất, không quyết định thêm được.',
  PROPOSER_ONLY: 'Chỉ người đề xuất hoặc Trưởng văn phòng nộp lại được.',
  SUBJECT_NOT_FOUND: 'Không tìm thấy đề xuất.',
  APPROVAL_RETURNED: 'Đề xuất đang bị trả lại, cần nộp lại trước.',
  APPROVAL_REJECTED: 'Đề xuất đã bị từ chối.',
  HEAD_ONLY: 'Chỉ Trưởng văn phòng được duyệt đề xuất quyền.',
  SEPARATE_APPROVER_REQUIRED: 'Người duyệt phải khác người đề xuất.',
  REQUEST_FINAL: 'Đề xuất này đã được xử lý, không thay đổi thêm được.',
  ROLE_ALREADY_GRANTED: 'Người này đã có vai trò đó.',
  ROLE_NOT_HELD: 'Người này không có vai trò đó.',
  LAST_ADMIN: 'Không thể gỡ Admin cuối cùng của văn phòng.',
  DUPLICATE_PENDING: 'Đã có đề xuất giống hệt đang chờ duyệt.',
  SIGNER_ROLE_INVALID: 'Quyền ký pháp lý chỉ dành cho Admin hoặc Trưởng văn phòng.',
  BRANCH_ROLE_INVALID: 'Chi nhánh chỉ cấp cho vai Văn thư hoặc Kế toán.',
  USER_NOT_FOUND: 'Không tìm thấy người dùng.',
  INVALID_REQUEST: 'Nội dung đề xuất chưa hợp lệ.',
  SIGNING_AUTHORITY_NOT_GRANTED: 'Bạn chưa được cấp quyền ký pháp lý.',
  NO_PROPOSAL: 'Chưa có đề xuất kết luận.',
  SEPARATE_REVIEWER_REQUIRED: 'Người quyết định phải khác người đề xuất.',
  INVALID_OBLIGATION: 'Nghĩa vụ không hợp lệ.',
  OBLIGATION_NOT_FOUND: 'Không tìm thấy nghĩa vụ.',
  OBLIGATION_FINAL: 'Nghĩa vụ đã hoàn tất, không ghi thêm được.',
  ALREADY_RECORDED: 'Nội dung này đã được ghi nhận trước đó.',
  INVALID_DOCUMENT: 'Tệp không hợp lệ hoặc sai định dạng cho phép.',
  FILE_TOO_LARGE: 'Tệp quá lớn (tối đa 25 MB).',
  FILE_STORE_NOT_CONFIGURED: 'Hệ thống chưa cấu hình kho lưu tệp. Liên hệ quản trị.',
  SOURCE_REQUIRED: 'Vòng này chưa có nguồn kèm tệp, chưa hoàn thành được.',
  RESULT_REQUIRED: 'Cần nhập kết quả của vòng.',
  ROUND_NOT_OPEN: 'Vòng xác minh này không còn đang thực hiện.',
  INVALID_SOURCE: 'Thông tin nguồn chưa hợp lệ.',
  OBLIGATIONS_NOT_COMPLETE: 'Còn nghĩa vụ chưa hoàn tất, chưa hoàn tất hồ sơ được.',
  EVIDENCE_REQUIRED: 'Cần đính kèm tệp bằng chứng.',
  INVALID_EVIDENCE: 'Tệp bằng chứng không hợp lệ.',
  INVALID_CORRESPONDENCE:
    'Thông tin công văn chưa đủ hoặc không hợp lệ (công văn đến cần ngày nhận).',
  CORRESPONDENCE_NOT_FOUND: 'Không tìm thấy công văn.',
  CORRESPONDENCE_FINAL: 'Công văn đã kết thúc, không thay đổi được.',
  INVALID_STATUS: 'Trạng thái công văn chưa phù hợp cho bước này.',
  FINAL_DOCUMENT_REQUIRED: 'Cần đính kèm bản cuối của công văn trước khi trình duyệt.',
  SEND_PROOF_REQUIRED: 'Cần chứng từ gửi đi trước khi ban hành.',
  NOT_RESPONSIBLE_THV: 'Chỉ THV phụ trách hồ sơ này được thực hiện thao tác này.',
  REJECT_NOT_ALLOWED: 'Hồ sơ đã ký hoặc đã kết thúc nên không từ chối được.',
  INVALID_CLAUSE: 'Khoản của Điều 28 không hợp lệ.',
  BASIS_REQUIRED: 'Cần nhập căn cứ.',
  CASE_NOT_RETURNED: 'Chỉ cấp bản sao khi hồ sơ đã trả kết quả cho khách.',
  INVALID_KIND: 'Loại yêu cầu cấp bản sao không hợp lệ.',
  FIELDS_REQUIRED: 'Cần nhập đủ người yêu cầu, căn cứ và người nhận.',
  INVALID_COPIES: 'Số bản sao phải từ 1 đến 50.',
  FIELD_NOT_FOR_KIND: 'Trường này không áp dụng cho loại khách hàng đã chọn.',
  ACCOUNT_LOCKED: 'Tài khoản tạm khoá 15 phút do đăng nhập sai nhiều lần.',
};

export function messageFor(code: string | undefined): string {
  if (!code) return 'Không thực hiện được. Vui lòng thử lại.';
  return MESSAGES[code] ?? `Không thực hiện được (${code}).`;
}

export const CASE_STATUS_LABEL: Record<string, string> = {
  INTAKE: 'Tiếp nhận',
  ASSIGNED: 'Đã phân công THV',
  SIGNED: 'Đã ký',
  STAMPED: 'Đã đóng dấu',
  RETURNED: 'Đã trả khách',
  CANCELLED: 'Đã huỷ',
};

export const SERVICE_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chưa giao người xử lý',
  ASSIGNED: 'Đang xử lý',
  DELIVERED: 'Đã tống đạt',
  UNDELIVERABLE: 'Không tống đạt được',
};
export const ATTEMPT_OUTCOME_LABEL: Record<string, string> = {
  REFUSED: 'Người nhận từ chối',
  ABSENT: 'Vắng mặt',
  NO_RECIPIENT: 'Không có người nhận',
  WRONG_ADDRESS: 'Sai địa chỉ',
  OTHER_FAILURE: 'Lý do khác',
};
export const UNDELIVERABLE_LABEL: Record<string, string> = {
  NO_RECIPIENT: 'Không có người nhận',
  ADDRESS_NOT_FOUND: 'Không tìm thấy địa chỉ',
  RECIPIENT_REFUSED: 'Người nhận từ chối',
};

export const VERIFICATION_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Đang xác minh',
  CONCLUSION_PROPOSED: 'Chờ quyết định kết luận',
  CONCLUDED: 'Đã kết luận',
};
export const SOURCE_CONFIDENTIALITY_LABEL: Record<string, string> = {
  PUBLIC: 'Công khai',
  CONFIDENTIAL: 'Mật',
  PII: 'Có dữ liệu cá nhân',
};
export const RESULT_KIND_LABEL: Record<string, string> = {
  PARTIAL_RESULT: 'Kết quả một phần',
  COMPLETION: 'Hoàn tất nghĩa vụ',
};
export const ROUND_STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: 'Đang thực hiện',
  COMPLETED: 'Đã hoàn thành',
};

export const ENFORCEMENT_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Đang thực hiện',
  COMPLETED: 'Đã hoàn tất',
};
export const OBLIGATION_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Chưa thực hiện',
  PARTIAL: 'Thực hiện một phần',
  COMPLETED: 'Đã hoàn tất',
};
export const PARTY_ROLE_LABEL: Record<string, string> = {
  CREDITOR: 'Người được thi hành',
  DEBTOR: 'Người phải thi hành',
  RELATED_PARTY: 'Người có quyền lợi, nghĩa vụ liên quan',
  REPRESENTATIVE: 'Người đại diện',
};
export const PARTY_KIND_LABEL: Record<string, string> = {
  PERSON: 'Cá nhân',
  ORGANIZATION: 'Tổ chức',
};

export const CORRESPONDENCE_STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'Đã nhận',
  HANDLED: 'Đã xử lý',
  DRAFT: 'Bản nháp',
  SUBMITTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  ISSUED: 'Đã ban hành',
};
export const CORRESPONDENCE_DIRECTION_LABEL: Record<string, string> = {
  INBOUND: 'Công văn đến',
  OUTBOUND: 'Công văn đi',
};

export const APPROVAL_KIND_LABEL: Record<string, string> = {
  TRANSFER: 'Chuyển giao hồ sơ',
  DELEGATION: 'Uỷ quyền xác minh',
};

export const APPROVAL_STATE_LABEL: Record<string, string> = {
  OPEN: 'Chờ duyệt',
  RETURNED: 'Đã trả lại, chờ bổ sung',
  REJECTED: 'Đã từ chối',
};

export const REPORT_DOMAIN_LABEL: Record<string, string> = {
  VIBANG: 'Vi bằng',
  TONG_DAT: 'Tống đạt',
  XAC_MINH: 'Xác minh',
  THI_HANH_AN: 'Tổ chức thi hành án',
};
export const REPORT_UNIT_LABEL: Record<string, string> = {
  CASE: 'Hồ sơ',
  NUMBER: 'Số Vi bằng đã cấp',
  REQUEST: 'Yêu cầu tống đạt',
  DOCUMENT: 'Văn bản tống đạt',
  ROUND: 'Đợt xác minh',
  OBLIGATION: 'Nghĩa vụ thi hành án',
};
const REQUEST_STATUS_LABEL: Record<string, string> = { OPEN: 'Đang mở', CLOSED: 'Đã đóng' };

/** Nhãn trạng thái theo đúng miền và đơn vị đếm; mã lạ giữ nguyên. */
export function reportStatusLabel(domain: string, unit: string, status: string): string {
  const map =
    domain === 'VIBANG' && unit === 'CASE'
      ? CASE_STATUS_LABEL
      : domain === 'VIBANG'
        ? { ALLOCATED: 'Đã cấp' }
        : domain === 'TONG_DAT' && unit === 'REQUEST'
          ? REQUEST_STATUS_LABEL
          : domain === 'TONG_DAT'
            ? SERVICE_STATUS_LABEL
            : domain === 'XAC_MINH' && unit === 'ROUND'
              ? ROUND_STATUS_LABEL
              : domain === 'XAC_MINH'
                ? VERIFICATION_STATUS_LABEL
                : unit === 'OBLIGATION'
                  ? OBLIGATION_STATUS_LABEL
                  : ENFORCEMENT_STATUS_LABEL;
  return map[status] ?? status;
}

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  TRUONG_VP: 'Trưởng văn phòng',
  THU_KY: 'Thư ký',
  THV: 'Thừa phát lại',
  VAN_THU: 'Văn thư',
  KE_TOAN: 'Kế toán',
};

export const ACCESS_KIND_LABEL: Record<string, string> = {
  GRANT_ROLE: 'Cấp vai trò',
  REVOKE_ROLE: 'Gỡ vai trò',
  SET_LEGAL_SIGNER: 'Quyền ký pháp lý',
  GRANT_BRANCH: 'Cấp chi nhánh',
  REVOKE_BRANCH: 'Thu hồi chi nhánh',
};
export const ACCESS_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
  WITHDRAWN: 'Đã rút',
};
