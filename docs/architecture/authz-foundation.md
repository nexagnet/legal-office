# Nền tảng phân quyền và audit (lát 1 của #5)

Trạng thái: **giả lập, chưa chốt nghiệp vụ**. Bảng vai→quyền ở `apps/api/src/authz/policy.ts` chỉ chứng minh cơ chế;
thẩm quyền pháp lý thực sự lấy từ #1, không suy ra từ đây hay từ Figma.

## Hợp đồng

`decide(actor, action, resource)` là hàm thuần, **fail-closed**, kiểm tra từ ranh giới ngoài vào trong:

| Thứ tự | Mã từ chối | Khi nào |
|---|---|---|
| 1 | `UNKNOWN_ACTION` | hành động không có trong danh sách |
| 2 | `TENANT_MISMATCH` | actor và tài nguyên khác tenant |
| 3 | `OFFICE_MISMATCH` | khác văn phòng |
| 4 | `ROLE_LACKS_PERMISSION` | vai không có quyền với hành động |
| 4 | `SIGNING_AUTHORITY_NOT_GRANTED` | `legal.sign` mà actor chưa có cấp phép ký riêng |
| 5 | `BRANCH_NOT_GRANTED` | chi nhánh chưa được cấp (trừ vai xem cả văn phòng) |

- Quyền ký pháp lý (`legal.sign`) **không thuộc vai nào**, kể cả Admin; chỉ có khi `legalSigner` được cấp riêng.
- Quyền sở hữu hồ sơ tách khỏi thẩm quyền ký; lát này chưa mô hình hoá hồ sơ.
- `authorize()` ghi một dòng audit cho mọi quyết định, kể cả từ chối. Ghi audit lỗi thì lỗi nổi lên.
- Audit chỉ chứa định danh và mã (tenant, actor, hành động, kết quả, lý do, văn phòng, chi nhánh); không PII.

## Tầng dữ liệu (`apps/api/drizzle/0000_foundation.sql`)

- Khoá ngoại kép `(id, tenant_id)`: không thể có chi nhánh/thành viên/cấp phép trỏ sang tenant khác.
- RLS `FORCE` trên mọi bảng, theo `current_setting('app.tenant_id')` đặt trong mỗi transaction; thiếu ngữ cảnh thì không thấy dòng nào.
- `audit_log` chặn UPDATE/DELETE/TRUNCATE bằng trigger.
- Migration chạy trong một transaction; thử rollback toàn bộ có trong bài test tích hợp.

## Chưa làm ở lát 1

Tham chiếu file/đối tượng (metadata, checksum, phiên bản), HTTP controller và guard Nest gọi `authorize`,
nối `AuditSink` vào `audit_log`, tải xuống có kiểm soát. Role runtime của ứng dụng phải không phải superuser.

## Chạy kiểm thử

- Đơn vị: `pnpm --filter @legal-office/api test`.
- Tích hợp (cần PostgreSQL tạm có quyền tạo database): `DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres pnpm --filter @legal-office/api test:integration`.
