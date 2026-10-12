# ADR-0002: Chọn ORM — Drizzle

- Trạng thái: **Đề xuất, chờ merge PR** (issue #4, R1)
- Ngày: 12/10/2026
- Phạm vi: **chỉ ORM**. Các thư viện còn lại của issue #4 xem mục "Chưa chốt".

## Bối cảnh

Legal Office là modular monolith đa tenant trên PostgreSQL. Ba nhu cầu quyết định: cấp số hồ sơ theo năm
không trùng/không hổng dưới tải song song; ghi kết quả nghĩa vụ và audit trong cùng một transaction;
cô lập tenant bằng Row-Level Security (RLS). Mã được viết bởi Builder (agent) không có shell, nên bước
sinh mã bắt buộc (codegen) là chi phí thật.

## Bằng chứng

Spike tái lập được tại `docs/architecture/spikes/adr-0002-orm/` (bảng kết quả trong README ở đó).
Về tính đúng đắn hai ORM **ngang nhau**: số liền mạch dưới 100 giao dịch song song có 20 rollback,
audit nguyên tử, RLS chặn đúng. Khác biệt nằm ở vận hành:

| Tiêu chí | Prisma 6.19 | Drizzle 0.45 |
|---|---|---|
| Codegen | cần `prisma generate`; kiểu chưa có thì code Builder viết không typecheck được | không có bước sinh mã, kiểu suy ra từ schema TS |
| Migration lỗi giữa chừng | khoá DB ở trạng thái failed tới khi resolve tay | không để lại trạng thái hỏng |
| SQL đặc thù (đánh số, RLS) | `$queryRaw` có tham số hoá | `sql` template có tham số hoá, nằm trong cùng transaction `tx` |
| RLS / policy | không mô hình hoá, SQL tay | SQL tay (đã dùng cách này để so công bằng) |
| Migration lùi | không | không |
| Giấy phép | Apache-2.0 | Apache-2.0 |
| Rủi ro phiên bản | nhánh chính đang chuyển sang v8 rc | pre-1.0 (0.x), API còn đổi |

## Quyết định

Dùng **Drizzle ORM** (+ drizzle-kit, driver `pg`). Lý do chính: không cần codegen nên phù hợp Builder không
có shell, migration lỗi không khoá DB, và những phần quan trọng nhất (số hồ sơ, RLS) vốn là SQL tay.

Quy ước kèm theo:

1. Migration chỉ đi tiến; thay đổi phá vỡ dùng expand/contract. Không dựa vào "rollback migration".
2. Cấp số hồ sơ bằng `INSERT … ON CONFLICT DO UPDATE … RETURNING` trong cùng transaction với nghiệp vụ.
3. Mỗi truy vấn của tenant chạy trong transaction có `set_config('app.tenant_id', …, true)`; role ứng dụng
   không phải superuser, bảng nhạy cảm `FORCE ROW LEVEL SECURITY`.
4. Ghim phiên bản chính xác (không `^`) vì Drizzle còn 0.x.

## Hệ quả và rủi ro

- Drizzle 0.x có thể có thay đổi phá vỡ; giảm bằng pin + CI. Nếu về sau cần đổi, phạm vi bị chặn trong lớp truy cập dữ liệu của từng module.
- Chưa đo hiệu năng; spike chỉ chứng minh tính đúng đắn (một lần chạy, ~135 ms cho 100 giao dịch).
- Chưa đo trên PostgreSQL 17 (CI dự kiến dùng 17.6); spike chạy trên 16.

## Chưa chốt (NOT_PROVEN — tách issue riêng)

Policy guard Nest vs CASL, React Hook Form + Zod, TanStack Query, pg-boss; Docxtemplater (MIT cho lõi,
module trả phí cần xác minh riêng), Gotenberg và mẫu TT08 chính thức. Docker daemon không có trong môi
trường chạy spike nên **Gotenberg và chất lượng DOCX/PDF chưa được chứng minh**, không khẳng định độ chính xác pháp lý.
Giấy phép `npm view` (12/10/2026): docxtemplater, pg-boss, @casl/ability, react-hook-form, zod, @tanstack/react-query đều MIT.
