# Kế hoạch chỉnh giao diện đợt 2 theo Figma (03/11/2026)

Nguồn so sánh: file Figma `bueSNVniMoYD6lQFHwqeHz` (15 trang, ~120 khung) với dev.nexagnet.com (phiên THV) và ảnh chụp Admin do chủ dự án gửi. Nguyên tắc: nghiệp vụ trước Figma.

## 1. Mức chắc chắn của khảo sát

- **Đã nhìn thật:** chi tiết hồ sơ Vi bằng (tab Thông tin chung, Tài liệu, ảnh Admin), danh sách Vi bằng, Trình / Duyệt, Chờ tôi xác nhận, Tổng quan, Tìm trong nội dung scan, Thư viện biểu mẫu, Thông báo, Xuất sổ, Văn thư (Văn bản đến), Phân quyền (chỉ thấy "Không có quyền" vì phiên THV).
- **Chưa nhìn được:** Quản trị Q1–Q9, Phân quyền P0–P12, Thẻ THV, Cấu hình, Hồ sơ lao động, Báo cáo, Vật tư. Cần phiên Admin để chụp (mục 2.3).

## 2. Phát hiện

### 2.1 Chi tiết hồ sơ (Vi bằng, Tống đạt, Xác minh, Tổ chức THA, Văn thư): lệch lớn nhất

Cùng một trang `dms/[domain]/[id]/page.tsx` cho cả 5 nghiệp vụ, nên sửa một nơi là đủ. Figma: `352:2613` (A2), `458:2043` (A2a Admin), `414:1705` (A2d nháp), `352:4209`, `352:4344`, `352:4480`, và 3 khung Văn thư sau đăng ký.

| # | Figma | Code hiện tại | Mức |
|---|---|---|---|
| D1 | Tiêu đề trang "{số hồ sơ} · Chi tiết hồ sơ" và dòng "Khách hàng · SĐT" | Tiêu đề là tên nghiệp vụ "Vi bằng" + mô tả sổ; số hồ sơ nằm ở khối nhỏ bên dưới | Cao |
| D2 | Dải vàng "Hồ sơ đã ghi sổ… mọi thao tác ghi lịch sử" + liên kết "Xem lịch sử" ngay dưới tiêu đề | Chữ xám nhỏ nằm lẫn trong tab Thông tin chung | Cao |
| D3 | 6 tab: Thông tin chung, Tài liệu (n), **Tệp đính kèm (n)**, **Phiên bản cũ (n)**, **Lịch sử hoạt động**, Số liên quan, kèm dòng giải thích 3 khái niệm | 5 tab: Thông tin chung, Tài liệu, Scan, Phiên bản, Sổ liên quan; không có Lịch sử hoạt động; tên khác | Trung bình |
| D4 | Tab Thông tin chung: thẻ trắng bo góc, lưới nhãn / giá trị 2–4 cột, nhóm A thông tin, C hệ thống | `<dl>` trần: nhãn và giá trị xếp dọc, thụt lề mặc định, tiêu đề cột sổ in hoa lẫn nhãn (ảnh Admin) | Cao |
| D5 | Tab Tài liệu: mỗi nhóm tài liệu là một thẻ trắng có tiêu đề (loại · mã); mỗi tệp một dòng: tên, dung lượng · ngày · người tải, chip "File chính / Bổ sung", nút Xem, liên kết Tải | `<ul>` trần; "Xóa scan" là chữ xanh trần; nút Xem và Tải lệch hàng | Cao |
| D6 | Khung xem PDF nền sáng bo góc + 3 nút **Tải bản scan chính / In / Tải thêm scan** + ghi chú quyền | Trình xem PDF của trình duyệt nền đen, cao hơn trang; thiếu nút "Tải thêm scan" | Trung bình |
| D7 | Tải tệp: ô chọn tệp, tên tệp, hộp "Bản scan" theo kiểu Field của design system | `<input type=file>` mặc định, ô "Tên tệp" viền đen, checkbox trần (ảnh Admin) | Cao |
| D8 | Admin: "Sửa hồ sơ", "Xóa scan" thuộc nhóm hành động có biểu tượng (A2a) | "Sửa hồ sơ (Admin)" đúng chức năng nhưng nằm cạnh đoạn chữ dài | Thấp |
| D9 | Chip trạng thái dưới tiêu đề (Đã ghi sổ, n tài liệu, n scan) | Có, nhưng viền chip đậm, không có màu trạng thái; dải xanh "1 tài liệu · 1 tệp scan…" thừa so với Figma | Thấp |
| D10 | Nháp A2d / Hủy nháp A2e: ba khối A, B, C có thẻ | Có khối A, B, C; nút "Tải lên" dẫn sang tab khác; hộp thoại hủy cần kiểm đã thay `window.confirm` chưa | Cần xác minh |

### 2.2 Các màn nhỏ (trang 06, 08, 12, 13)

| # | Màn Figma | Hiện trạng đã chụp | Mức |
|---|---|---|---|
| S1 | XN1 Chờ tôi xác nhận `468:4`, XN2 `469:2` | Tiêu đề đúng; trạng thái rỗng đơn giản; XN2 cần mở với dữ liệu thật | Thấp |
| S2 | TK1 Tìm trong nội dung scan `468:402` | Form và bộ lọc có, hàng bộ lọc lệch; chưa có khối kết quả có đoạn trích đậm | Trung bình |
| S3 | BM1 Thư viện biểu mẫu `468:774` | Ô tìm kiếm và nút "Thông tư 08" rời rạc, trạng thái rỗng thô | Trung bình |
| S4 | TB1 Thông báo `468:1147` | Thẻ viền đỏ, tab lọc đúng; tiêu đề trang đang là tên văn phòng thay vì "Thông báo" | Trung bình |
| S5 | Xuất sổ S-01, S-02, S-04, S-05, Văn thư (7 khung trang 06) | `/dms/so` chỉ là danh sách liên kết chữ; chưa có xem trước theo mẫu (đã nêu G8) | Trung bình |
| S6 | T1 / T1b Tổng quan `352:3252`, `383:769` | 4 thẻ KPI + biểu đồ thanh có; thẻ "Cần bổ sung scan" thô; T1b Admin chưa so | Thấp |
| S7 | Danh sách 4 nghiệp vụ, Trình / Duyệt TD1, Văn thư | Đã theo Figma ở đợt 1 | Không việc |
| S8 | Mobile M1–M5 | Mới gọn đầu trang (#379); bảng chưa thành thẻ bản ghi | Trung bình |

### 2.3 Màn Admin và hệ thống (chưa đo)

Phân quyền P0–P12 và QX1, Quản trị Q1–Q9, Cấu hình CD1, Hồ sơ lao động LD1, Báo cáo H1 và MB1, Vật tư O1, Đăng nhập DN1–DN3. Đợt 1 chỉ sửa chữ và quyền ở các màn này, chưa đối chiếu kiểu dáng.

### 2.4 Nguyên nhân gốc

Trang chi tiết và vài trang cũ dùng thẻ HTML trần (`dl`, `ul`, `input`) thay vì bộ phần tử chung. `components/ui` đã có `def-list`, `state-card`, `tab-nav`, `field`, `button`, `data-table`, nhưng chưa có: nhóm tệp đính kèm, ô tải tệp, khung xem PDF, dải thông báo. Dựng 4 phần tử đó trước rồi áp vào các màn.

## 3. Kế hoạch (mỗi giai đoạn một PR nhỏ, CI xanh mới merge)

| GĐ | Việc | Chạm | Kiểm |
|---|---|---|---|
| U0 | 4 phần tử chung: `NoticeBar`, `FileGroupCard`, `FilePicker`, `PdfPane`; dùng lại `DefList` | `components/ui`, `theme-v2.css`, test thành phần | vitest, tsc, eslint |
| U1 | **Chi tiết hồ sơ** D1–D9: tiêu đề số hồ sơ, dải ghi sổ, 6 tab (thêm Lịch sử hoạt động của riêng hồ sơ), Thông tin chung dạng thẻ lưới, Tài liệu theo nhóm, tải tệp, 3 nút | `dms/[domain]/[id]/page.tsx` (733 dòng, tách khối), `DeleteScanButton`, `AddDmsDocumentForm`, `UploadDmsFile` | Ảnh dev 1440 và 390, so từng khung A2, A2a, TĐ, XM, TC, Văn thư |
| U2 | Nháp và hủy nháp D10: hộp thoại xác nhận thay `window.confirm`, nút "Tải lên" tại chỗ | `DmsDraftActions`, `[id]/page.tsx` | Test hộp thoại; ảnh A2d, A2e |
| U3 | Màn nhỏ S1–S4, S6 | `dms/thv`, `dms/tim-kiem`, `bieu-mau`, `thong-bao`, `page.tsx` | Ảnh chụp, so Figma |
| U4 | Xuất sổ có xem trước S5 (dùng PDF thật đã có) | `dms/so/*`, `BookPdfViewer` | Test không in SĐT (N1) |
| U5 | Mobile S8: bảng thành thẻ bản ghi | `theme-v2.css`, `DmsDomainTable` | 390 px |
| U6 | **Đo màn Admin** rồi lập danh sách sửa. Cần chủ dự án đăng nhập Admin trong trình duyệt (tôi không nhập mật khẩu) | Phân quyền, Quản trị, Cấu hình, Báo cáo, Vật tư, Đăng nhập | Ảnh chụp từng màn |

Thứ tự đề nghị: U0 → U1 → U2 → U3 → U4 → U6 → U5.

## 4. Giữ nguyên, không sửa theo Figma

- Bảng danh sách rộng 1334 px (Figma 1144): hai cột thêm SĐT và Đã trả KQ là nghiệp vụ.
- Dữ liệu tab Phiên bản và Lịch sử giữ nguyên, chỉ đổi tên và bố cục.
- Route ẩn cũ `/vi-bang/[id]/*`, `/hop-dong`: không có trong Figma, không đụng.

## 5. Rủi ro

| Rủi ro | Mức | Giảm |
|---|---|---|
| `[id]/page.tsx` quá dài, sửa dễ làm hỏng quyền hoặc luồng nháp | Cao | Tách khối trước (không đổi hành vi, giữ test), rồi mới đổi giao diện |
| Figma vẽ bằng dữ liệu mẫu, thiếu trạng thái thật (nhiều tệp, tên dài, không scan) | Trung bình | Chụp thêm trạng thái dài / rỗng khi kiểm |
| Không có phiên Admin để đo | Trung bình | U6 chờ bạn đăng nhập; U0–U5 không phụ thuộc |
| Dev chạy bản cũ cho tới khi deploy | Thấp | Northflank tự build khi merge `main` |

Ước lượng: U0 nhỏ, U1 lớn (chủ yếu tách khối), U2–U5 mỗi giai đoạn vừa.
