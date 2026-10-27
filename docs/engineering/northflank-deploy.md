# Triển khai thử trên Northflank

Trạng thái: **đã deploy thử** (dựng lại 27/10/2026 trên team Northflank `phungviet2s-team`, project `legal-office`, chuyển sang gói free). Không dùng dữ liệu khách thật.

## Dựng lại ngày 27/10/2026 (ghi nhận thực tế)

- Tài khoản/CLI: context `legal-office` (team `phungviet2s-team`). Không dùng context của BMSL; nên dùng thư mục home riêng cho CLI để không đổi context chung.
- `lo-postgres`: addon Postgres 17, gói `nf-compute-20` (gói `nf-compute-10` bị từ chối vì addon Postgres cần tối thiểu 0.2 CPU), 4 GB.
- Secret group `lo-secrets` (bí mật, tạo mới): `ADMIN_DATABASE_URL`, `MIGRATE_DATABASE_URL`, `DATABASE_URL` (vai `legal_app`), `LEGAL_APP_PASSWORD`, `APP_DB_ROLE`, `MAIL_SETTINGS_KEY`. Secret group `lo-config` (không bí mật): `AUTH_MODE`, `WEB_ORIGIN`, `PUBLIC_WEB_URL`, `TRUST_PROXY`, `NODE_ENV`, `FILE_STORE=local`, `FILE_STORE_DIR=/data/files`, `TENANT_ID`, `TENANT_NAME`.
- `lo-api` và `lo-web`: service combined build từ GitHub nhánh `main` (Dockerfile target `api`/`web`, kaniko), CI/CD tự deploy khi push `main`. `lo-api` 1 instance, health `/health`; `lo-web` public, `API_URL=http://lo-api:3001`, web gọi API qua rewrite `/api/*`.
- Volume `lo-files` (nvme, tối thiểu 6 GB) gắn vào `lo-api` tại `/data/files`.
- Job `lo-migrate` (build riêng, lệnh tùy chỉnh) chỉ chạy một lần để tạo vai `legal_app` (`CREATE ROLE ... NOSUPERUSER NOBYPASSRLS`) rồi migrate; sau đó migration tự áp khi `lo-api` khởi động. Tenant/Admin thử được tạo bằng job tạm (đã xóa) dùng image của `lo-api` và `set-password.cli`.
- Cổng `northflank forward` trên Windows cần quyền Administrator; thay bằng job chạy trên Northflank.
- Kiểm tra: `GET <web>/api/health` trả `{"status":"ok"}`; `POST <web>/api/auth/login` với Admin thử trả 200 kèm cookie phiên. Mật khẩu Admin thử chỉ lưu ở file cục bộ của chủ dự án.

## Thành phần (project Northflank RIÊNG cho Legal Office, không chen vào `bmsl-website`)

| Thành phần | Loại | Ghi chú |
|---|---|---|
| `lo-postgres` | Addon Postgres 17 | **Riêng**, không dùng chung `bmsl-postgres` (RLS ép buộc, dữ liệu pháp lý) |
| `lo-migrate` | Job (Dockerfile target `api`) | Lệnh: `node dist/db/migrate.cli.js`, chạy bằng tài khoản chủ DB trước mỗi lần deploy API |
| `lo-api` | Service (target `api`, cổng 3001, health `GET /health`) | Kết nối bằng vai `legal_app` |
| `lo-web` | Service (target `web`, cổng 3000, public) | Build arg `API_URL` = địa chỉ nội bộ của `lo-api` |

Build: `docker build --target api -t lo-api .` và `docker build --target web --build-arg API_URL=http://lo-api:3001 -t lo-web .`

## Bước một lần

1. Tạo vai ứng dụng (không superuser, không BYPASSRLS) bằng tài khoản chủ: `CREATE ROLE legal_app LOGIN PASSWORD '<mật khẩu mới>';`
2. Chạy job `lo-migrate` với `DATABASE_URL` (chủ) và `APP_DB_ROLE=legal_app` (cấp quyền bảng/sequence cho vai đó).
3. Tạo tenant, văn phòng, người dùng Admin đầu tiên (dữ liệu thử), rồi đặt mật khẩu bằng `node dist/auth/set-password.cli.js` (xem `docs/architecture/auth-password.md`).

## Migration tự áp khi lo-api khởi động

Job `lo-migrate` không tự chạy khi có bản mới (Northflank CLI không lưu được `runOnSourceChange`). Thay vào đó `lo-api` tự áp migration chờ lúc khởi động, qua `apps/api/docker-entrypoint.sh`:

- Bật bằng secret `MIGRATE_DATABASE_URL` (chuỗi kết nối tài khoản chủ DB, cùng giá trị `DATABASE_URL` của `lo-migrate`) và tùy chọn `APP_DB_ROLE=legal_app` trên `lo-api`. Không đặt thì bỏ qua bước này (hành vi cũ, vẫn chạy `lo-migrate` tay).
- Migration chạy trong một tiến trình riêng; biến chủ DB bị gỡ trước khi bật server, nên API vẫn chạy bằng vai `legal_app` và tiến trình server không cầm quyền chủ. `DATABASE_URL` của `lo-api` vẫn là vai `legal_app`.
- An toàn: khóa advisory trong `migrate.cli` nên nhiều bản khởi động cùng lúc chỉ một bản chạy; mỗi file nằm trong một transaction (lỗi thì rollback). Migration lỗi làm bản mới thoát mã khác 0 và không qua health check, bản cũ vẫn phục vụ. Hãy giữ lo-api ở 1 instance.
- Quy ước: migration phải tương thích ngược với bản API đang chạy (chỉ thêm bảng/cột/hàm; xoá hoặc đổi tên làm theo hai bước) vì bản cũ còn chạy trong lúc bản mới migrate.
- Đặt biến này là việc chạm secret nên do chủ dự án làm một lần trong secret group `legal-office`.

## Biến môi trường (bí mật đặt trong secret group `legal-office`, không vào repo)

- `lo-api`: `DATABASE_URL` (vai `legal_app`), `AUTH_MODE=password`, `WEB_ORIGIN` (origin công khai của web), `TRUST_PROXY=1`, `NODE_ENV=production`, `FILE_STORE=r2` + `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (bucket riêng tư, khóa chỉ cấp cho bucket này). Chưa có R2 thì thử tạm `FILE_STORE=local` + `FILE_STORE_DIR` trên volume (chỉ để thử).
- `lo-web`: `API_URL` (runtime, cho các trang phía máy chủ), `TENANT_ID`, `TENANT_NAME`.

## Kiểm tra sau deploy

`GET /health` của API trả `{"status":"ok"}`; mở web, đăng nhập Admin thử; kiểm tra RLS: vai `legal_app` không đọc được dòng khi chưa đặt `app.tenant_id`.
