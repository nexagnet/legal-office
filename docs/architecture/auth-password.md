# Đăng nhập email hoặc CCCD + mật khẩu

Quyết định của chủ dự án (12/10/2026). Bật bằng `AUTH_MODE=password`; mặc định API vẫn **đóng kín**.

- Mật khẩu: scrypt (N=32768), muối riêng, so sánh thời gian hằng; độ dài 12–200. Email xấu/không tồn tại tốn cùng thời gian băm.
- Phiên: token ngẫu nhiên 256 bit, DB chỉ lưu SHA-256; cookie `lo_session=<tenantId>.<token>`, `HttpOnly`, `SameSite=Strict`, `Secure` khi production; mặc định 12 giờ (`SESSION_TTL_MINUTES`).
- Khoá 15 phút sau 5 lần sai liên tiếp (429 + `Retry-After`); mọi lần đăng nhập/đăng xuất/đặt mật khẩu ghi `audit_log`.
- CSRF: ngoài `SameSite=Strict`, thao tác ghi có `Origin` lạ (không nằm trong `WEB_ORIGIN`) bị từ chối.
- Phiên chỉ xác định người dùng; vai và chi nhánh luôn do hàm nghiệp vụ trong DB kiểm lại. `GET /auth/me` trả vai để web chọn menu.
- Admin đặt/đổi mật khẩu: `PUT /auth/users/:id/password` (thu hồi mọi phiên cũ của người đó). Admin đầu tiên: `node dist/auth/set-password.cli.js` với biến môi trường tạm.
- Đăng nhập cần `tenantId` (web cấu hình theo văn phòng).

## Mọi tài khoản đăng nhập bằng mật khẩu HOẶC link email (migration 0049, chốt 18/10, đổi 23/10, mở cho mọi vai 26/10/2026 — migration 0053)

Người dùng (mọi vai) chọn **một trong hai** cách, không phải hai lớp liên tiếp:

- **Mật khẩu:** `POST /auth/login` như mọi người dùng, đúng là có phiên ngay (vẫn khoá tạm khi sai nhiều lần).
- **Email:** `POST /auth/login/email {tenantId, email}`. Nếu email là tài khoản có ít nhất một vai trong tenant đã lưu SMTP (và công tắc chưa tắt), hệ thống gửi thư có link `<web>/xac-thuc?t=<tenant>.<token>`. API **luôn** trả `200 {code:'VERIFICATION_REQUIRED'}` kèm cookie `lo_challenge` (HttpOnly, SameSite=Strict, 25 phút), kể cả email lạ/chưa có vai/chưa SMTP/đang khoá/gửi lỗi/quá số lần (cookie mồi vô dụng), để không dò được email nào có tài khoản. Lý do thật chỉ ghi log máy chủ.

Đăng nhập bằng link email không mật khẩu đã bị gỡ khỏi màn đăng nhập (màn `/xac-thuc` và nút đăng nhập bằng email đã xóa;
công tắc `LEGACY_EMAIL_LOGIN_ENABLED` mặc định tắt).

1. Tài khoản bắt buộc có mật khẩu khi tạo (tối thiểu 12 ký tự). Số CCCD (12 chữ số, duy nhất theo văn phòng) là tùy chọn;
   đăng nhập bằng email hoặc CCCD. CCCD không ghi vào nhật ký và không đưa lên URL.
2. Tài khoản mới và tài khoản vừa được Admin đặt lại mật khẩu có cờ `must_change_password`: phải đổi mật khẩu
   (`POST /auth/change-password`) trước khi dùng tiếp.
3. Quên mật khẩu: `POST /auth/forgot-password` gửi link một lần (cần SMTP của văn phòng; tối đa 3 lần mỗi 30 phút),
   `POST /auth/reset-password` đặt mật khẩu mới. Chưa có SMTP thì Admin đặt lại mật khẩu cho người dùng.
4. Chỉ lưu SHA-256 của token đặt lại. Mọi bước ghi `audit_log`.
5. Email Admin mặc định đặt khi bootstrap: `node dist/auth/set-password.cli.js` với biến môi trường tạm.

## Chưa làm / giả định chờ xác nhận

1. Chưa có hết hạn mật khẩu theo thời gian.
2. Chưa giới hạn tốc độ theo IP (chỉ khoá theo tài khoản); nên đặt ở lớp proxy khi triển khai.
3. Chưa có phiên "ghi nhớ" dài hạn.
