# OCR để tìm kiếm (DMS Phase 6)

OCR chỉ phục vụ **tìm kiếm toàn văn** trong tệp scan. Văn bản nhận dạng nằm ở bảng riêng `dms_ocr_results`, không bao giờ sửa trường hồ sơ, và không có đường đưa văn bản OCR đầy đủ ra API (chỉ đoạn trích ngắn). OCR chạy hoàn toàn trong container của mình, không gọi dịch vụ ngoài.

## Thành phần

- Migration `0084_dms_ocr.sql`: bảng `dms_ocr_results` (RLS ép buộc, một dòng cho mỗi phiên bản tệp), hàm `dms_ocr_claim/complete/fail/search`. Không dùng extension `unaccent`; văn bản được bỏ dấu ở ứng dụng (`apps/api/src/ocr/text.ts`) và lưu vào `search_text`.
- Engine: Tesseract 5 gói `vie`. PDF có lớp chữ thì lấy bằng `pdftotext`, không thì `pdftoppm` 300 dpi rồi OCR từng trang (tối đa 50 trang). Cổng `OcrEngine` cho phép thêm PaddleOCR sau mà không đổi worker.
- Worker `apps/api/src/ocr/ocr.cli.ts`: vòng lặp nền, mỗi tenant một lượt, tối đa 3 lần thử mỗi phiên bản, lỗi chỉ lưu mã ngắn. Phiên bản không phải ảnh/PDF được đánh dấu `SKIPPED`.
- API: `GET /dms/search?officeId=&q=&domain=&limit=` trả hồ sơ/tài liệu/tệp khớp và đoạn trích. Quyền xem dùng cùng `dms_case_visible` với danh sách hồ sơ; chỉ tìm trên phiên bản mới nhất của mỗi tệp.

## `lo-ocr` là Job theo lịch trên Northflank

Gói miễn phí hết chỗ cho service, nên `lo-ocr` chạy như **Job theo lịch** (chạy một lần rồi thoát), không phải service thường trực.

| Mục | Giá trị |
|---|---|
| Loại | Cron Job, lịch mỗi 5 đến 10 phút (vd `*/10 * * * *`), không cho chạy chồng nhau (concurrency 1) |
| Build | Dockerfile gốc repo, `--target ocr`, nhánh `main` (lệnh mặc định của image: `node dist/ocr/ocr.cli.js`) |
| Tài nguyên | 0,5 đến 1 vCPU, 1 GB RAM (tăng lên 2 GB nếu PDF nhiều trang) |
| `OCR_ONCE` | `1` (bắt buộc cho Job). Xử lý hết việc đang chờ rồi thoát: mã 0 khi xong, mã 1 nếu có tenant lỗi hệ thống (DB, kho tệp). Lỗi từng tệp không làm Job lỗi; tệp đó được thử lại ở lượt sau, tối đa 3 lần |
| `DATABASE_URL` | Vai `legal_app`, cùng giá trị của `lo-api` |
| `FILE_STORE*` | Giống `lo-api`. Production dùng `FILE_STORE=r2` nên Job đọc cùng bucket, không cần chia sẻ volume. (`FILE_STORE=local` chỉ để thử và cần gắn cùng volume) |
| `OCR_TENANT_IDS` | Danh sách tenant id, cách nhau dấu phẩy |
| Tuỳ chọn | `OCR_LANG` (mặc định `vie`) |

Không cần biến mới trong secret group đang có; chỉ thêm `OCR_ONCE` và `OCR_TENANT_IDS` (không bí mật). Migration 0084 tự áp khi `lo-api` khởi động và phải áp trước lượt Job đầu tiên. Không đặt `OCR_ONCE` thì image chạy vòng lặp nền (dùng khi có chỗ cho service thường trực).

## Đo chất lượng (scan mẫu tổng hợp, văn bản giả)

Tesseract 5.3 `vie`, trang A4 ghép từ văn bản giả có dấu và con dấu giả:

| Mẫu | Độ giống ký tự | Từ khoá có dấu | Từ khoá không dấu |
|---|---|---|---|
| 300 dpi sạch | 0,992 | 8/8 | 8/8 |
| 300 dpi nghiêng 1,2°, nhiễu | 0,982 | 8/8 | 8/8 |
| 150 dpi nghiêng, nhiễu | 0,970 | 8/8 | 8/8 |
| 200 dpi chữ nhỏ, mờ | 0,961 | 8/8 | 8/8 |

Mẫu tổng hợp dùng phông in sạch nên chỉ cho thấy engine đọc được dấu tiếng Việt; **chưa đại diện cho scan thật** (giấy cũ, con dấu đè chữ, chữ viết tay). Cần đo lại khi có scan thật; nếu kém thì thử PaddleOCR sau cổng `OcrEngine`.

## Chưa làm trong lát này

- Nút "chạy lại OCR" cho Admin và ô tìm kiếm trên giao diện web.
- Ghi `dms_audit_records` cho từng lần OCR (hiện lịch sử nằm ngay trong `dms_ocr_results`: số lần thử, thời điểm, lỗi).
