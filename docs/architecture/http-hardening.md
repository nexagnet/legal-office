# Làm cứng HTTP (lát #9)

## API (`apps/api/src/http/hardening.ts`, gắn trong `main.ts`)
- Header cho API chỉ trả JSON: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, CSP `default-src 'none'`; bỏ `X-Powered-By`.
- Giới hạn tần suất theo địa chỉ: `/auth/login` 20 lần/phút, còn lại 600 lần/phút; vượt thì `429 {code:"RATE_LIMITED"}` kèm `Retry-After`. Khoá tài khoản sau 5 lần sai (15 phút) vẫn do DB quyết định, lớp này chỉ chặn dò hàng loạt.
- `TRUST_PROXY` (số tầng proxy hoặc giá trị Express như `loopback`) cần đặt khi chạy sau proxy, nếu không mọi người dùng chung một địa chỉ.

## Web (`apps/web/next.config.mjs`)
`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS; tắt `X-Powered-By`. Chưa đặt CSP cho trang vì Next dùng script nội tuyến; cần nonce theo từng yêu cầu, làm riêng.

## Giới hạn đã biết
- Bộ đếm tần suất nằm trong bộ nhớ một tiến trình. Chạy nhiều bản API cần kho dùng chung (Redis hoặc tương đương), chưa dựng.
- HSTS chỉ có ý nghĩa khi phục vụ qua HTTPS; chủ dự án xác nhận miền và chứng chỉ khi triển khai.
