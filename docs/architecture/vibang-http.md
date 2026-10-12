# Lớp HTTP cho các hàm Vi bằng (lát #5 tiếp theo)

Mỏng có chủ ý: controller chỉ kiểm tra đầu vào (zod, `strict`), gọi hàm `vibang_*` trong Postgres (0002/0003) trong một transaction có `app.tenant_id`, rồi đổi mã kết quả sang mã HTTP. **Quyền (vai, chi nhánh, THV phụ trách) do DB quyết định và audit**, không nằm ở controller.

| Endpoint | Hàm DB |
|---|---|
| `PUT /vibang/cases/:id/misa` | `vibang_record_misa` |
| `POST /vibang/cases/:id/misa/revoke-proposals`, `…/revoke-decisions` | `vibang_propose_revoke`, `vibang_decide_revoke` |
| `POST /vibang/cases/:id/number`, `POST /vibang/offices/:officeId/number-imports` | `vibang_allocate_number`, `vibang_import_last_number` |
| `POST /vibang/cases/:id/documents` | `vibang_add_document` |
| `POST /vibang/cases/:id/signature-confirmations`, `…/stamp-confirmations`, `…/return` | `vibang_confirm_signed`, `vibang_confirm_stamped`, `vibang_return_case` |
| `PUT /vibang/cases/:id/registration`, `POST …/contacts` | `vibang_set_registration`, `vibang_log_contact` |
| `POST /vibang/cases/:id/n11-corrections`, `POST /vibang/n11-corrections/:id/applications` | `vibang_propose_n11`, `vibang_apply_n11` |

Mã HTTP: 200 thành công · 400 đầu vào sai hình dạng · 401 chưa xác thực · 403 từ chối quyền · 404 không thấy (kể cả hồ sơ của tenant khác) · 409 sai trạng thái/thiếu bằng chứng · 422 dữ liệu sai giá trị. Thân phản hồi lỗi: `{ "code", "label" }`.

## Xác thực: CHƯA CHỐT (không suy diễn)

Cơ chế đăng nhập thật chưa được owner chốt. Mặc định `FailClosedResolver` từ chối mọi request (401). `AUTH_MODE=synthetic-test` bật `SyntheticHeaderResolver` (đọc `x-synthetic-user`/`x-synthetic-tenant`), **không có xác thực thật**, chỉ cho test/CI với dữ liệu giả lập và bị chặn khi `NODE_ENV=production`. Trước khi dùng thật cần quyết định cơ chế xác thực (cổng riêng) và rate limiting / security headers.

## Chưa làm

Endpoint tạo/gán/sửa hồ sơ và Change Request (lõi #6 mới là mô hình thuần, chưa có lớp lưu), kho tệp riêng tư thật, ghi `AuditSink` của miền #5 vào `audit_log`, xác thực thật, UI.
