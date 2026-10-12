# Đăng nhập email + mật khẩu

Quyết định của chủ dự án (12/10/2026). Bật bằng `AUTH_MODE=password`; mặc định API vẫn **đóng kín**.

- Mật khẩu: scrypt (N=32768), muối riêng, so sánh thời gian hằng; độ dài 12–200. Email xấu/không tồn tại tốn cùng thời gian băm.
- Phiên: token ngẫu nhiên 256 bit, DB chỉ lưu SHA-256; cookie `lo_session=<tenantId>.<token>`, `HttpOnly`, `SameSite=Strict`, `Secure` khi production; mặc định 12 giờ (`SESSION_TTL_MINUTES`).
- Khoá 15 phút sau 5 lần sai liên tiếp (429 + `Retry-After`); mọi lần đăng nhập/đăng xuất/đặt mật khẩu ghi `audit_log`.
- CSRF: ngoài `SameSite=Strict`, thao tác ghi có `Origin` lạ (không nằm trong `WEB_ORIGIN`) bị từ chối.
- Phiên chỉ xác định người dùng; vai và chi nhánh luôn do hàm nghiệp vụ trong DB kiểm lại. `GET /auth/me` trả vai để web chọn menu.
- Admin đặt/đổi mật khẩu: `PUT /auth/users/:id/password` (thu hồi mọi phiên cũ của người đó). Admin đầu tiên: `node dist/auth/set-password.cli.js` với biến môi trường tạm.
- Đăng nhập cần `tenantId` (web cấu hình theo văn phòng).

## Chưa làm / giả định chờ xác nhận

1. Chưa có quên mật khẩu qua email, OTP hai lớp, hay hết hạn mật khẩu.
2. Chưa giới hạn tốc độ theo IP (chỉ khoá theo tài khoản); nên đặt ở lớp proxy khi triển khai.
3. Chưa có phiên "ghi nhớ" dài hạn.
