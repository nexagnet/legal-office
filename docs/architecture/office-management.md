# Quản lý văn phòng — lát #14

Migration `apps/api/drizzle/0008_office.sql`. Dữ liệu giả lập. **Không có giá, giá vốn hay số tiền** (kể cả vật tư); không thay MISA; không tự phát hành biểu mẫu TT06; vật tư văn phòng tách hẳn khỏi tài sản THA (`as_*`). Quyền kiểm tra trong DB, mọi kết quả (cả tìm kiếm và đọc S-06) ghi `audit_log`.

## Công văn
`of_correspondence` (+ `of_attachments`, `of_corr_events` chỉ ghi thêm). Công văn **đến**: RECEIVED → HANDLED (cần kết quả xử lý, nơi lưu tuỳ chọn; người nhận xử lý hoặc Admin/Trưởng VP/Thư ký). Công văn **đi** tách ba việc: soạn (DRAFT, phải có `FINAL_DOCUMENT`) → trình (SUBMITTED) → phê duyệt nội bộ (APPROVED, Admin/Trưởng VP) → ký ban hành (ISSUED: người có `legal_signer`, ghi số/ký hiệu, ngày, phương thức và bằng chứng gửi). Phê duyệt nội bộ không thay chữ ký ban hành. Liên kết hồ sơ (`VIBANG`/`SERVICE`/`VERIFICATION`/`ENFORCEMENT`) phải cùng tenant và văn phòng.

## Sổ quyết định
`of_decisions` bất biến, số quyết định duy nhất theo văn phòng, người ký phải là Admin/Trưởng VP có `legal_signer`, có bản ký (khoá + SHA-256). Loại văn bản trùng mã hoặc tên biểu mẫu TT06 đã đăng ký bị từ chối (`AGENCY_ONLY_FORM`). Tìm kiếm theo số/từ khoá, loại, khoảng ngày, người ký, hồ sơ.

## Thư viện TT06
`of_tt06_forms` (Phụ lục I–IX, chỉ ghi thêm theo phiên bản): chỉ đăng ký siêu dữ liệu (Admin/Trưởng VP) và tải (mọi thành viên văn phòng, có audit). Chỉ có hai hàm `of_tt06_register` và `of_tt06_download`; test khoá điều này. Nguồn bản trắng hợp lệ do chủ sản phẩm cung cấp.

## Vật tư FIFO
`of_items`, `of_batches` (lô nhập theo chi nhánh = địa điểm), `of_movements` (chỉ ghi thêm). Xuất lấy lần lượt từ lô nhập sớm nhất còn hàng của (vật tư, địa điểm), mỗi lô một dòng nên giữ nguồn lô. Khoá hàng vật tư làm các lần xuất đồng thời tuần tự: không xuất vượt tồn, không âm (có thêm CHECK). Kiểm kê chỉ Admin/Trưởng VP, bắt buộc lý do.

## Nhân sự (nguồn S-06)
`of_personnel` mỗi lần lưu là một phiên bản mới (chỉ ghi thêm); `of_s06_book` lấy bản mới nhất. Cột theo mẫu TP-THV-S-06 TT08: họ tên, giới, chuyên môn, quyết định Thừa phát lại / Thừa hành viên (số, ngày), Trưởng VP / Hợp danh, hợp đồng lao động, bảo hiểm và đóng, ghi chú. Chỉ lưu **tình trạng + ghi chú** cho bảo hiểm, không số tiền. Đọc chỉ Admin/Trưởng VP.

## Sổ theo dõi S-01, S-02, S-04, S-05 (đọc)
Migration `0030_office_ledgers.sql`; HTTP `GET /office/ledgers/{s-01|s-02|s-04|s-05}?officeId=&year=&limit=`. Trả `columns` (đúng số cột và thứ tự mẫu Phụ lục I TT 08/2026/TT-BTP: 10/7/11/13) và `rows` dựng từ dữ liệu đã có, kèm cột truy vết về hồ sơ gốc. Đây là bản điện tử hỗ trợ theo dõi, **không phải biểu mẫu chính thức**. S-03 là của Sở Tư pháp (không có), S-06 đọc qua `personnel`.
Quyền: Admin, Trưởng VP, Thư ký, Thừa hành viên xem cả văn phòng; Văn thư theo chi nhánh được cấp; Kế toán không xem. Mọi lần đọc ghi `audit_log` (`of.ledger.sNN.read`). STT đánh theo thứ tự thời gian trong phạm vi người đọc được xem.
Cột chưa có nguồn dữ liệu trả `null` (không suy đoán): S-01 loại văn bản, số/ngày văn bản, ba cột cơ quan giao; S-02 (địa chỉ nơi lập nay lấy từ `place_address`, migration 0043); S-04 hợp đồng dịch vụ, quyết định THA, bản án, người yêu cầu/phải THA, nội dung xác minh, ghi chú; S-05 cột 3, sửa đổi/bổ sung và thu hồi quyết định, ghi chú.
Cột "Thừa hành viên" của cả bốn sổ được điền ở tầng API từ `of_thv_cards` (migration 0046): Admin nhập họ tên + số Thẻ qua `PUT /office/thv-cards` (`GET` cho thành viên văn phòng); THV chưa có thẻ thì giữ `null`.

## HTTP (`/office`)
`POST|GET correspondence`, `POST correspondence/:id/{attachments,result,submission,approval,issuance}`, `POST|GET decisions`, `POST tt06-forms`, `POST tt06-forms/:code/download`, `POST items`, `POST items/:id/{receipts,issues}`, `POST batches/:id/adjustment`, `PUT|GET personnel`, `GET ledgers/:code`.

## Giả định chưa được chủ sản phẩm xác nhận
- Ai được ghi công văn/quyết định (Admin, Trưởng VP, Thư ký, Văn thư theo chi nhánh); THV chỉ đọc công văn mình xử lý và không đọc sổ quyết định.
- Số công văn đi do Văn phòng nhập khi ban hành (chưa có quy tắc cấp số tự động).
- Người ký quyết định/công văn đi = `legal_signer` Admin/Trưởng VP; phạm vi ký theo từng loại văn bản chưa chốt.
- Danh mục loại văn bản là văn bản tự do; kiểm tra "chỉ dành cho cơ quan nhà nước" mới dựa trên mã/tên biểu mẫu TT06 đã đăng ký.
- Cột S-06 chi tiết (đặc biệt phần bảo hiểm) cần đối chiếu mẫu in chính thức.
- Kho tệp thật và xác thực thật thuộc #5.
