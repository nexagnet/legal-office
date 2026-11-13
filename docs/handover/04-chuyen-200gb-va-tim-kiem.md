# 04. Chuyển 200GB dữ liệu của khách, OCR và tìm kiếm

Chưa nhập gì thật tính đến 13/11/2026. Tài liệu kỹ thuật có sẵn: [docs/engineering/nhap-200gb-tai-lieu-cu.md](../engineering/nhap-200gb-tai-lieu-cu.md), [docs/architecture/legacy-import.md](../architecture/legacy-import.md), [docs/engineering/ocr.md](../engineering/ocr.md), [docs/engineering/dms-scale-search.md](../engineering/dms-scale-search.md). Kế hoạch ngày 9/11: [reports/ke-hoach-chuyen-200gb-khach-2026-11-09.md](reports/ke-hoach-chuyen-200gb-khach-2026-11-09.md) và [reports/ke-hoach-tim-kiem-200gb-2026-11-09.md](reports/ke-hoach-tim-kiem-200gb-2026-11-09.md).

> Lưu ý: tài liệu `nhap-200gb-tai-lieu-cu.md` còn ghi "bucket R2 bật versioning" và Northflank. Cả hai đã lỗi thời: R2 **không có versioning** (dùng Bucket Lock), production là Tencent.

## 1. Công cụ và thiết kế

- **`lo-import`** (Windows, chạy trên PC; `pnpm --filter api package:import` đóng gói): `scan` (kiểm kê, không đẩy gì), `open` (mở đợt, cần `OFFICE_ID`), `run` (đẩy từng tệp thẳng lên R2 bằng URL ký sẵn rồi ghi `dms_legacy_files`), `report`, `close`. Đăng nhập bằng tài khoản riêng có quyền `dms.legacy.import` (`LO_TENANT_ID/LO_LOGIN/LO_PASSWORD`); phiên 12 giờ, tự đăng nhập lại. Sổ `lo-import-<đợt>.jsonl` là bằng chứng, không xóa. Mã thoát: 0 xong, 2 còn lỗi, 3 hết phiên.
- Khóa tệp trong R2: `t/<tenant>/legacy/<văn phòng>/<2 ký tự đầu sha256>/<sha256>`. Tệp trùng nội dung chỉ lưu một lần (bỏ trùng theo sha256). Tệp >5GiB bị từ chối.
- Bảng **`dms_legacy_files`** bất biến (trigger): nhập nhầm thì dòng DB ở lại vĩnh viễn, và với Bucket Lock thì tệp cũng ở lại. Vì vậy: quét thử, khách xác nhận danh sách, thử lô nhỏ trước.
- Công cụ **không** đọc nội dung, **không** tạo hồ sơ Vi bằng/Tống đạt/…; nhân viên tra cứu tài liệu cũ theo cây thư mục ở `/dms/tai-lieu-cu`. Từ PR #429/#433 có thể **tải tài liệu cũ từng tệp trên web** (tùy chọn yêu cầu OCR).
- Quyền: `dms.legacy.import` (chỉ tài khoản nhập), `dms.legacy.read` (người cần xem). Quyền xem tài liệu cũ hiện **theo văn phòng**, chưa theo thư mục.

## 2. Cờ tính năng

| Biến | Tác dụng | Mặc định |
|---|---|---|
| `LEGACY_OCR_ENABLED` (`1`/`true`) | Worker OCR có nhận việc OCR tài liệu cũ không (bật sau vẫn xử lý phần tồn) | TẮT |
| `LEGACY_SEARCH_ENABLED` (`1`/`true`) | API cho tìm kiếm trong nội dung tài liệu cũ; độc lập với cờ OCR, chỉ API đọc | TẮT |

Hai cờ **độc lập với OCR/tìm kiếm tài liệu mới** (scan của hồ sơ, luôn chạy khi có worker). Trong `deploy/docker-compose.yml` chỉ truyền `LEGACY_SEARCH_ENABLED`; OCR tài liệu cũ chạy trên PC (xem mục 5).

## 3. Quyết định của chủ dự án (9/11/2026)

- Khách đưa **ổ cứng**; chủ dự án và Claude cùng chạy `lo-import` **trên PC của chủ dự án**, **thẳng lên production** (không thử riêng ở dev; được phép xóa R2 làm lại nhưng **không đúng với `legacy/`** vì Bucket Lock và DB bất biến).
- **Chuyển server production xong trước, nhập 200GB sau.**
- Giữ **Bucket Lock** vô thời hạn cho `legacy/` (khuyến nghị đã nhận: đơn giản, không khoảng hở).
- **Đã có văn bản đồng ý của khách** (cần kiểm xem có bao gồm OCR toàn bộ không).
- **Không loại thư mục nào, không quét virus.** (Rủi ro: tệp nhập nhầm ở lại vĩnh viễn; Claude đề xuất vẫn chạy lô đầu 50–100 tệp rồi đối chiếu trước khi chạy đầy đủ.)
- OCR/tìm kiếm **cho tất cả tài liệu, cũ và mới**; **Claude chọn thời điểm** (sau khi nhập và đo mẫu).
- **Trả ổ cứng** cho khách ngay sau khi xác nhận đủ tệp. (Khuyến nghị của kế hoạch: giữ bản gốc đến khi có bản sao dự phòng và khách nghiệm thu; việc trả ổ nên cân nhắc lại với chủ dự án vì khi đó chỉ còn một bản trên R2.)

## 4. Quy trình dự kiến

1. Kiểm kê: `lo-import scan` → số tệp, dung lượng, tệp bị bỏ qua; đối chiếu với con số khách nói.
2. Thử **50–100 tệp thật** ở tenant thật để kiểm Windows + R2 + khóa + chạy lại (kẽ hở 409 khi chạy lại đã vá ở PR #431: `prepare` gọi `head` và bỏ qua PUT khi tệp đã có đúng kích thước).
3. Chạy đầy đủ theo đợt (mỗi năm/loại thư mục một đợt), `report` và `close` từng đợt, `matches: true`. Ước thời gian chỉ tải: 20 Mbps ≈ 22 giờ, 50 Mbps ≈ 9 giờ, 100 Mbps ≈ 4,5 giờ (nhân 1,5–2 nếu nhiều tệp nhỏ hoặc ổ cơ).
4. Đối chiếu: tổng `fileCount`, `totalBytes`, `uniqueObjects` = số đối tượng thực trên R2 (`rclone size`), chọn mẫu 50–100 tệp tải về so sha256.
5. Khách chọn 20–50 tệp bất kỳ tìm theo cây thư mục và mở; kiểm quyền (người không có quyền không thấy); khách ký nghiệm thu.
6. Dọn bảo mật: xóa `lo-import.env`, đổi/khóa tài khoản nhập, giữ sổ `.jsonl`.
- Không deploy API trong lúc nhập (giữ 1 instance).
- **Cần kiểm tra** nếu máy chủ production đã chạy khi nhập: dung lượng đĩa 40GB (DB 150k hồ sơ chỉ ~4,8GB, chỉ mục OCR tài liệu cũ thêm ước ~3–5GB; theo dõi ổ).

## 5. OCR và tìm kiếm tài liệu cũ

- Engine: Tesseract 5 `vie`; PDF có lớp chữ dùng `pdftotext` (gần như miễn phí); PDF scan/ảnh dùng `pdftoppm` 300 dpi (tối đa 50 trang). Kết quả ở `dms_ocr_results` (tài liệu mới) và bảng chỉ mục tài liệu cũ (migration 0121, PR #429).
- Tìm kiếm giữ **Postgres full-text + pg_trgm** (không Meilisearch/Typesense vì RAM). Số đo p95 <210ms ở 742k trang OCR giả; trên server Tencent 150k hồ sơ: tìm nội dung OCR 190–320ms (xem tệp 03).
- **OCR hàng loạt chạy trên PC của chủ dự án**, không trên server 2GB: ước 200GB ≈ 0,7–1,3 triệu trang, Tesseract 3–5 giây/trang/lõi (ước). VPS 2 core cần ~40–60 ngày nên không khả thi; máy mạnh 16–32 vCPU thuê một lần cần ~1,5–3 ngày, ~$30–100 (ước); PC sẵn có chạy đêm 1–3 tuần. **Cách chạy trên PC (worker `LEGACY_OCR_ENABLED=1` trỏ vào DB production qua SSH/tunnel) chưa được thử.**
- **Chưa đo chất lượng OCR trên scan thật.** Rủi ro: chữ viết tay, dấu mộc đè chữ gần như không đọc được; phải nói thẳng với khách: tìm được theo **chữ in**, không đảm bảo chữ viết tay. Bước đo (300–500 trang mẫu thật; giây/trang, độ chính xác, tỷ lệ từ khóa tìm thấy) là cổng quyết định bật OCR/tìm kiếm tài liệu cũ.
- **OCR cho scan MỚI trên production chưa được thiết kế cụ thể**: `deploy/docker-compose.yml` không có service OCR. Phương án đã nêu: cron `OCR_ONCE=1` giới hạn `--cpus=1 --memory=512m` ngoài giờ làm trên server, hoặc chạy worker trên PC. Cần chốt (xem tệp 06). Giao diện đã có % tiến độ OCR trên từng tệp (PR #442).

## 6. Vận hành khi nạp OCR hàng loạt (đã đo 12/11)

- Nạp OCR hàng loạt vào bảng chưa `ANALYZE` khi trigger `dms_osi_ocr_trg` đang bật rất chậm (~40 dòng/giây, chậm dần). Cách làm: **tắt trigger rồi nạp, `VACUUM ANALYZE`, rồi `dms_index_ensure`** (742k dòng OCR nạp ~9 phút, dựng chỉ mục 5m31s cho 150k hồ sơ); hoặc nạp theo lô và `ANALYZE` giữa chừng.
- `dms_index_ensure` lần đầu tự chạy ở lần tìm đầu nhưng quá hạn thì bị hoàn tác: **chạy chủ động** sau khi nhập dữ liệu và tạm dừng web trong lúc dựng.
- Tạo chỉ mục GIN **sau** khi nạp xong dữ liệu (nhanh hơn nhiều).
- Chưa làm: "gắn tài liệu cũ vào hồ sơ" (giai đoạn 4 tùy chọn), quyền theo thư mục, nút "OCR lại" cho Admin.
