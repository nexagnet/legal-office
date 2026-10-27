# Triển khai thử trên Northflank

Trạng thái: **đã deploy thử** (project `legal-office`, CLI context `legal-office`; không dùng context `bmsl`). Không dùng dữ liệu khách thật.

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

## Biến môi trường (bí mật đặt trong secret group `legal-office`, không vào repo)

- `lo-api`: `DATABASE_URL` (vai `legal_app`), `AUTH_MODE=password`, `WEB_ORIGIN` (origin công khai của web), `TRUST_PROXY=1`, `NODE_ENV=production`, `FILE_STORE=r2` + `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (bucket riêng tư, khóa chỉ cấp cho bucket này). Chưa có R2 thì thử tạm `FILE_STORE=local` + `FILE_STORE_DIR` trên volume (chỉ để thử).
- `lo-web`: `API_URL` (runtime, cho các trang phía máy chủ), `TENANT_ID`, `TENANT_NAME`.

## Kiểm tra sau deploy

`GET /health` của API trả `{"status":"ok"}`; mở web, đăng nhập Admin thử; kiểm tra RLS: vai `legal_app` không đọc được dòng khi chưa đặt `app.tenant_id`.

## Vận hành CD (build và deploy tự động)

- `lo-api` và `lo-web` là service *combined* (build từ `nexagnet/legal-office`, nhánh `main`) với **CI và CD bật**: mỗi lần push `main`, Northflank tự build rồi deploy. Xác nhận bằng `northflank get service deployment --projectId legal-office --serviceId lo-api` (trường `deployedSHA` phải trùng commit của `main`).
- `lo-migrate` là job thủ công dùng chính image của `lo-api`, nên luôn khớp commit với API. Chạy tay: `northflank start job run --projectId legal-office --jobId lo-migrate --input '{}'`. Xem kết quả: `northflank get job runs --projectId legal-office --jobId lo-migrate`.
- **Migration tự chạy:** đặt `runOnSourceChange` của `lo-migrate` thành `always` (`northflank update job settings --projectId legal-office --jobId lo-migrate --input '{"backoffLimit":0,"runOnSourceChange":"always"}'`). Khi image của `lo-api` đổi, job chạy lại; migrate idempotent nên lần không có migration mới chỉ là no-op.
- **Thứ tự:** migrate và deploy API được kích hoạt cùng lúc bởi một bản build, nên API mới có thể chạy vài chục giây trước migration. Vì vậy migration phải **cộng thêm** (thêm bảng/cột nullable), không đổi tên hoặc xóa cột trong cùng bản phát hành với code dùng nó (làm hai bước expand rồi contract).
- Kiểm tra sau mỗi lần deploy: `deployedSHA` của `lo-api` và `lo-web`, lần chạy gần nhất của `lo-migrate` là SUCCESS, và `/api/health` trả `{"status":"ok"}`.
- Không đổi secret, không xóa dịch vụ khi vận hành thường ngày.
