# Báo cáo E2E DMS trên www.nexagnet.com (31/10/2026)

Dữ liệu giả có tiền tố "TEST E2E". Chưa viết thêm code sửa lỗi nào ngoài PR #284 (đã merge) theo chỉ đạo "báo cáo trước rồi mới code".

## 1. Đã sửa và merge
- **Admin có 0 quyền DMS** nên không thấy form tạo nháp, không tạo được hồ sơ. PR #284 (migration 0086): vai ADMIN mặc nhiên có mọi quyền DMS ở văn phòng của mình, thay đổi quyền của Admin có hiệu lực ngay. Sau deploy Admin có 75 quyền, form hiện đúng.
- Test `scan.test.ts` hỏng trên Windows (không tạo được symlink), đã cho bỏ ca đó khi hệ điều hành không cho phép.

## 2. Đạt (test bằng tài khoản Admin trong Chrome)
| Hạng mục | Kết quả |
|---|---|
| Tạo nháp Vi bằng, điền cột S-02, thêm tài liệu, tải scan PDF 3 trang | Đạt |
| Ghi tên THV: hồ sơ chuyển "Chờ THV xác nhận", chưa ghi sổ được khi THV chưa xác nhận | Đúng luật |
| Ghi sổ hồ sơ không ghi tên THV (Vi bằng 02) | Đạt, hiện ngày ghi sổ, khóa sửa trực tiếp |
| Nạp và ghi sổ Tống đạt, Xác minh, Tổ chức THA, 3 sổ Văn thư (mỗi loại 1 hồ sơ, 1 tài liệu, 1 scan) | Đạt, cả 6 ghi sổ thành công |
| Số tự động: S-02 STT 1; Văn bản đến "Số đến" 1 (có cột Ngày đến); Văn bản đi STT 1 | Đạt |
| Sửa đổi hồ sơ đã ghi sổ bằng Admin (kèm lý do, scan văn bản sửa đổi) | Áp dụng ngay, có "Lịch sử sửa đổi" |
| Báo cáo N-09/N-10 2026 | Hiển thị đúng bố cục Phụ lục III; Vi bằng = 1, Xác minh = 1, Tống đạt tổng = 1 |
| Văn phòng phẩm: điều chỉnh lô có lý do, hoàn lại về 100 | Đạt; lý do ghi vào lịch sử; trường lý do là bắt buộc ở trình duyệt |
| OCR: PNG, PDF 1 trang tìm thấy sau khoảng 1 phút; PDF 3 trang tìm được cả trang 1 và trang 3 | Đạt, không thấy lỗi tải hay job treo |

## 3. Quan sát cần anh/chị quyết định
1. Hồ sơ không có tài liệu nào vẫn ghi sổ được (chỉ cảnh báo thiếu tài liệu/scan). Nếu muốn bắt buộc có tài liệu hoặc scan trước khi ghi sổ thì cần sửa.
2. Nút "Xác nhận lưu chính thức" dùng hộp thoại gốc của trình duyệt (window.confirm), khó test tự động và không đồng nhất với các modal khác. Đề xuất đổi sang modal trong trang.
3. Màn Vi bằng không có menu riêng cho từng nghiệp vụ trong sidebar (xem mục 5).
4. N-09: cột Tổ chức THA để trống dù đã có 1 hồ sơ Tổ chức ghi sổ; cần xác nhận quy tắc (chỉ tính việc đã tổ chức xong?).
5. Tìm kiếm toàn văn OCR chưa có ô tìm trên giao diện (chỉ gọi được qua API); Figma có ô tìm "số văn bản, tên người, trích yếu, nội dung".
6. Lý do điều chỉnh lô: mới thấy ràng buộc ở trình duyệt (trường required); chưa kiểm máy chủ có từ chối khi lý do trống.

## 4. Chưa test được (cần đăng nhập vai khác hoặc chờ thời gian)
- THV tự xác nhận hồ sơ Vi bằng 01 (cần đăng nhập thv@example.invalid hoặc tài khoản THV của anh/chị), rồi ghi sổ.
- Hủy nháp.
- Yêu cầu sửa đổi của người không phải Admin cần duyệt; tự duyệt sau 48 giờ.
- Nhóm quyền: ma trận từng vai (Thư ký, Văn thư, Kế toán, Trưởng VP) thấy/không thấy gì.
- Xuất CSV sổ S-01, S-04, S-05 và 3 sổ Văn thư (đã thấy bản xem trước S-02, VT-DEN, VT-DI đúng).
- OCR trên hồ sơ tống đạt PDF 2 trang (tệp đã tạo, chưa tải).
- Theo dõi bộ nhớ job lo-ocr (0,2 vCPU/512MB): chưa có công cụ xem log Northflank trong phiên này, nhưng 3 tệp đều xử lý xong.

## 5. So với Figma (canvas "DMS CANONICAL", đang ghi "CHỜ OWNER DUYỆT")
Đã so 3 màn chính; còn lại chưa so (khoảng 30 màn).

### Vi bằng · Danh sách (352:964): lệch nhiều
| Figma | Bản chạy |
|---|---|
| Tiêu đề "Vi bằng" | "Hồ sơ lưu trữ" chung cho 4 nghiệp vụ |
| 4 thẻ: hồ sơ chính thức 2026, tài liệu hiện hành, thiếu scan, sửa đổi chờ duyệt | 3 thẻ: hồ sơ, tài liệu, thiếu scan |
| Chip lọc: Chính thức, Chờ duyệt sửa đổi, Thiếu scan, Đủ scan, Nháp, Đã hủy | 3 tab: Chính thức, Nháp, Đã hủy |
| Nút "Xuất S-02" và "+ Tạo hồ sơ" (có trang riêng A1) | Form tạo nháp (tên hồ sơ, ghi chú) nằm ngay trên danh sách |
| Bảng 7 cột S-02 + Tài liệu·Bản scan + Xem·Tải | Bảng 4 cột: hồ sơ, ngày tạo, ghi sổ, tài liệu·bản scan |
| Tìm kiếm và 5 bộ lọc, phân trang | Không có |
| STT và mã hồ sơ (VB-2610-0042) | Không hiện STT, không có mã hồ sơ dạng này |
| Sidebar nhóm "Nghiệp vụ": Vi bằng, Tống đạt, Xác minh, Tổ chức, Văn thư, Xuất sổ, Vật tư, Báo cáo; "Hồ sơ của tôi" | Một mục "Hồ sơ lưu trữ", các nghiệp vụ nằm trong trang |

### Chi tiết hồ sơ (352:2613): lệch
- Figma: tiêu đề mã hồ sơ, thanh cảnh báo yêu cầu sửa đổi chờ duyệt, 6 tab (Thông tin chung, Tài liệu, Tệp đính kèm, Phiên bản cũ, Yêu cầu sửa đổi, Sổ liên quan), danh sách tài liệu nhóm theo loại có Xem/Tải, ô xem trước PDF, nút Tải bản scan chính / In / Tạo yêu cầu sửa đổi.
- Bản chạy: một trang dài gồm hành động ghi sổ, THV, form nội dung S-02, form thêm tài liệu, danh sách tài liệu, form sửa đổi, lịch sử; không có tab, không có xem trước PDF, không có nút In.

### Văn thư · Văn bản đến (352:2024): lệch
- Figma: tab Văn bản đến/đi/nội bộ, chip Chính thức(n)/Nháp/Đã hủy, ô tìm, lọc năm, "Xuất Excel", "Xuất PDF để in", "+ Thêm bản ghi", bảng đủ cột (Ngày đến, Số đến, Cơ quan ban hành, Số ký hiệu, Ngày tháng văn bản, Trích yếu, Đơn vị/người nhận, Ký nhận, Ghi chú, Scan, Xem/Tải).
- Bản chạy: 3 tab trạng thái, form tạo nháp (loại và trích yếu, ghi chú), liên kết "Xem trước và xuất sổ", 3 thẻ số, bảng 4 cột; không có "Số đến" trong danh sách, không có nút xuất Excel/PDF.

### Kết luận Figma
Phần nghiệp vụ lõi chạy đúng, nhưng giao diện chưa theo canvas: sidebar theo nghiệp vụ, danh sách đủ cột/lọc/phân trang, trang tạo hồ sơ riêng, chi tiết có tab và xem trước. Đây là khối việc lớn (đề xuất chia 3 PR: sidebar và danh sách, chi tiết hồ sơ, Văn thư). Canvas vẫn ghi "CHỜ OWNER DUYỆT" nên cần anh/chị xác nhận canvas là bản chuẩn trước khi làm.

## 6. Đề xuất bước tiếp (chờ anh/chị đồng ý)
1. Đăng nhập THV và các vai khác để hoàn tất mục 4.
2. Làm các sửa nhỏ: 3.1, 3.2, 3.4, 3.5, 3.6.
3. Làm các chỗ lệch Figma theo 3 PR nêu trên.
