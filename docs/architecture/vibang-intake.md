# Tiếp nhận hồ sơ Vi bằng (#6/#17)

Dữ liệu giả lập, không số tiền (MISA là sổ duy nhất). Quyền do hàm `vb_*` trong DB quyết định và audit.

| Việc                | Ai                                                                                                   | Ghi chú                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Tạo khách, hợp đồng | Admin, Trưởng VP, Thư ký, Văn thư, THV                                                               | khách/hợp đồng thuộc tenant                                        |
| Tạo hồ sơ (INTAKE)  | như trên; Văn thư theo chi nhánh được cấp                                                            | chưa có THV phụ trách                                              |
| Phân công / đổi THV | **chỉ Admin** của văn phòng                                                                          | đổi người phải có lý do; lịch sử `vibang_assignments` chỉ ghi thêm |
| Xem hồ sơ           | Admin/Trưởng VP/Thư ký: cả văn phòng; Văn thư/Kế toán: chi nhánh được cấp; THV: hồ sơ mình phụ trách | hồ sơ không được xem trả 404 (không lộ tồn tại)                    |

API: `POST /vibang/customers`, `POST /vibang/customers/:id/contracts`, `POST /vibang/cases`, `PUT /vibang/cases/:id/responsible-thv`, `GET /vibang/cases`, `GET /vibang/cases/:id`.

## Giả định chờ chủ dự án xác nhận

1. Trưởng VP xem được mọi hồ sơ của văn phòng nhưng không phân công THV (nghiệp vụ chỉ cho Admin).
2. THV tạo hồ sơ mới được ở mọi chi nhánh của văn phòng; chỉ xem lại hồ sơ mình phụ trách.
3. Chưa có: sửa nội bộ trong 48 giờ, đề nghị thay đổi sau 48 giờ, huỷ hồ sơ, từ chối yêu cầu không hợp lệ, người tham gia/địa điểm/thời gian dự kiến. Đây là lát tiếp theo.
4. Đọc danh sách/chi tiết chưa ghi audit đọc.

## Danh sách THV để giao hồ sơ (lát #7)

`GET /vibang/thv` (hàm `vb_list_thv`, migration 0013) trả THV của các văn phòng mà người gọi là Admin; người khác nhận danh sách rỗng để không lộ nhân sự. Nhãn hiển thị là email đăng nhập, hoặc mã tham chiếu nếu chưa có thông tin đăng nhập. Giao diện `/vi-bang/[id]` dùng danh sách này cho Admin giao hoặc đổi THV (đổi bắt buộc có lý do).

## Tiến trình hồ sơ (lát #8)

`GET /vibang/cases/:id/progress` (hàm `vb_case_progress`, migration 0014) trả trạng thái MISA, số Vi bằng, thời điểm ký/đóng dấu và có bản scan cuối hay chưa; chỉ trả cho người được xem hồ sơ (cùng phạm vi `vb_list_cases`), còn lại 404. Giao diện hiện các bước theo thứ tự MISA → cấp số → ký → đóng dấu → scan → trả khách; nút chỉ là gợi ý theo vai, quyền thật do DB kiểm. Tải bản scan cuối chưa có trên giao diện vì chưa có kho tệp (issue #5).
