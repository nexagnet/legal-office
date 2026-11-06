# Danh sách việc trước khi lên production

Lập 04/11/2026. Đi kèm [northflank-deploy.md](northflank-deploy.md) (thành phần, biến môi trường) và [ocr.md](ocr.md). Mỗi mục đánh dấu xong khi đã làm và đã kiểm.

## 1. Dữ liệu: môi trường thật là tenant MỚI

- [ ] Không chạy `tools/seed-demo` trên production (nó tạo hồ sơ giả, tài khoản thử). Không dùng lại DB của dev.
- [ ] Tạo văn phòng và Admin đầu tiên bằng `bootstrap-tenant.cli` (tạo tenant, văn phòng, chi nhánh, Admin, 7 nhóm quyền mẫu; không nạp dữ liệu mẫu):

  ```bash
  DATABASE_URL=<chuỗi tài khoản chủ DB> TENANT_NAME="<Tên văn phòng>" BRANCHES="<Chi nhánh 1>,<Chi nhánh 2>" \
  ADMIN_EMAIL=<email chủ văn phòng> ADMIN_NAME="<Họ tên>" ADMIN_CCCD=<12 số, tùy chọn> ADMIN_PASSWORD=<tối thiểu 12 ký tự> \
  node dist/auth/bootstrap-tenant.cli.js
  ```

  Lệnh in `TENANT_ID`. Đặt `TENANT_ID` và `TENANT_NAME` cho `lo-web`. Admin buộc đổi mật khẩu ở lần đăng nhập đầu.
- [ ] Đăng nhập Admin, vào **Quản trị > Tài khoản** tạo tài khoản nhân viên (mật khẩu ban đầu tối thiểu 12 ký tự, CCCD nếu có), xếp vào nhóm quyền, cấp chi nhánh.
- [ ] Nếu có dữ liệu cũ cần chuyển sang (kho tệp hàng trăm GB): làm theo [nhap-200gb-tai-lieu-cu.md](nhap-200gb-tai-lieu-cu.md); công cụ mô tả ở `docs/architecture/legacy-import.md`.

## 2. Biến môi trường (secret group `legal-office`)

| Biến | Dịch vụ | Ghi chú |
|---|---|---|
| `NODE_ENV=production`, `AUTH_MODE=password`, `TRUST_PROXY=1` | api | `AUTH_MODE=synthetic-test` bị từ chối khi production |
| `DATABASE_URL` (vai `legal_app`), `MIGRATE_DATABASE_URL` (chủ DB), `APP_DB_ROLE=legal_app` | api | migration tự áp khi khởi động |
| `WEB_ORIGIN`, `PUBLIC_WEB_URL` | api | đúng tên miền chính thức (link đặt lại mật khẩu dùng `PUBLIC_WEB_URL`) |
| `FILE_STORE=r2`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | api, lo-ocr | bucket riêng tư. KHÔNG dùng `FILE_STORE=local` cho khách thật |
| `MAIL_SETTINGS_KEY` | api | khóa 32 byte base64 (`openssl rand -base64 32`); thiếu thì Admin không lưu được cấu hình email |
| `API_URL`, `TENANT_ID`, `TENANT_NAME` | web | `TENANT_NAME` hiện ở thanh bên và tiêu đề |

## 3. Lịch chạy nền (mặc định TẮT, phải bật)

- [ ] `SCAN_PURGE_SCHEDULE=on` và `SCAN_PURGE_TENANT_IDS=<tenant id>` trên `lo-api`: không bật thì giao diện nói "xóa hẳn sau 30 ngày" nhưng scan đã xóa không bao giờ bị dọn.
- [ ] `REMINDERS_SCHEDULE=on` và `REMINDER_TENANT_IDS=<tenant id>` trên `lo-api` (nhắc hạn qua email, 7:30 giờ Việt Nam).
- [ ] Job `lo-ocr` (xem `ocr.md`): `OCR_ONCE=1`, `OCR_TENANT_IDS=<tenant id>`, lịch mỗi 5 đến 10 phút. Không có job này thì tìm toàn văn trong scan không hoạt động.

## 4. Email

- [ ] Vào **Quản trị > Cài đặt văn phòng > Email gửi thư**, nhập SMTP, gửi thử. Chưa có SMTP thì "Quên mật khẩu" không gửi được thư (Admin vẫn đặt lại mật khẩu cho người dùng).

## 5. An toàn dữ liệu

- [ ] Bật sao lưu tự động cho addon Postgres `lo-postgres` (lịch hằng ngày, giữ tối thiểu 7 ngày) và bật versioning cho bucket R2.
- [ ] Thử khôi phục một bản sao lưu vào DB tạm và đăng nhập được (ghi ngày thử vào đây).
- [ ] Kiểm RLS: vai `legal_app` không đọc được dòng khi chưa đặt `app.tenant_id`.
- [ ] Tên miền chính thức có TLS, `http` chuyển sang `https`; cookie phiên có `Secure`.

## 6. Kiểm sau khi deploy

- [ ] `GET /health` trả `{"status":"ok"}`.
- [ ] Đăng nhập bằng email, bằng CCCD, đổi mật khẩu lần đầu, đăng xuất.
- [ ] Tạo một hồ sơ nháp, tải scan, kiểm Lịch sử hồ sơ. Chỉ lưu chính thức khi đó là hồ sơ thật: hồ sơ đã ghi sổ không bao giờ xóa được.
- [ ] Tài khoản Thư ký không thấy mục Quản trị; THV chỉ thấy hồ sơ chi nhánh được cấp.
- [ ] Bộ hướng dẫn sử dụng gửi khách là bản dựng từ văn phòng minh họa (xem `docs/user-guide/PROGRESS.md`), không chứa dữ liệu thật.

## 7. Còn lại (không chặn lên production)

- Route và trang duyệt đề xuất kiểu cũ (`/quan-tri/phan-quyen/de-xuat`, `yeu-cau/[id]`, `POST /dms/permission-requests/:id/review`) chỉ còn để xử lý các dòng PENDING sinh ra trước ngày 04/11/2026. Trên tenant mới không có dòng nào, có thể gỡ ở một đợt dọn sau.
