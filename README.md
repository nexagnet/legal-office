# legal-office

Phần mềm quản lý văn phòng thừa hành viên, nhiều văn phòng (tenant) trên một hệ thống.

Công nghệ: TypeScript, NestJS (`apps/api`), Next.js + React (`apps/web`), PostgreSQL (SQL thuần, không ORM),
pnpm workspaces.

## Cấu trúc

- `apps/api`: API NestJS. Nghiệp vụ nằm trong hàm PostgreSQL; schema và migration ở `apps/api/drizzle/*.sql`
  (chạy theo thứ tự số). Mỗi truy vấn chạy trong một tenant (`app.tenant_id`) với row-level security.
- `apps/web`: giao diện Next.js. Nghiệp vụ hồ sơ nằm dưới `/dms`; quản trị dưới `/quan-tri`
  (Tài khoản, Nhóm quyền, Chi nhánh, Cài đặt văn phòng).
- `packages/shared`: kiểu dùng chung.
- `docs/`: tài liệu. `docs/product`, `docs/design`, `docs/architecture/misa-numbering.md` là tài liệu lịch sử
  của các đợt trước, không phản ánh đầy đủ quy tắc hiện hành; quy tắc hiện hành xem `docs/handoff`.

## Quy tắc chính hiện hành

- Quyền theo nhóm quyền (92 quyền: 7 nghiệp vụ x 6 hành động x 2 phạm vi, và 8 quyền đặc biệt). Nhóm "Admin" của
  hệ thống không xóa, không đổi tên, không đổi quyền; tài khoản vai Admin hoặc thuộc nhóm Admin không có quyền riêng.
- Người tạo hồ sơ luôn thấy hồ sơ mình tạo, kể cả ngoài chi nhánh được cấp.
- Tài khoản bắt buộc có mật khẩu (tối thiểu 12 ký tự); có thể thêm số CCCD. Đăng nhập bằng email hoặc số CCCD.
  Tài khoản mới hoặc vừa được Admin đặt lại mật khẩu phải đổi mật khẩu ngay lần đầu. Quên mật khẩu: nhận link đặt lại
  qua email (cần cấu hình email gửi thư ở Quản trị > Cài đặt văn phòng).

## Chạy thử

Cần Node 22 (`.nvmrc`) và pnpm 9.15.4 (`corepack enable`).

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

Bài kiểm thử tích hợp cần PostgreSQL: đặt `DATABASE_URL` rồi chạy `vitest run -c vitest.integration.config.ts` trong `apps/api`.

## Môi trường thật

Văn phòng thật là tenant mới; không chạy `tools/seed-demo` (dữ liệu mẫu, tài khoản DEMO) trên môi trường của khách.
`SCAN_PURGE_SCHEDULE` phải được bật thì bản scan đã xóa mới bị xóa hẳn sau 30 ngày như giao diện mô tả.
