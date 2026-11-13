# Kế hoạch tìm kiếm trên ~200GB file scan có sẵn của khách (9/11/2026)

Chỉ là kế hoạch, chưa code. Các con số có đánh dấu (ước) là suy luận, cần đo lại bằng mẫu thật ở Giai đoạn 0.

## 1. Hiện trạng (đã có trong repo, không làm lại)
- **Nhập 200GB**: công cụ `lo-import` (Windows, chạy trên máy khách) đẩy thẳng lên R2, bảng `dms_legacy_files` (đường dẫn, tên, kích thước, sha256, object_key), bất biến, theo đợt. Tài liệu: `docs/engineering/nhap-200gb-tai-lieu-cu.md`. Chưa thử R2 thật / Windows thật.
- **OCR**: Tesseract `vie`, Cron Job trên Northflank, nhưng chỉ chạy cho tệp scan của hồ sơ (`dms_ocr_results`). **Tài liệu cũ chưa được OCR** và chưa có màn hình duyệt/tìm (`/dms/tai-lieu-cu` chỉ duyệt cây). Chỉ truy cập qua API `GET /dms/legacy/files`.
- **Tìm kiếm**: đã có `dms_search_content` (tsvector đã bỏ dấu + GIN), `pg_trgm` cho hồ sơ, đo p95 dưới 210ms ở 742.000 trang OCR giả. Phân quyền theo vai/chi nhánh đã làm cho hồ sơ; tài liệu cũ chỉ có quyền `dms.legacy.read` theo văn phòng.
- Khoảng trống thật sự: (1) OCR hàng loạt cho tài liệu cũ, (2) bảng chỉ mục tìm cho tài liệu cũ, (3) giao diện tìm, (4) đo chất lượng trên scan thật.

## 2. Phương án rẻ nhất (khuyến nghị)
**Giữ Postgres full-text + pg_trgm đang có, không thêm Meilisearch/Typesense.**
- Meilisearch/Typesense cần RAM xấp xỉ kích thước chỉ mục, mà VPS BizFly 2 core / 2GB đã chật. Thêm dịch vụ thứ hai = thêm tiền và thêm việc vận hành, trong khi Postgres đã đo đạt mục tiêu.
- Tìm không dấu và có dấu: dùng cột đã bỏ dấu (`dms_fold`), tìm theo từ (tsvector, cấu hình `simple`) cho truy vấn nhiều từ, và trigram cho số hiệu / tên riêng / gõ sai nhẹ. Xếp hạng `ts_rank` + mới nhất.
- Chỉ xem lại Meilisearch nếu ở Giai đoạn 3 p95 vượt 1 giây trên máy thật (xem rủi ro RAM).

## 3. Các giai đoạn
**GĐ 0 – Đo thử (1–2 ngày công, gần như 0 đồng).** Lấy 300–500 trang mẫu thật từ khách (đủ loại: in, con dấu đè chữ, viết tay, ảnh nghiêng, giấy cũ). Chạy engine hiện có, đo: giây/trang, độ giống ký tự, tỷ lệ từ khoá tìm thấy. Đo kích thước trung bình mỗi trang và số trang tổng ⇒ chốt ước lượng thời gian/chi phí. Đây là cổng quyết định có làm GĐ 2 hay đổi engine.

**GĐ 1 – Nhập (đã có công cụ; việc còn lại).** Thử R2 thật + máy Windows thật theo mục 4.3 của tài liệu nhập. Thêm: ghi `sha256` và loại tệp để OCR bỏ trùng (tệp trùng nội dung chỉ OCR một lần), quét virus phía khách trước khi nhập.

**GĐ 2 – OCR hàng loạt + chỉ mục (3–5 ngày công).**
- Migration mới: `dms_legacy_ocr` (file_id, trạng thái, số trang, text đã nén, `tsvector`, cờ lỗi, số lần thử) + hàng đợi claim/complete/fail giống `dms_ocr_*`. Không đụng bảng bất biến `dms_legacy_files`.
- Mở rộng worker `ocr.cli`: nguồn việc thứ hai là tài liệu cũ. Ưu tiên theo thứ tự: PDF có lớp chữ (`pdftotext`, gần như miễn phí) → ảnh/PDF scan (Tesseract). Bỏ qua Word/Excel dùng trích chữ trực tiếp. Chạy được, dừng được, chạy lại được; ghi tiến độ (đã xong / lỗi / còn lại).
- Chạy hàng loạt **một lần trên máy thuê ngắn hạn hoặc máy mạnh sẵn có**, không trên VPS 2 core (xem mục 4).
- Tạo GIN **sau khi** nạp xong dữ liệu (nhanh hơn nhiều so với vừa nạp vừa cập nhật chỉ mục), rồi `ANALYZE`.

**GĐ 3 – Tìm kiếm + giao diện (3–4 ngày công).**
- API `GET /dms/legacy/search?q=&prefix=&year=&type=` (cùng khuôn mẫu `/dms/search`): trả tệp, thư mục, đoạn trích có tô sáng, trang khớp. Phân trang keyset, tối đa vài trăm kết quả/lần.
- Giao diện: thêm ô "Tìm trong nội dung" vào `/dms/tai-lieu-cu` (và một tab "Tài liệu cũ" ở `/dms/tim-kiem`): ô tìm + lọc thư mục/năm/loại tệp, kết quả kèm đoạn trích, bấm mở tệp (liên kết R2 ngắn hạn, đã ghi nhật ký). Có thể mở thẳng đến trang khớp (pdf.js đã có). Gợi ý "chưa OCR / OCR lỗi" để người dùng biết tệp nào không tìm được.
- Quyền: bắt buộc `dms.legacy.read` + đúng văn phòng; RLS tenant như hiện có. Nếu khách cần hạn chế theo thư mục (ví dụ hồ sơ nhạy cảm) thì thêm bảng quyền theo tiền tố thư mục, làm ở GĐ 4.

**GĐ 4 – Liên kết hồ sơ + hoàn thiện (tuỳ chọn, theo nhu cầu).**
- "Gắn tài liệu cũ vào hồ sơ": bảng liên kết riêng (không sửa tệp cũ, không sửa hồ sơ đã ghi sổ; thay đổi hồ sơ vẫn phải qua yêu cầu sửa đổi). Gợi ý tự động: số hiệu vi bằng / số văn bản tìm thấy trong OCR khớp hồ sơ nào. Lưu ý quy tắc dự án: mọi thông tin phụ (tên, SĐT, ghi chú) của form gắn nằm ở mục C; mục A chỉ chứa cột sổ S-0x.
- Quyền theo thư mục, nút "OCR lại" cho Admin, thử PaddleOCR nếu chữ in kém.

## 4. OCR hàng loạt: thời gian và chi phí (ước)
Giả định: 200GB scan ≈ 0,7–1,3 triệu trang (150–300KB/trang). Tesseract `vie` ≈ 3–5 giây/trang/lõi ở 200–300 dpi.
| Nơi chạy | Thời gian | Chi phí |
|---|---|---|
| VPS BizFly 2 core / 2GB (dùng chung với app) | ~40–60 ngày, chiếm hết CPU, app chậm | 0 đồng thêm nhưng **không khả thi** |
| Máy thuê theo giờ 16–32 vCPU (chạy 1 lần) | ~1,5–3 ngày | khoảng 30–100 USD một lần (ước) |
| Máy tính mạnh sẵn có chạy ban đêm | 1–3 tuần | 0 |
Cách giảm: bỏ trùng theo sha256; PDF có lớp chữ không cần OCR; hạ 300→200 dpi nếu mẫu GĐ 0 vẫn đạt; giới hạn số trang đầu mỗi tệp dài (hiện 50) và đánh dấu "chỉ OCR 50 trang đầu".
Khuyến nghị: **thuê máy mạnh 1 lần**, worker ghi thẳng vào DB production (hoặc ghi ra tệp rồi nạp), sau đó trả máy. VPS chỉ phục vụ tìm kiếm và OCR tệp mới phát sinh (khối lượng nhỏ).

## 5. Dung lượng chỉ mục và RAM (ước)
- Văn bản OCR ≈ 2–3KB/trang ⇒ khoảng 2–3GB thô cho ~1 triệu trang; nén (TOAST) còn ~1GB. tsvector + GIN thêm ~1–2GB. Tổng thêm **~3–5GB đĩa**. Cần kiểm tra ổ của VPS và gói sao lưu.
- RAM 2GB: GIN vài GB không nằm hết trong cache ⇒ truy vấn nguội có thể 0,5–2 giây (benchmark hiện tại chạy máy 4 CPU, dữ liệu giả ngắn hơn thật). Giảm nhẹ: không lưu `search_text` trùng lặp cạnh tsvector, chỉ lưu text một lần; giới hạn kết quả; `shared_buffers` ~512MB; nếu chậm thì nâng VPS lên 4GB (chi phí nhỏ nhất so với thêm công cụ tìm kiếm).
- Chi phí R2 (lưu 200GB, không phí egress): đã tính ở thread chi phí trước; kế hoạch này không thêm dung lượng trên R2 (OCR nằm trong DB).

## 6. Rủi ro
1. **Chữ viết tay và dấu mộc đè chữ**: Tesseract gần như không đọc được chữ viết tay; kết quả có thể rất thấp. Cần nói thẳng với khách: tìm được theo chữ in, **không đảm bảo** chữ viết tay. Biện pháp: GĐ 0 đo trước; tìm theo tên thư mục/tên tệp luôn có; cân nhắc OCR có trả phí chỉ cho tập nhỏ quan trọng (cần khách đồng ý vì dữ liệu cá nhân gửi bên ngoài).
2. **Chất lượng trên scan thật chưa từng đo** (tài liệu hiện chỉ đo mẫu tổng hợp).
3. **Hiệu năng trên 2GB RAM** như mục 5.
4. **Chạy OCR làm nghẽn app production**: tách máy chạy, giới hạn CPU, chạy ngoài giờ.
5. **Tệp lớn >5GiB, tệp hỏng/có mật khẩu, nhiều tệp nhỏ**: nhập/OCR ghi lỗi theo tệp, không dừng cả đợt; báo cáo cuối.
6. **Dữ liệu cá nhân (Luật BVDLCN 91/2025/QH15)**: văn bản đồng ý của khách; không gửi nội dung ra dịch vụ OCR bên ngoài nếu chưa có đồng ý.
7. **Bất biến**: nhập nhầm thư mục không gỡ được ⇒ giữ nguyên bước quét thử + khách xác nhận.
8. Chưa thử R2 thật / Windows thật: là rủi ro lớn nhất của GĐ 1.

## 7. Cần anh/chị quyết
1. **Mức kỳ vọng với chữ viết tay**: chấp nhận "chỉ tìm được chữ in" không? (ảnh hưởng có đổi engine/trả phí không)
2. **OCR ở đâu**: thuê máy mạnh 1 lần (khuyến nghị, ~30–100 USD ước) hay chạy máy sẵn có trong vài tuần?
3. **Phạm vi OCR**: toàn bộ 200GB hay chỉ một số thư mục/năm trước? (giảm chi phí và thời gian)
4. **Quyền xem tài liệu cũ**: chỉ theo văn phòng (đang có) hay cần theo thư mục/nhóm?
5. **Có cần gắn tài liệu cũ vào hồ sơ** (GĐ 4) không, hay chỉ cần tìm và mở?
6. **Có sẵn khoảng 300–500 trang mẫu thật** từ khách cho GĐ 0 không?
7. Nâng VPS lên 4GB nếu đo thấy chậm: có chấp nhận không?
