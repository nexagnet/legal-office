# Rà soát lệch giao diện so với Figma N0 và đề xuất vẽ lại Tống đạt (2026-10-28)

Trạng thái: **chờ chủ dự án chốt trong Figma, chưa code UI.**

Figma: https://www.figma.com/design/bueSNVniMoYD6lQFHwqeHz/Nexagnet-Vi-bang-Quan-ly-Van-phong-Hai-Ba-Trung-Full-UX
Trang mới: **N15 — TỐNG ĐẠT · THIẾT KẾ LẠI THEO QUY TRÌNH (CHỜ CHỐT)** (node `278:2`).

## Phạm vi và giới hạn của bản rà soát này

- Đối chiếu dựa trên: ảnh chụp chủ dự án gửi (Việc của tôi, chi tiết Tống đạt, drawer Ký/đóng dấu/scan mobile), mã nguồn `apps/web`, Figma N0, N13, N3, M3, E10.
- **Chưa chụp được từng màn theo vai trên bản Northflank**: tab trình duyệt tự động bị treo và quy tắc an toàn không cho gõ mật khẩu tài khoản thử vào form đăng nhập. Cần chủ dự án đăng nhập sẵn các vai trên Chrome để hoàn tất bảng đối chiếu ảnh cạnh ảnh.
- Mức ưu tiên dưới đây là **giả thuyết từ mã và ảnh đã có**, cần xác nhận khi chụp đủ màn.

## Danh sách lệch (ưu tiên)

| # | Màn | Lệch so với Figma N0 | Ưu tiên |
|---|---|---|---|
| 1 | Chi tiết Tống đạt `/tong-dat/:id` | 3 biểu mẫu xếp liền trong một thẻ "Kết quả giao"; không có chỉ báo bước; thiếu địa chỉ, văn bản, lịch sử các lần; nút và ô chọn mặc định của trình duyệt | P0 |
| 2 | Drawer quy trình nhiều bước (Ký, đóng dấu, bản scan; các drawer tương tự ở Vi bằng) | Không có thẻ bao bọc, không đường nối hay số bước, chữ nhỏ và dày; không nhận ra là quy trình 3 bước | P0 |
| 3 | Việc của tôi (bộ lọc Tất cả / Tống đạt / Tổ chức THA / Vi bằng) | Nút mặc định kiểu trình duyệt, không theo dạng viên thuốc / segmented của N0 | P0 |
| 4 | Danh sách Tống đạt `/tong-dat` | Chỉ có link "Mở"; không có "việc tiếp theo", còn/quá hạn; thẻ số liệu và bảng chưa theo N3 | P1 |
| 5 | Phông chữ và cỡ chữ toàn app | Code dùng `Inter Variable`, nền 13px; N0 dùng Source Serif 4 (tiêu đề) + Be Vietnam Pro (nội dung) | P1 |
| 6 | Nút và ô nhập "trần" (`button:not([class])` trong `globals.css`) | Kiểu mặc định thay vì nút chính / phụ / nguy hiểm của N0 | P1 |
| 7 | Menu và tiêu đề trang Việc của tôi | So lại với N2 (mức chữ, banner, khoảng cách) | P2 |
| 8 | Xác minh, Tổ chức THA (chi tiết) | Cùng bố cục lỏng như Tống đạt; áp mẫu E11, E12 và stepper thẻ sau khi Tống đạt được chốt | P2 |

## Thiết kế đề xuất trong Figma (trang N15)

| Khung | Nội dung |
|---|---|
| T0 | Ghi chú: vì sao khó hiểu, cách giải quyết, các điểm cần chốt |
| T1 | Danh sách: lọc dạng viên thuốc, cột "Việc tiếp theo", hạn còn/quá hạn |
| T2 | Chi tiết đang xử lý: tiến trình 3 bước, một nút chính, lịch sử các lần |
| T3a/b/c | Ngăn kéo "Ghi nhận kết quả": Đã tống đạt (tải bằng chứng) / Chưa gặp, thử lại (chọn lý do) / Không tống đạt được (cảnh báo không hoàn tác) |
| T4, T5 | Trạng thái cuối chỉ đọc: Đã tống đạt (có bằng chứng), Không tống đạt được (có lý do) |
| T6 | Chưa giao người xử lý (Admin hoặc Trưởng VP chọn người, người khác chỉ thấy trạng thái chờ) |
| M1, M2, M3 | Mobile: danh sách, chi tiết bằng thẻ bước, ngăn dưới chọn kết quả |
| P1 | Mẫu dùng chung "Stepper dạng thẻ" áp cho drawer Ký, đóng dấu và bản scan |

Quy tắc mẫu stepper dạng thẻ: mỗi bước một thẻ có viền, số bước, vai thực hiện, chip trạng thái (Đã xong / Đang ở bước này / Chưa đến), có đường nối giữa các thẻ; chỉ **một nút chính** ở bước hiện tại; bước chưa đến bị mờ và không bấm được.

## Điểm cần chủ dự án chốt

1. Ba nhãn kết quả: "Đã tống đạt", "Chưa gặp, thử lại", "Không tống đạt được".
2. Danh sách hiện chưa trả địa chỉ và tên văn bản; cần thêm vào API để hiển thị trong thiết kế.
3. Ô ghi chú cho mỗi lần đi: cần xác nhận có cột lưu.
4. Giữ hay bỏ lý do "Lý do khác" (tập mã tối thiểu hiện có).
5. Quyền giao việc: UI chỉ cho Admin, nghiệp vụ nói Admin hoặc Trưởng VP.
6. Báo kết quả cho cơ quan trong 2 ngày làm việc: chưa vẽ vì số điều luật còn chờ đối chiếu (nghiep-vu-toan-du-an.md, mục 5).
