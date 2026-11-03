# seed-demo — nạp dữ liệu GIẢ cho 4 nghiệp vụ

Tạo qua API hợp lệ (không ghi thẳng DB, không xóa/ghi đè): mỗi nghiệp vụ Vi bằng, Tống đạt, Xác minh THA, Tổ chức THA có
`SEED_COUNT` (mặc định 36) hồ sơ: 30 Chính thức, 3 Nháp, 3 Đã hủy; vài hồ sơ Thiếu scan (một tài liệu không có tệp). Mỗi hồ sơ có SĐT khách hàng GIẢ (`0900 000 xxx`), khoảng một phần tư hồ sơ chính thức được
tích "Đã trả kết quả", và có 4 bản **Trình / Duyệt** giả (2 chờ duyệt, 1 đã duyệt, 1 bị từ chối). Mỗi tài liệu có tệp scan PDF tiếng Việt khác nhau (1/3 là PDF "ảnh" không có lớp chữ để OCR thật).
Toàn bộ dữ liệu bịa; hồ sơ và tài liệu mang thuộc tính `seed_demo = "seed-demo"` để nhận diện/dọn sau.
Chạy lại không nhân đôi (nhận theo tiêu đề hồ sơ) và tiếp tục được hồ sơ nháp dở dang.

## Chạy

```
pnpm install
SEED_API_URL=https://dev.nexagnet.com/api \
SEED_TENANT_ID=<uuid tenant> SEED_EMAIL=<tài khoản có quyền tạo/ghi sổ cả 4 nghiệp vụ> SEED_PASSWORD=... \
SEED_PROPOSER_EMAIL=<tài khoản không phải Admin, là thành viên văn phòng (người gửi bản Trình / Duyệt)> SEED_PROPOSER_PASSWORD=... \
node tools/seed-demo/seed.mjs
```

- `SEED_DOMAINS=vibang,tongdat` giới hạn nghiệp vụ; `SEED_OFFICE_ID` nếu tài khoản thuộc nhiều văn phòng.
- Hồ sơ rải đều các chi nhánh mà tài khoản nạp được cấp (`/auth/me`).
- Không có `SEED_PROPOSER_*` thì chính tài khoản nạp gửi các bản Trình / Duyệt giả. Luồng yêu cầu sửa đổi đã gỡ nên không còn được nạp.
- Cục bộ: thay bằng `SEED_SYNTHETIC_USER` / `SEED_PROPOSER_SYNTHETIC_USER` khi API chạy `AUTH_MODE=synthetic-test`.

Bản scan dựng bằng pdfkit + phông Tinos có sẵn của `apps/api`; OCR do worker `lo-ocr` của môi trường xử lý.
