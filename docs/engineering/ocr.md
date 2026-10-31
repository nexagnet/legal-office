# OCR để tìm kiếm (DMS Phase 6)

OCR chỉ phục vụ **tìm kiếm toàn văn** trong tệp scan. Văn bản nhận dạng nằm ở bảng riêng `dms_ocr_results`, không bao giờ sửa trường hồ sơ, và không có đường đưa văn bản OCR đầy đủ ra API (chỉ đoạn trích ngắn). OCR chạy hoàn toàn trong container của mình, không gọi dịch vụ ngoài.

## Thành phần

- Migration `0084_dms_ocr.sql`: bảng `dms_ocr_results` (RLS ép buộc, một dòng cho mỗi phiên bản tệp), hàm `dms_ocr_claim/complete/fail/search`. Không dùng extension `unaccent`; văn bản được bỏ dấu ở ứng dụng (`apps/api/src/ocr/text.ts`) và lưu vào `search_text`.
- Engine: Tesseract 5 gói `vie`. PDF có lớp chữ thì lấy bằng `pdftotext`, không thì `pdftoppm` 300 dpi rồi OCR từng trang (tối đa 50 trang). Cổng `OcrEngine` cho phép thêm PaddleOCR sau mà không đổi worker.
- Worker `apps/api/src/ocr/ocr.cli.ts`: vòng lặp nền, mỗi tenant một lượt, tối đa 3 lần thử mỗi phiên bản, lỗi chỉ lưu mã ngắn. Phiên bản không phải ảnh/PDF được đánh dấu `SKIPPED`.
- API: `GET /dms/search?officeId=&q=&domain=&limit=` trả hồ sơ/tài liệu/tệp khớp và đoạn trích. Quyền xem dùng cùng `dms_case_visible` với danh sách hồ sơ; chỉ tìm trên phiên bản mới nhất của mỗi tệp.

## Dịch vụ `lo-ocr` trên Northflank

| Mục | Giá trị |
|---|---|
| Loại | Service nền (không cổng, không public), 1 instance |
| Build | Dockerfile gốc repo, `--target ocr`, nhánh `main` |
| Tài nguyên | 0,5 đến 1 vCPU, 1 GB RAM (tăng lên 2 GB nếu PDF nhiều trang) |
| `DATABASE_URL` | Vai `legal_app`, cùng giá trị của `lo-api` |
| `FILE_STORE*` | Giống `lo-api`. `FILE_STORE=local` cần gắn CÙNG volume `lo-files` (`/data/files`) vào `lo-ocr`; nếu volume không dùng chung được thì chuyển sang `FILE_STORE=r2` |
| `OCR_TENANT_IDS` | Danh sách tenant id, cách nhau dấu phẩy |
| Tuỳ chọn | `OCR_LANG` (mặc định `vie`), `OCR_POLL_SECONDS` (mặc định 30) |

Không cần biến mới trong secret group đang có; chỉ thêm `OCR_TENANT_IDS` (không bí mật). Migration 0084 tự áp khi `lo-api` khởi động như các migration khác.

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
