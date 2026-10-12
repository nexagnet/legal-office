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
