# 08. Lịch sử, PR và nơi tìm thêm

## 1. Dòng thời gian

| Ngày | Sự kiện |
|---|---|
| Đến giữa 10/2026 | Khởi đầu: phần mềm quản lý quy trình văn phòng (giao việc THV, MISA, duyệt 48h). Các tài liệu `docs/product`, Issue #1 thuộc giai đoạn này |
| Cuối 10/2026 | Hạ tầng Northflank (dev), rà giao diện quá tải (27/10), Figma "Full UX", 72 câu hỏi khách (29/10) |
| **30/10** | **Chuyển sang DMS** (Issue #265): 4 nghiệp vụ hồ sơ, bất biến, yêu cầu sửa đổi, phân quyền backend, OCR tự host |
| 31/10 | Báo cáo E2E đầu tiên; Admin có 0 quyền DMS → PR #284 |
| 01–02/11 | Phạm vi chi nhánh, thẻ THV, 6 nhóm mẫu, xuất PDF sổ, bàn giao `NGHIEP-VU-TOAN-DU-AN.md` |
| 04/11 | P0–P9 (PR #390–#403): không bắt buộc THV, nhóm Admin, bỏ luồng đề xuất quyền, tài khoản mật khẩu + CCCD, gọn Quản trị |
| 05/11 | Số hồ sơ tự cấp (PR #419), mục A chỉ cột sổ (PR #420), Vi bằng `VB-THV` (PR #421), bộ lọc đợt 1 (PR #423), quy tắc merge khi CI xanh |
| 09/11 | Lập kế hoạch production: OVH, 200GB, tìm kiếm 200GB, khôi phục dữ liệu; **Bucket Lock bật**; tài liệu cũ tải từng tệp + OCR/tìm kiếm tùy chọn (PR #428, #429, #431, #433) |
| 11/11 | Ngân sách ~3 triệu/năm; phương án cao cấp (loại); đo trên laptop |
| 12/11 | So sánh giải pháp rẻ hơn VPS; **mua Tencent Lighthouse**; dựng Postgres 17; đo 30k và 150k hồ sơ giả; PR #437 |
| 13/11 | PR #438 cấu hình production; Tống đạt Cách A (#440); tìm theo số hồ sơ (#441, #443); % OCR (#442); thanh Công việc 3 mục (#439); bộ lọc nghiệp vụ + Excel (#444); tab Tài liệu mới (#445, #446); sửa đóng popover lọc (#447); **bàn giao kiến thức** (thư mục này) |

## 2. PR #418–#447 (merge vào `main`)

| PR | Nội dung |
|---|---|
| #418, #419, #417 | Danh sách hàm đọc VibangRepo; số hồ sơ tự cấp hiện mờ và tự vào sổ; lọc ngày giờ chính xác, ô chọn THV |
| #420 | Mục A chỉ còn cột sổ S-0x; Tên hồ sơ, SĐT, Ghi chú sang mục C |
| #421 | Số Vi bằng `VB-TPL` → `VB-THV` (migration 0118) |
| #422, #434, #439 | Gỡ chữ thừa ở Quản trị/phân quyền; rà nhãn; thanh Công việc còn 3 mục |
| #423 | Bộ lọc mới đợt 1: THV, việc còn dở, đã trả, mốc nhanh, chip "Đang lọc" (migration 0119) |
| #426, #436 | Hạ tầng Reviewer tự động của CI (không ảnh hưởng sản phẩm) |
| #428 | Nhóm mẫu Văn thư xem 4 nghiệp vụ toàn văn phòng (migration 0120) |
| #429, #431, #433 | Tài liệu cũ: tải từng tệp trên web, OCR/tìm kiếm tùy chọn (migration 0121), bỏ PUT khi tệp đã có (Bucket Lock) |
| #432 | Sửa "Hồ sơ nháp chờ tôi lưu" |
| #437 | Giới hạn request theo IP cấu hình bằng env |
| #438 | Cấu hình production Tencent (compose, Caddy, deploy, backup, monitor, workflow) |
| #440 | Tống đạt S-01: một hồ sơ một dòng sổ (migration 0125) |
| #441, #443 | Tìm hồ sơ theo số hồ sơ (số vi bằng, tống đạt, xác minh, tổ chức), thanh tìm header (migration 0123) |
| #442 | % tiến độ OCR trên từng tệp (migration 0124) |
| #444 | Bộ lọc nghiệp vụ và xuất Excel (migration 0126) |
| #445, #446 | Tab Tài liệu mới của chi tiết hồ sơ và sửa lỗi |
| #447 | Bấm ngoài/Esc đóng các ngăn lọc |

PR đang mở nhưng cũ hoặc để tham khảo: #435 (hướng dẫn v2; sẽ đóng khi hướng dẫn mới xong), #427, #386, #224, #198, #193, #176, #166, #160 (xem tệp 06 mục C10).

## 3. Các luồng làm việc (thread) của dự án và kết quả

Mỗi luồng là một cuộc làm việc riêng với AI; quyết định chính đã được đưa vào tài liệu này. Báo cáo gốc ở `reports/`.

| Luồng | Kết quả |
|---|---|
| Khám phá repo (5/11) | `reports/legal-office-repo-overview-2026-11-05.md` |
| Làm sạch mục A theo S-02, bỏ chữ thừa, sửa định dạng số Vi bằng, nghiên cứu bộ lọc (5/11) | PR #420, #421, #422, #423 |
| Tải tài liệu cũ có OCR; quyền Văn thư; sửa nháp (9/11) | PR #428, #429, #432, #433 |
| Kế hoạch production OVH; tìm kiếm 200GB; chuyển 200GB; biện pháp khôi phục; khảo sát thùng rác; Bucket Lock qua CLI (9/11) | Các báo cáo ngày 9/11; Bucket Lock bật; PR #431 |
| Checklist trước production (9/11) | `reports/checklist-truoc-production-2026-11-09.md` (nhiều mục còn mở) |
| Tìm nơi thuê server rẻ nhất; chip CPU OVH; phương án server cao cấp; đo Northflank free; so sánh giải pháp rẻ hơn VPS (9–12/11) | Báo cáo tương ứng; kết luận: VPS nhỏ + R2 + backup nhiều lớp là rẻ nhất mà vẫn an toàn |
| Điều chỉnh kiến trúc chạy trên Tencent 2GB (12–13/11) | Phương án Tencent, đo 30k/150k, PR #437, #438 |
| Tìm theo số vi bằng, % OCR, thanh Công việc, Tống đạt S-01, thiết kế tab Tài liệu, sửa lỗi chi tiết hồ sơ (13/11) | PR #439–#446; `reports/ke-hoach-s01-tong-dat-theo-mau-so-2026-11-13.md` |
| Sửa popover lọc rồi thiết kế lại vùng lọc và viết lại hướng dẫn (13/11) | PR #447; bản vẽ HTML chờ duyệt (tệp 06 C1) |
| Viết lại hướng dẫn sử dụng PDF có ảnh (10/11) | PR #435 (chưa merge) |
| Bàn giao kiến thức lên GitHub (13/11) | Thư mục này |

## 4. Nơi tìm thêm

| Cần gì | Ở đâu |
|---|---|
| Nghiệp vụ chi tiết, mô hình dữ liệu, phân quyền | [docs/handoff/NGHIEP-VU-TOAN-DU-AN.md](../handoff/NGHIEP-VU-TOAN-DU-AN.md); [docs/handoff/DANH-SACH-TAI-LIEU.md](../handoff/DANH-SACH-TAI-LIEU.md) |
| 72 câu hỏi khách, bảng nhóm quyền mẫu | `docs/handoff/tham-chieu/` |
| Kiến trúc, từng module | `docs/architecture/` (một số tệp cũ trước 30/10; đọc nhãn ngày) |
| Triển khai, OCR, 200GB, tìm kiếm quy mô lớn | `docs/engineering/` |
| Báo cáo E2E 31/10, kế hoạch giao diện, ảnh Figma | `reports/` (gốc repo), [reports/](reports/) ở đây |
| Văn bản pháp luật (NĐ 151/2026, TT 08/2026, Phụ lục I–IX), biểu mẫu thừa hành viên, báo giá, ảnh Excel sổ Văn thư của khách, ảnh chụp màn hình | Thư mục tệp của dự án (project files); **không có trong repo**, do chủ dự án giữ |
| Hướng dẫn sử dụng | `docs/user-guide/`, PDF v2 trong thư mục tệp dự án; **đang được viết lại** |
| Figma | `https://www.figma.com/design/bueSNVniMoYD6lQFHwqeHz` (DMS v2). Trang "01 · Vi bằng" y ≥ 5300: các khung thiết kế tab Tài liệu (T0 hiện trạng 517:501 … T8 ghi chú 517:878), PR #445 (merge 13/11) triển khai thiết kế này; ghi nhớ trước đó ghi Figma "chờ duyệt", chưa rõ chủ dự án đã duyệt đủ T0–T8 hay chưa |
| Bản vẽ vùng lọc đang chờ duyệt | `proposals/thiet-ke-vung-loc-2026-11-13.html` trong thư mục tệp dự án |
