# AGENTS.md — đọc trước khi làm việc trong repo này

Legal Office là phần mềm quản lý hồ sơ và tài liệu cho văn phòng Thừa hành viên (Việt Nam), nhiều văn phòng trên một hệ thống. Chủ dự án nói tiếng Việt: **trả lời bằng tiếng Việt, ngắn, kết quả trước**.

## Đọc gì trước

1. [`docs/handover/README.md`](docs/handover/README.md): mục lục bàn giao (sản phẩm, kiến trúc, hạ tầng production, kế hoạch 200GB, quyết định đã chốt, việc dang dở, quy ước).
2. [`docs/handoff/NGHIEP-VU-TOAN-DU-AN.md`](docs/handoff/NGHIEP-VU-TOAN-DU-AN.md): nguồn nghiệp vụ chi tiết. Phần hạ tầng trong đó (Northflank) đã lỗi thời.
3. Các tài liệu trong `docs/product`, `docs/design`, `docs/architecture/misa-numbering.md`, Issue #1 và hướng dẫn PDF cũ mô tả quy trình **trước 30/10/2026**; không phải quy tắc hiện hành.

## Quy tắc không được phá

- Sản phẩm là **DMS** (lưu trữ, tra cứu, lọc hồ sơ), không phải phần mềm điều hành quy trình. Bốn nghiệp vụ: Vi bằng (S-02), Tống đạt (S-01), Xác minh THA (S-04), Tổ chức THA (S-05); Văn thư có 3 sổ.
- Hồ sơ/tài liệu/tệp đã lưu **bất biến**: không xóa, không ghi đè, không sửa trực tiếp, kể cả Admin. Đổi dữ liệu đã lưu = yêu cầu sửa đổi có scan văn bản và Admin duyệt.
- **Mục A của form hồ sơ chỉ chứa cột sổ S-0x**; tên, SĐT, ghi chú... sang mục C.
- 1 hồ sơ = 1 dòng sổ; số hồ sơ = STT của sổ (Tống đạt cũng vậy từ 13/11/2026). Hệ thống chỉ tự cấp "Số đến" và "STT"; không tự sinh số vi bằng, hợp đồng, quyết định.
- Quyền thực thi ở backend (hàm SQL, RLS theo tenant), mặc định từ chối. Thêm mã quyền mới phải vá CHECK constraint và các hàm liên quan (xem `docs/handover/01-san-pham-va-nghiep-vu.md`).
- Giao diện tối giản, bảng không bỏ cột (dùng `DataTable`), bám Figma DMS v2, bộ lọc theo nghiệp vụ là trung tâm, tìm kiếm để header lo. Tìm thư viện có sẵn trước khi tự viết.
- Dữ liệu dev là dữ liệu giả; dữ liệu khách thật không bao giờ vào repo, báo cáo, log. Không chạy `tools/seed-demo` trên production.

## Chạy, kiểm thử, migration

```sh
corepack enable && pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm format:check
# tích hợp (cần Postgres): DATABASE_URL=... pnpm --filter api test:integration
```

- Node 22, pnpm 9.15.4, NestJS (`apps/api`), Next.js 15 (`apps/web`), Postgres 17 SQL thuần.
- Migration: `apps/api/drizzle/NNNN_*.sql`, đánh số liên tiếp, tương thích ngược; mới nhất lúc viết là **0126**. **Kiểm `main` trước khi chọn số.**
- `docs/` không bị prettier kiểm; `README.md` và `AGENTS.md` thì có.

## Production (tóm tắt; chi tiết `docs/handover/03-ha-tang-production.md`)

- Tencent Lighthouse Singapore 2 vCPU/2GB, Postgres 17 (apt), Docker + Caddy, image build ở GitHub Actions rồi kéo từ GHCR; **CD chạy tay** (`.github/workflows/deploy.yml`); tệp trên Cloudflare R2 (Bucket Lock cho `legacy/`); sao lưu đêm lên bucket R2 riêng.
- **Không build trên server** (RAM thấp), **không OCR trên server**, chỉ chạy **1 bản API**.
- Repo này **công khai**: không ghi IP server, khóa, mật khẩu, token, nội dung `.env`, CCCD hay mã tenant của khách. Không dán bí mật vào chat.

## Làm việc với PR

- Chủ dự án cho phép tự merge PR của chính mình khi CI đúng head xanh và không còn review mở (squash). **Hỏi trước** với `.github`, hạ tầng, bí mật, deploy production, xóa dữ liệu/dịch vụ. Không force-push; đồng bộ bằng merge `origin/main`.
- GitHub: dùng REST (`gh api`), không GraphQL.
- Điều chưa chốt có ảnh hưởng pháp lý, tiền hoặc dữ liệu khách thì hỏi, không tự quyết. Ghi rõ điều suy đoán hoặc chưa kiểm.
- Việc còn dang dở và ai chịu trách nhiệm: `docs/handover/06-viec-dang-do.md`.
