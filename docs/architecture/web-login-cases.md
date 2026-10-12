# Đăng nhập và danh sách/tạo hồ sơ Vi bằng trên web

- Web gọi API qua `/api/*` (Next `rewrites` tới `API_URL`), nên cookie phiên `SameSite=Strict` cùng origin. API cần `WEB_ORIGIN` = origin của web và `AUTH_MODE=password`.
- Cấu hình web (phía máy chủ): `API_URL`, `TENANT_ID` (mã văn phòng/tenant dùng khi đăng nhập), `TENANT_NAME` (tên hiển thị).
- Phiên lấy từ `GET /auth/me`; lỗi mạng hoặc phản hồi lạ = chưa đăng nhập. Menu chỉ là gợi ý theo vai, quyền thật do API/DB kiểm.
- Trang `/login`, `/vi-bang` (danh sách theo quyền + biểu mẫu tiếp nhận: tạo khách rồi tạo hồ sơ), nút Đăng xuất.
- Màu, font và bo góc theo bản duyệt Figma (file Figma hiện chỉ có trang bìa và hướng dẫn, chưa có khung màn hình).
- Chưa làm: phân công THV, sửa 48 giờ, chi tiết hồ sơ, các bước MISA/số/ký/dấu/scan/trả trên giao diện.

Chạy thử cục bộ: `AUTH_MODE=password WEB_ORIGIN=http://localhost:3000 node apps/api/dist/main.js` và `API_URL=http://localhost:3001 TENANT_ID=<uuid> pnpm --filter @legal-office/web dev`; Admin đầu tiên tạo bằng `set-password.cli` (xem auth-password.md).
