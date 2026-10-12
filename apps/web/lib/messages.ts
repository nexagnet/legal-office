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
