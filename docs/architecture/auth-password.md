# Đăng nhập email + mật khẩu

Quyết định của chủ dự án (12/10/2026). Bật bằng `AUTH_MODE=password`; mặc định API vẫn **đóng kín**.

- Mật khẩu: scrypt (N=32768), muối riêng, so sánh thời gian hằng; độ dài 12–200. Email xấu/không tồn tại tốn cùng thời gian băm.
- Phiên: token ngẫu nhiên 256 bit, DB chỉ lưu SHA-256; cookie `lo_session=<tenantId>.<token>`, `HttpOnly`, `SameSite=Strict`, `Secure` khi production; mặc định 12 giờ (`SESSION_TTL_MINUTES`).
- Khoá 15 phút sau 5 lần sai liên tiếp (429 + `Retry-After`); mọi lần đăng nhập/đăng xuất/đặt mật khẩu ghi `audit_log`.
- CSRF: ngoài `SameSite=Strict`, thao tác ghi có `Origin` lạ (không nằm trong `WEB_ORIGIN`) bị từ chối.
- Phiên chỉ xác định người dùng; vai và chi nhánh luôn do hàm nghiệp vụ trong DB kiểm lại. `GET /auth/me` trả vai để web chọn menu.
- Admin đặt/đổi mật khẩu: `PUT /auth/users/:id/password` (thu hồi mọi phiên cũ của người đó). Admin đầu tiên: `node dist/auth/set-password.cli.js` với biến môi trường tạm.
- Đăng nhập cần `tenantId` (web cấu hình theo văn phòng).

## Admin xác thực qua email (migration 0049, chốt 18/10/2026)

Admin (vai ADMIN ở bất kỳ văn phòng) sau khi đúng email + mật khẩu **chưa có phiên**: hệ thống tạo một thử thách và gửi email có link `<web>/xac-thuc?t=<tenant>.<token>` tới email đăng nhập của họ. API trả `{code:'VERIFICATION_REQUIRED'}` kèm cookie `lo_challenge` (HttpOnly, SameSite=Strict, 25 phút).

1. Bấm link mở trang `/xac-thuc`; bấm nút "Hiện mã xác thực" mới gọi `POST /auth/verify-link` (không tự gọi khi mở trang, để trình quét email không làm cháy link). Link dùng một lần, hết hạn 15 phút. Chỉ lúc này DB mới sinh mã 6 số, hiệu lực 10 phút, trả đúng một lần.
2. Nhập mã ở màn đăng nhập: `POST /auth/login/verify`. Cần **cả** cookie `lo_challenge` của trình duyệt đã nhập mật khẩu và mã đúng; có link/mã mà thiếu cookie thì vô dụng. Sai 5 lần thì thử thách bị huỷ; đúng thì mới tạo phiên `lo_session`.
3. Chỉ lưu SHA-256 của bí mật trình duyệt, token link và mã (mã băm cùng id thử thách). Tối đa 3 thử thách mỗi người trong 15 phút (`CHALLENGE_RATE_LIMITED`); đăng nhập lại huỷ thử thách cũ. Mọi bước ghi `audit_log`.
4. Chỉ bắt buộc khi tenant **đã lưu cấu hình SMTP** (để Admin đầu tiên còn vào được mà nhập SMTP) và công tắc tenant chưa tắt. Người không phải Admin không bị ảnh hưởng.
5. Gửi email lỗi (SMTP hỏng): trả `VERIFICATION_MAIL_FAILED`, không có phiên. **Lối thoát:** `DATABASE_URL=... TENANT_ID=... MODE=off node dist/auth/admin-verification.cli.js` (chạy bằng tài khoản chủ DB) tắt bước email cho tenant, mật khẩu vẫn được kiểm; `MODE=on` bật lại. Mỗi lần chạy ghi `audit_log`.
6. Cần địa chỉ web để dựng link: `PUBLIC_WEB_URL`, nếu trống lấy Origin đầu tiên trong `WEB_ORIGIN`; không có cả hai thì Admin đã bật bước này không đăng nhập được (`VERIFICATION_UNAVAILABLE`).
7. Email Admin mặc định `phungtienviet14@gmail.com` đặt khi bootstrap: `EMAIL=phungtienviet14@gmail.com ... node dist/auth/set-password.cli.js`.

## Chưa làm / giả định chờ xác nhận

1. Chưa có quên mật khẩu qua email hay hết hạn mật khẩu (OTP email chỉ áp cho Admin).
2. Chưa giới hạn tốc độ theo IP (chỉ khoá theo tài khoản); nên đặt ở lớp proxy khi triển khai.
3. Chưa có phiên "ghi nhớ" dài hạn.
