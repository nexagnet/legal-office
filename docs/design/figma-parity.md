# Đối chiếu giao diện với Figma (nguồn chuẩn UX)

Figma Full UX: https://www.figma.com/design/bueSNVniMoYD6lQFHwqeHz/Nexagnet-Vi-bang-Quan-ly-Van-phong-Hai-Ba-Trung-Full-UX
`fileKey = bueSNVniMoYD6lQFHwqeHz`. Giao diện phải khớp Figma; **CI xanh không chứng minh giao diện đúng.**

## Cách đọc Figma (bẫy đã gây sai lệch)

- `get_metadata` **không có nodeId** chỉ liệt kê trang `92:2` (bìa + hướng dẫn) và dễ khiến kết luận sai
  "Figma không có khung màn hình". Các màn nằm ở trang khác: gọi `get_metadata` với `nodeId=0:1`
  (trang "01 — VI BẰNG & TỔNG QUAN", 28 khung) rồi `get_design_context` / `get_screenshot` trên từng node.
- Trang tống đạt / xác minh / tổ chức THA: tìm bằng tên khung trong hướng dẫn `92:33`; nếu chưa thấy node, ghi
  "chưa tìm được node" vào PR, **không** tự suy diễn bố cục.
- Nếu môi trường không có công cụ Figma, dùng đặc tả bên dưới và ghi rõ trong PR là chưa đối chiếu ảnh.

## Bản đồ màn hình -> node (trang 0:1)

| # | Màn | Node | # | Màn | Node |
|---|---|---|---|---|---|
| 00 | Tổng quan toàn văn phòng | 56:2 | 15 | Nhân sự và phân quyền | 3:366 |
| 01 | Tổng quan Vi bằng | 3:2 | 16 | Cấu hình văn phòng | 3:392 |
| 02 | Danh sách hồ sơ Vi bằng | 3:28 | 17 | Admin phân công THV | 16:2 |
| 03 | Tạo hồ sơ Vi bằng | 3:54 | 18 | Duyệt sửa hồ sơ sau 48h | 16:64 |
| 04 | Chi tiết và tiến độ | 3:80 | 19 | Hợp đồng N-03 | 16:126 |
| 05 | Xác nhận MISA và cấp số | 3:106 | 20 | Biên soạn N-04 | 16:188 |
| 06 | Ký, đóng dấu, bản scan | 3:132 | 21 | Tài liệu và chứng cứ | 16:250 |
| 07 | Trả kết quả, liên hệ khách | 3:158 | 22 | Xử lý MISA xác nhận sai | 19:2 |
| 08 | Khách hàng và hợp đồng | 3:184 | 23 | Sửa lỗi kỹ thuật N-11 | 19:64 |
| 09 | Sổ Vi bằng S-02 | 3:210 | 24 | Cấp bản sao Vi bằng | 19:126 |
| 10 | Theo dõi cập nhật CSDL/Sở | 3:236 | 25 | Cập nhật CSDL và Sở | 19:188 |
| 11 | Thư viện biểu mẫu | 3:262 | 26 | Sổ văn thư và quyết định | 19:250 |
| 12 | Công văn đi/đến | 3:288 | 27 | Bằng chứng bàn giao | 19:312 |
| 13 | Kho vật tư văn phòng | 3:314 | 28 | Phạm vi quyền theo vai trò | 19:374 |
| 14 | Báo cáo quản trị | 3:340 | | | |

Khung 1440x920 (desktop). Chưa có khung mobile; giữ responsive hiện có (thu sidebar thành menu dưới 900px).

## Token đo từ Figma (khung 3:2, 3:28)

- Chữ: **Inter** (Regular 400 / SemiBold 600). Hiện code dùng `system-ui` -> sai.
- Nền trang `#f3f6fa`; bề mặt `#ffffff`; mực `#1f2a3d`; chữ phụ `#64748b`; nhấn/nút `#2563eb` (chữ trắng).
- Sidebar rộng **248px**, cao suốt màn hình, nền `#10243a`; mục chọn `#1d3852` (bo 7, cao 39); chữ mục `#c9d8e5` 12px,
  mục chọn trắng SemiBold; nhãn nhóm `#89a2ba` 10px "KHÔNG GIAN LÀM VIỆC"; chân sidebar thẻ hồ sơ người dùng
  `#1d3852` bo 10, cao 62 (avatar "NV" + tên + "Xem quyền theo tài khoản").
- Khung logo chờ: nền `#19334e`, viền đứt `#69839b`, bo 7, cao 49.
- Header trắng cao **92px** bên phải sidebar: tiêu đề 23px SemiBold, mô tả 12px `#64748b`, bên phải bộ lọc
  "Tất cả chi nhánh ▾" (nền `#f3f6fa`, bo 8, 196x38).
- Vùng nội dung lề trái/phải 36px; thẻ trắng bo 12; hàng bảng là **thẻ trắng riêng bo 8 cao 71, cách nhau 3px**,
  KHÔNG kẻ bảng truyền thống; đầu bảng nền `#eaf0f7` bo 7 cao 42, chữ 11px SemiBold `#64748b` HOA.
- Ô lọc: nền `#f3f6fa` bo 7 cao 42; nút chính `#2563eb` bo 8 cao 42, chữ 13px SemiBold trắng.
- Thẻ số liệu (3:2): thanh dọc màu bên trái (xanh `#2563eb`, lục, cam, đỏ), nhãn 12px, số lớn SemiBold, ghi chú nhỏ.
- Huy hiệu trạng thái: viên thuốc, "Cần xử lý" nền vàng nhạt chữ nâu; "Sẵn sàng" nền lục nhạt chữ lục đậm.
- Chân trang mờ 10px: "BẢN ĐỀ XUẤT GIAO DIỆN · DUYỆT VỚI KHÁCH · DỮ LIỆU GIẢ LẬP" (chỉ mockup; **không** đưa vào bản chạy thật).
- Thứ tự menu: Tổng quan, Vi bằng, Tống đạt, Xác minh điều kiện THA, Tổ chức thi hành án, Khách hàng & hợp đồng,
  Sổ sách, Thư viện biểu mẫu, Công văn đi / đến, Vật tư văn phòng, Báo cáo, Nhân sự & chi nhánh, Cài đặt.
- Dữ liệu trong Figma là giả lập; chỉ chép **bố cục/kiểu**, không chép số liệu.

## Quy tắc cho PR giao diện

1. PR ghi mã node Figma của từng màn đã làm và ảnh chụp bản chạy (1440px) cạnh ảnh Figma.
2. Phần khác Figma phải liệt kê và nêu lý do (vd quyền truy cập, trạng thái lỗi/rỗng mà Figma chưa có).
3. Reviewer duyệt bằng đối chiếu hình, không chỉ test/CI.
4. Giữ nguyên hành vi, quyền, trạng thái trung thực, bàn phím/focus, tương phản (đã có trong test hiện hành).
