# Vi bằng: sửa nội bộ 48 giờ, đề nghị thay đổi, huỷ hồ sơ (lát #6)

Migration `0012_vibang_edit_cancel.sql`; API trong `vibang-intake.controller.ts`. Dữ liệu giả lập, không số tiền.

| Thao tác | Route | Ai | Điều kiện |
|---|---|---|---|
| Sửa trực tiếp | `PUT /vibang/cases/:id/details` | Admin, Trưởng VP, Thư ký, Văn thư (có quyền chi nhánh), THV phụ trách | Trong 48 giờ liên tục kể từ lúc tạo; hồ sơ chưa trả/huỷ |
| Đề nghị thay đổi | `POST /vibang/cases/:id/change-requests` | Cùng nhóm trên | Sau 48 giờ (trước đó: `EDIT_WINDOW_OPEN`); có lý do; trường `title`/`description` |
| Duyệt/từ chối | `POST /vibang/change-requests/:id/decision` | Chỉ Admin | Đề nghị còn `PENDING`; duyệt thì áp dụng và tăng version |
| Xem đề nghị | `GET /vibang/cases/:id/change-requests` | Người được xem hồ sơ | |
| Huỷ hồ sơ | `POST /vibang/cases/:id/cancellation` | Chỉ Admin | Có lý do; chỉ từ `INTAKE`/`ASSIGNED` |

Mọi kết quả (kể cả từ chối) được ghi audit trong DB.

## Giả định cần chủ sở hữu xác nhận
- Chỉ sửa được `title` và `description`; không phải quyền sửa nội dung Vi bằng đã ký/đóng dấu (N-11).
- Huỷ chỉ Admin và chỉ trước mọi hành vi pháp lý; yêu cầu không hợp lệ bị từ chối được ghi bằng huỷ hồ sơ kèm lý do.
- Mốc 48 giờ tính từ `created_at` của hồ sơ, liên tục kể cả cuối tuần.

## Mở rộng sang thông tin khách (migration 0056)

Đề nghị thay đổi nay còn áp dụng cho thông tin khách trong danh bạ: `customer_name`, `customer_phone`, `customer_id_number` (CCCD/định danh, chỉ cá nhân), `customer_address`, `customer_tax_code` và `customer_representative` (chỉ tổ chức), bên cạnh `title`, `description`. Đề nghị vẫn gắn một hồ sơ cụ thể, lưu giá trị cũ/mới (`before`/`after`), lý do, người đề nghị, Admin duyệt, mọi kết quả có audit.

Giả định cần chủ sở hữu xác nhận:
- Duyệt đề nghị trường khách ghi vào danh bạ `customers`, nên ảnh hưởng mọi hồ sơ/hợp đồng của khách đó; số Vi bằng đã cấp không đổi. Bản Vi bằng đã ký/đóng dấu có sai thông tin thì xử lý theo N-11, không qua đề nghị này.
- Danh bạ khách "bị khoá" khi khách có hồ sơ chưa huỷ mà đã quá 48 giờ, đã qua bước phân công (không còn INTAKE/ASSIGNED) hoặc đã cấp số. Khi khoá, sửa trực tiếp (`POST /vibang/customers/:id/profile`) trả `CUSTOMER_LOCKED` (409); khi chưa khoá vẫn sửa trực tiếp như cũ (khách mới, chưa có hồ sơ).
- Trường khách được đề nghị khi hồ sơ đã quá 48 giờ, hoặc ngay khi danh bạ đã khoá; trường khách của khách chưa khoá và hồ sơ còn trong 48 giờ trả `EDIT_WINDOW_OPEN`. Trường hồ sơ (`title`/`description`) giữ nguyên quy tắc 48 giờ.
- Giá trị mới trùng giá trị hiện tại trả `NOTHING_TO_CHANGE`; có thể để trống để xoá giá trị tuỳ chọn (trừ tên). Chưa che số CCCD khi hiển thị vì người xem đề nghị đã thuộc nhóm được xem hồ sơ; có thể thêm sau.
- Chưa cảnh báo số hồ sơ khác bị ảnh hưởng khi duyệt (ghi trong ô chọn trường rằng áp dụng cho danh bạ khách).
