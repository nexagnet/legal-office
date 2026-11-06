# Kiểm thử E2E Giai đoạn 5 trên dev (03/11/2026)

Môi trường: `dev.nexagnet.com`, bản đã gồm migration 0103–0108 và toàn bộ PR #365–#377 (đã kiểm: các route `activity`, `deleted-scans`, `submissions` và trường `returned` của báo cáo đều có). Chỉ dùng tài khoản thử và dữ liệu giả; không dùng dữ liệu khách thật. Kịch bản chạy qua API đăng nhập thật của dev, mỗi vai một phiên.

## Kết quả: 67/67 kiểm tra đạt

| Nhóm              | Đạt   | Nội dung đã kiểm                                                                                                                                                                                                                                                                                                    |
| ----------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phân vai          | 18/18 | 6 vai (Admin, Kế toán, Thư ký, THV, Trưởng VP, Văn thư) × 3 màn: Lịch sử hoạt động và Scan đã xóa chỉ Admin có dữ liệu, người khác rỗng; huy hiệu chờ duyệt chỉ Admin khác 0                                                                                                                                        |
| Hồ sơ             | 11/11 | SĐT sai dạng bị chặn; tạo nháp có SĐT; nháp chưa có số hồ sơ; chưa ghi sổ thì chưa tích "Đã trả" (409); ghi sổ cấp số `NNN/NĂM/VB-TPL`; tích "Đã trả" làm thẻ số tăng 1; tìm kiếm trả số hồ sơ, SĐT, cờ đã trả                                                                                                      |
| Sửa sau ghi sổ    | 6/6   | THV không sửa được (ADMIN_ONLY) nhưng vẫn tải thêm scan; Admin sửa thiếu lý do bị chặn, có lý do thì giá trị hiện hành đổi, số hồ sơ giữ nguyên, tab Phiên bản có bản gốc + 1 bản sửa kèm lý do                                                                                                                     |
| Xóa scan          | 12/12 | Chưa có quyền: 403; thiếu lý do: 400; Admin cấp riêng quyền xóa scan cho THV (kèm lý do) rồi thu hồi, THV xóa được khi có quyền và lại bị chặn sau thu hồi; file xóa biến khỏi danh sách, hồ sơ còn nguyên; tải thường 404; Admin thấy trong Scan đã xóa (còn ~30 ngày, đúng lý do) và tải được; THV không tải được |
| Trình / Duyệt     | 11/11 | THV và Văn thư đều gửi được; người gửi chỉ thấy bản của mình, Admin thấy cả hai, Kế toán không xem được bản của người khác; THV không duyệt được; từ chối thiếu lý do bị chặn; Admin từ chối/duyệt, không duyệt lại; chủ bản trình tải được scan                                                                    |
| Lịch sử hoạt động | 7/7   | Ghi lại tạo nháp, ghi sổ, đổi ô đã trả, Admin sửa, xóa scan; mỗi dòng có người làm; nhóm Trình / Duyệt có tạo và duyệt                                                                                                                                                                                              |
| Gỡ luồng cũ       | 1/1   | Gửi yêu cầu sửa đổi qua API trả 404                                                                                                                                                                                                                                                                                 |
| Sổ                | 1/1   | CSV sổ S-02 có hồ sơ thử nhưng không in SĐT                                                                                                                                                                                                                                                                         |

Giao diện (trình duyệt, phiên THV, 1440×900): danh sách Vi bằng hiện số hồ sơ `034/2026/VB-TPL`, cột SĐT khách hàng, ô Đã trả KQ đã tích, thẻ "Đã trả kết quả"; chi tiết hồ sơ có tiêu đề là số hồ sơ, dòng "Khách hàng · SĐT", thông báo "Chỉ Admin sửa nội dung", không còn tab Yêu cầu sửa đổi, THV không thấy nút Admin sửa; màn Trình / Duyệt hiện các bản trình giả ở đủ trạng thái; THV vào Scan đã xóa / Lịch sử hoạt động thấy "Chỉ Admin được xem mục này".

## Chưa kiểm được, và vì sao

- **Dọn kho sau 30 ngày trên dev:** job dọn mặc định tắt trên dev (cần `SCAN_PURGE_SCHEDULE=on`, `SCAN_PURGE_TENANT_IDS`, `FILE_STORE`) và không thể tua thời gian trên dev. Logic đã được kiểm bằng itest với PostgreSQL và kho tệp thật (#370: quá hạn, chạy lại, lỗi kho rồi thử lại, khóa lạ tenant, cô lập tenant). Cần bật rồi chờ đủ 30 ngày, hoặc thử riêng trên một bản sao.
- **Giao diện phía Admin (Scan đã xóa, Lịch sử hoạt động, hộp thoại Admin sửa, cảnh báo cấp quyền):** trình duyệt chỉ có phiên THV nên chưa chụp được; các màn này được kiểm bằng API ở trên và bằng test thành phần (#372, #374, #376).
- **Mobile 390 px, OCR cho scan của bản trình:** chưa làm (Giai đoạn 4 và câu mở).

## Phát hiện nhỏ

- Khi người không phải Admin gõ thẳng `/dms/lich-su` hoặc `/dms/scan-da-xoa`, tiêu đề trang và mục sáng ở thanh bên là "Hồ sơ của tôi" (vì hai mục này chỉ có trong thanh bên của Admin). Nội dung vẫn đúng ("Chỉ Admin được xem mục này"). Sửa gọn khi làm lại thanh bên ở Giai đoạn 4.

## Dữ liệu còn lại trên dev (đều là dữ liệu thử)

- 4 bản Trình / Duyệt giả `[seed-demo]` (2 chờ duyệt, 1 đã duyệt, 1 từ chối) do công cụ nạp tạo; hồ sơ nạp từ trước không bị nhân đôi.
- Do E2E tạo: 1 hồ sơ Vi bằng `[e2e-gd5] Vi bằng thử …` (đã ghi sổ, hồ sơ không bao giờ bị xóa), 2 bản Trình / Duyệt `[e2e-gd5]`, 1 file scan đã xóa (sẽ hết hạn sau 30 ngày), và lịch sử cấp rồi thu hồi quyền xóa scan của tài khoản THV (quyền đã trả về như cũ).
- Công cụ `tools/seed-demo` đã cập nhật: bỏ luồng yêu cầu sửa đổi, thêm SĐT giả, tích "Đã trả KQ" cho một phần tư hồ sơ chính thức, tạo bản Trình / Duyệt giả.
