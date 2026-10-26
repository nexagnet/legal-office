# Đăng nhập email + mật khẩu

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

1. Bấm link mở `/xac-thuc`; bấm "Hiện mã xác thực" mới gọi `POST /auth/verify-link` (trình quét email không làm cháy link). Link dùng một lần, hết hạn 15 phút. Lúc này DB mới sinh mã 6 số, hiệu lực 10 phút, trả đúng một lần.
2. Nhập mã ở màn đăng nhập: `POST /auth/login/verify`. Cần **cả** cookie `lo_challenge` của trình duyệt đã xin link và mã đúng. Sai 5 lần thì thử thách bị huỷ; đúng thì mới tạo phiên `lo_session`.
3. Chỉ lưu SHA-256 của bí mật trình duyệt, token link và mã. Tối đa 3 thư mỗi người trong 15 phút; xin lại huỷ thử thách cũ. Mọi bước ghi `audit_log`. `/auth/login/email` chịu giới hạn tốc độ 20/phút như `/auth/login`.
4. Đường email mở cho mọi tài khoản có vai của tenant **đã lưu SMTP** và công tắc chưa tắt. Đường mật khẩu luôn dùng được, nên Admin đầu tiên vẫn vào được để nhập SMTP.
5. **Công tắc:** `DATABASE_URL=... TENANT_ID=... MODE=off node dist/auth/admin-verification.cli.js` tắt đăng nhập bằng email cho tenant (mật khẩu không đổi); `MODE=on` bật lại. Mỗi lần chạy ghi `audit_log`.
6. Cần địa chỉ web để dựng link: `PUBLIC_WEB_URL`, nếu trống lấy Origin đầu tiên trong `WEB_ORIGIN`; không có cả hai thì đường email không gửi được thư.
7. Email Admin mặc định `phungtienviet14@gmail.com` đặt khi bootstrap: `EMAIL=phungtienviet14@gmail.com ... node dist/auth/set-password.cli.js`.

## Chưa làm / giả định chờ xác nhận

1. Chưa có quên mật khẩu qua email hay hết hạn mật khẩu (đăng nhập bằng link email áp cho mọi vai).
2. Chưa giới hạn tốc độ theo IP (chỉ khoá theo tài khoản); nên đặt ở lớp proxy khi triển khai.
3. Chưa có phiên "ghi nhớ" dài hạn.
