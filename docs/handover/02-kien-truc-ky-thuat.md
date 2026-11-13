# 02. Kiến trúc kỹ thuật, cách chạy, kiểm thử

## 1. Công nghệ và cấu trúc

- Monorepo **pnpm 9.15.4**, **Node 22** (`.nvmrc`), TypeScript. Modular monolith; không đổi framework/ORM (đã chốt).
- `apps/api`: **NestJS 11**, PostgreSQL **17**, **SQL thuần** (không ORM làm lớp nghiệp vụ; `drizzle-orm` chỉ phụ trợ). **Nghiệp vụ và quyền nằm trong hàm Postgres** (nhiều hàm `SECURITY DEFINER`); API mỏng. Mô-đun chính: `dms` (hồ sơ, sổ, tìm kiếm, tài liệu cũ), `auth`, `authz`, `admin`, `office`, `ocr`, `reminders`, `storage`, `mail`, `http` (hardening, giới hạn request), `db` (migration, kiểm thử tích hợp). Một số mô-đun cũ (`vibang`, `cases`, `enforcement`, `service-of-documents`, `verification`, `approval`, `assets`) thuộc quy trình trước ngày 30/10; dữ liệu và API còn, giao diện đã chuyển hướng sang `/dms`.
- `apps/web`: **Next.js 15**, React 19, Tailwind 4, Radix, TanStack Table, pdf.js, theme "Navy–Serif" (`theme-v2.css`). Nghiệp vụ hồ sơ ở `/dms`, quản trị ở `/quan-tri` (Tài khoản, Nhóm quyền, Chi nhánh, Cài đặt văn phòng). Trang chi tiết hồ sơ dùng chung cho 4 nghiệp vụ: `apps/web/app/dms/[domain]/[id]/page.tsx`.
- `packages/shared`: kiểu dùng chung. `tools/seed-demo`: dữ liệu mẫu (chỉ dev, **không chạy trên môi trường khách**). `scripts/`: kiểm an toàn tệp, đo độ trễ, bản dựng hướng dẫn. `deploy/`: cấu hình production (tệp 03). `apps/api/bench/dms-scale`: bộ sinh dữ liệu giả 30k–150k hồ sơ và đo tải.
- Công cụ nhập tài liệu cũ **`lo-import`** (Windows): đóng gói bằng `pnpm --filter api package:import` (`apps/api/package-lo-import`).
- Hai tiến trình nền ngoài API: **OCR** (`apps/api/src/ocr/ocr.cli.ts`, image Docker đích `ocr`, Tesseract 5 `vie` + poppler) và **migrate** (`dist/db/migrate.cli.js`).

## 2. Dữ liệu và bảo mật

- Mọi bảng có `tenant_id`; **RLS bắt buộc** (`app.tenant_id` đặt trên mỗi truy vấn); vai ứng dụng `legal_app` không phải superuser, không BYPASSRLS. Kiểm: vai `legal_app` không đọc được dòng khi chưa đặt tenant.
- Nhật ký (`dms_audit_records`) chỉ ghi thêm; bảng tài liệu cũ `dms_legacy_files` và dòng sổ đã ghi **bất biến** bằng trigger.
- Mô hình dữ liệu DMS (tên bảng chính): `dms_case_files`, `dms_documents`, `dms_document_versions`, `dms_book_entries` + `dms_book_counters`, `dms_audit_records`, yêu cầu sửa đổi, nhóm quyền (`dms_branch_access`...), `dms_ocr_results`, `dms_search_content`, `dms_case_index` (một dòng/hồ sơ, `search_text` bỏ dấu, có phiên bản chỉ mục), `dms_legacy_files`. Chi tiết: [handoff mục 3](../handoff/NGHIEP-VU-TOAN-DU-AN.md), [docs/engineering/dms-scale-search.md](../engineering/dms-scale-search.md).
- Kho tệp: **Cloudflare R2** (S3 API), `FILE_STORE=r2`; trình duyệt tải thẳng lên/xuống bằng URL ký sẵn (cần CORS bucket). `FILE_STORE=local` chỉ cho dev/test, **không** dùng cho khách thật. Khóa kiểm tra SHA-256 (`x-amz-checksum-sha256`).
- Giới hạn request theo IP (bộ đếm trong bộ nhớ, `apps/api/src/http/hardening.ts`): đọc 3000/phút, ghi 600, đăng nhập 20 (đặt được bằng `RATE_LIMIT_READ_PER_MIN`, `RATE_LIMIT_WRITE_PER_MIN`, `RATE_LIMIT_AUTH_PER_MIN`; PR #437). Vì bộ đếm và các lịch nền nằm trong bộ nhớ, **chỉ chạy 1 bản API**.
- Lịch nền (mặc định TẮT, phải bật bằng biến môi trường): `SCAN_PURGE_SCHEDULE=on` + `SCAN_PURGE_TENANT_IDS`; `REMINDERS_SCHEDULE=on` + `REMINDER_TENANT_IDS`.

## 3. Migration

- Tệp SQL đánh số ở `apps/api/drizzle/NNNN_*.sql`, chạy **theo thứ tự**, **mỗi tệp một transaction**, có khóa advisory để nhiều bản khởi động cùng lúc chỉ một bản chạy. API tự áp khi khởi động nếu có `MIGRATE_DATABASE_URL` (tài khoản chủ DB; biến này bị gỡ trước khi bật server nên API không cầm quyền chủ). Migration lỗi → bản mới không lên, bản cũ vẫn phục vụ.
- **Phải tương thích ngược** với bản API đang chạy (deploy kiểu rolling; rollback bằng tag cũ).
- Migration mới nhất trên `main` ngày 13/11/2026: **0126** (`0126_dms_business_filters.sql`). **Luôn kiểm `main` trước khi chọn số mới**: các luồng song song từng đụng số. Nếu đổi `dms_case_index_refresh` thì nâng phiên bản chỉ mục.
- Clone trên Windows phải đặt `core.autocrlf=false` (migration 0079 lỗi với CRLF).

## 4. Chạy và kiểm thử

```sh
corepack enable
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm format:check
```

- Kiểm thử tích hợp cần Postgres: đặt `DATABASE_URL` rồi `pnpm --filter api test:integration` (hoặc `vitest run -c vitest.integration.config.ts` trong `apps/api`). Tệp `*.itest.ts` nằm ở `apps/api/src/db`.
- `AUTH_MODE=password` là chế độ thật; `AUTH_MODE=synthetic-test` chỉ để đo/test và **bị từ chối khi `NODE_ENV=production`**.
- Bench hiệu năng: `apps/api/bench/dms-scale` (`generate.sql`, `bench.mjs`, `concurrent.mjs`). `scripts/measure-latency.mjs` đo độ trễ API.
- Biến môi trường bắt buộc của production: xem [docs/engineering/go-live-checklist.md](../engineering/go-live-checklist.md) và `deploy/env.example`.

## 5. CI và quy trình PR

- `.github/workflows/ci.yml`: `bootstrap-verify`, `bootstrap-safety` (`scripts/check-tracked-file-safety.mjs`: chặn commit `.env`, khóa, `.pem`...; **không phải** quét bí mật nội dung), `app-verify` (lint, typecheck, unit, build, `format:check`), `audit`, `db-integration` (kiểm thử tích hợp với Postgres). CI kiểm **đúng commit đầu PR** (exact-head). Các tệp trong `docs/` không bị prettier kiểm; `README.md` và `AGENTS.md` ở gốc thì có.
- Ruleset `main-protection`: nhánh phải mới nhất so với `main`; force-push bị chặn (đồng bộ bằng `merge origin/main`).
- `.github/workflows/deploy.yml` (chạy tay) build image, đẩy GHCR, SSH cập nhật server (tệp 03). Có thêm các workflow `claude-*-caller.yml` (Builder/Reviewer/Repair tự động, thuộc hệ thống phối hợp riêng; thay đổi `.github` là rủi ro R3, hỏi chủ dự án trước).
- GitHub GraphQL **không dùng được** từ phiên Claude; dùng REST (`gh api`) hoặc các route `…/pulls/{n}/ccr/…`.

## 6. Quy ước viết mã

- **Tìm thư viện có sẵn trước khi tự viết.** Giữ stack hiện tại.
- **Bảng không bao giờ bỏ cột**: dùng `DataTable` chung (cột đầu/hành động cố định, cắt chữ có hover, nút "Cột hiển thị" mặc định hiện đủ, chế độ gọn).
- Giao diện bám **Figma DMS v2** (file `bueSNVniMoYD6lQFHwqeHz`); trang chủ đề DMS: "01 · Vi bằng", "02 · Tống đạt", "03 · Xác minh", "04 · Tổ chức", "99 · Design system"; phông Be Vietnam Pro. Kiểm responsive ở 1440 / 1024 / 768 / 390. Menu hover không được làm xê dịch mục.
- Giao diện **tối giản**: bỏ chữ giải thích thừa, nút thừa, đoạn lặp tiêu đề (PR #422, #434, #439). Không dùng `window.confirm` (dùng modal trong trang).
- Không ghi dữ liệu cá nhân, nội dung hồ sơ, mật khẩu, token vào log.
- Mọi PR chạm giao diện nên có ảnh chụp trước/sau đối chiếu Figma.
