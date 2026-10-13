# Kho tệp và tải bản scan cuối

Chủ chọn **Cloudflare R2** làm kho tệp (quyết định 2026-10-13). Nghiệp vụ không biết tệp nằm ở đâu: chỉ dùng cổng `FileStore`
(`apps/api/src/storage/file-store.ts`) với `put`, `get`, `delete` theo khoá đối tượng.

## Cấu hình (biến môi trường, bí mật không bao giờ vào repo)

| `FILE_STORE` | Cần thêm | Dùng cho |
|---|---|---|
| `r2` | `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Triển khai thật (R2 qua S3 API, endpoint `https://<account>.r2.cloudflarestorage.com`) |
| `local` | `FILE_STORE_DIR` | Dev, test, hoặc máy có ổ đĩa bền |
| (bỏ trống) | — | Các thao tác cần tệp trả **503** `FILE_STORE_NOT_CONFIGURED`, không giả vờ lưu |

Thiếu biến của `r2` thì API **không khởi động** và nêu rõ biến nào thiếu. Bucket R2 phải để **riêng tư**, không bật truy cập công khai.

## Tải bản scan cuối

`POST /vibang/cases/:id/final-scan`, thân yêu cầu là chính tệp, `Content-Type: application/pdf`.

- Máy chủ kiểm tra: đúng content-type, bắt đầu bằng `%PDF-`, không rỗng, tối đa **25 MB** (413 nếu vượt).
- Máy chủ **tự tính** sha256, kích thước và khoá đối tượng `t/<tenant>/vibang/<hồ sơ>/final-scan/<uuid>.pdf`. Client không được chọn khoá.
- Ghi tệp trước, rồi gọi `vibang_add_document` (DB quyết định quyền, đòi đã đóng dấu, ghi audit). Nếu DB từ chối hoặc lỗi,
  tệp vừa ghi bị xoá để không để lại tệp mồ côi.
- Siêu dữ liệu ở `vibang_documents` bất biến (append-only); bản scan cuối khoá hash như đã mô tả ở `legal-evidence.md`.

## Giới hạn đã biết (chưa làm)

- **Chưa có tải xuống/xem tệp**: cần hàm đọc có kiểm tra quyền theo phạm vi ghi trước, không mở đường đọc không có kiểm soát.
- Chỉ nhận PDF. Quét mã độc/kiểm tra sâu cấu trúc PDF chưa có; tệp khác PDF cần review bảo mật tệp riêng.
- Tệp tải lên chưa mã hoá ở tầng ứng dụng (dựa vào mã hoá lưu trữ của R2).
- Chứng cứ cho Tống đạt (N-02), nguồn của vòng Xác minh và kết quả THA sẽ dùng cùng cổng này ở các lát sau.
