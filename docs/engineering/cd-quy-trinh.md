# Quy trình CD (triển khai) của Legal Office

CD = đưa bản mới lên server. Ở repo này CD **luôn do người bấm**, không tự chạy khi merge. Lý do: chỉ chạy 1 bản API, migration chạy thẳng vào dữ liệu thật, server nhỏ.

## Hai server
| | **dev** | **production** |
|---|---|---|
| Máy | Tencent Lighthouse 2vCPU/2GB (Singapore) | Mắt Bão, ổ 100GB, 2vCPU/6GB (máy `lo_product_2`) |
| User SSH, thư mục | `dev`, `/opt/legal-office` | `deploy`, `/opt/legal-office` (**chưa kiểm**, xem checklist) |
| Dữ liệu | giả, dùng để thử | dữ liệu khách thật |
| Kho tệp (`.env`) | `FILE_STORE=local` đã thử thật; có thể về `r2` | `FILE_STORE=local` |
| Thư mục tệp | `FILE_STORE_HOST_DIR` (mặc định `/srv/legal-office/files`) | như nhau, trên ổ 100GB |
| Bản sao tệp ngoài máy | tuỳ chọn (R2 nếu `FILE_STORE=r2`) | **không có** (quyết định của chủ dự án, xem `docs/handover/10-ban-luu-tep-tren-o-dia.md`) |
| Sao lưu DB | cron `backup.sh` lên R2 `lo-backup` | chỉ khi đặt `BACKUP_R2_*` |
| Tên miền / Caddy | `SITE_ADDRESS` theo máy (hiện `*.sslip.io`) | `SITE_ADDRESS` = tên miền của khách khi trỏ DNS xong |
| Duyệt trước khi chạy | không | **có**: Environment `production`, chỉ nhánh `main` |
| Khoá bất biến tài liệu cũ | `seal-legacy.sh` nếu ổ hỗ trợ `chattr` | `seal-legacy.sh` (cron root), chưa kiểm ổ Mắt Bão |

Phần khác nhau giữa hai máy **không nằm trong workflow**: nó nằm ở `/opt/legal-office/.env` và `/etc/caddy/Caddyfile` trên từng máy (cài một lần, workflow không ghi đè). Workflow chỉ chép thư mục `deploy/` (compose, script) rồi chạy `deploy.sh`, nên hai server dùng chung mã và chỉ khác `.env`. `deploy.sh` thấy `FILE_STORE=local` thì tự thêm `docker-compose.local-files.yml`.

Dev Northflank (dữ liệu giả, `www.nexagnet.com`) vẫn tự deploy từ `main`, ngoài workflow này.

## Các bước của workflow `deploy` (`.github/workflows/deploy.yml`)
Actions > deploy > Run workflow > nhánh `main` > chọn `dev` hoặc `production`.
1. **kiem-tra-ci-xanh**: 5 check bắt buộc của `ci` (`bootstrap-verify`, `bootstrap-safety`, `app-verify`, `audit`, `db-integration`) phải xanh trên **đúng commit** sắp deploy, không thì dừng. `e2e-smoke` không bắt buộc.
2. **build-push-deploy**: với `production` dừng chờ người duyệt. Sau đó: kiểm Environment có đủ 4 bí mật `DEPLOY_*` (thiếu thì dừng); build 3 image, đẩy GHCR; chép `deploy/` lên server; SSH chạy `deploy.sh <tag>`.
3. `deploy.sh` kéo image, khởi động, đợi `/health` của API và trang web trên máy (tối đa ~200 giây). Lỗi thì **tự chạy lại bản cũ**.
4. Nếu Environment có biến `HEALTH_URL`, workflow gọi thêm địa chỉ công khai từ bên ngoài (qua Caddy/HTTPS) để chắc rằng người dùng vào được.
5. **Summary** cuối run: server, commit, image, người bấm, kết quả, kiểm ngoài, cách quay lại.

Hai lần deploy cùng môi trường không chạy song song; dev và production độc lập.

## Quay lại bản cũ
Trên server: `/opt/legal-office/deploy/scripts/deploy.sh "$(cat /opt/legal-office/.previous-tag)"`. Migration đã áp không tự lùi (migration tương thích ngược). Với production cần người có quyền SSH; Claude không làm trên production khi chưa có lệnh của chủ dự án.

## Vì sao không tự chạy khi `ci` xanh
Mỗi lần deploy build lại và khởi động lại API; migration lỗi có thể chặn cả máy. Dev (Tencent) có thể thêm tự chạy sau (`workflow_run` của `ci`, riêng `dev`) nếu chủ dự án muốn; production luôn chạy tay và có người duyệt.

## Checklist chủ dự án tự làm trên GitHub (Claude không đổi settings/secrets)
- [ ] Settings > Environments > **production**: Required reviewers = chủ dự án; Deployment branches = chỉ `main`.
- [ ] Settings > Environments > **dev**: tạo (không cần bảo vệ).
- [ ] Mỗi Environment đặt **4 secret riêng**: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (khoá ed25519 riêng cho từng máy, chỉ dùng để deploy), `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan -t ed25519 <host>` rồi đối chiếu vân tay). dev: user `dev`; production: user `deploy`.
- [ ] Sau khi đã đặt ở hai Environment, **xoá bốn secret cũ ở cấp repo** để không chạy nhầm sang máy khác.
- [ ] (Tuỳ chọn) biến `HEALTH_URL` ở mỗi Environment, ví dụ `https://<tên miền>/api/health`. Địa chỉ này công khai, không phải bí mật.
- [ ] Không dán khoá hay IP vào chat/PR; repo này công khai.

## Checklist trên server production (một lần, trước lần deploy đầu)
Cần người có quyền trên máy; thread Claude không đụng `lo_product_2` khi chưa có lệnh của chủ dự án.
- [ ] User `deploy` trong nhóm `docker`, có `/opt/legal-office` ghi được, khoá công khai deploy trong `~deploy/.ssh/authorized_keys`.
- [ ] `/opt/legal-office/.env` (quyền 600) từ `deploy/env.example` với `FILE_STORE=local`, `WEB_ORIGIN`/`PUBLIC_WEB_URL`, `TENANT_ID`...
- [ ] Thư mục tệp: `sudo install -d -o 1000 -g 1000 -m 750 /srv/legal-office/files`.
- [ ] Caddy dùng `deploy/Caddyfile` (đường PUT tệp lớn đi thẳng API), `caddy validate` trước khi nạp.
- [ ] Cron root `seal-legacy.sh` nếu ổ hỗ trợ `chattr +i`.
- [ ] Tạo tenant và Admin đầu tiên (`docs/engineering/go-live-checklist.md`).
- [ ] Xác nhận thư mục `/opt/legal-office` và user `deploy` đúng như bảng trên; nếu khác phải sửa `deploy.sh`/workflow.

## Chưa kiểm chứng
Workflow chưa chạy thật cho `production` (chưa có secret, chưa deploy); chỉ kiểm cú pháp YAML. Đường dẫn `/opt/legal-office` và quyền Docker của user `deploy` trên Mắt Bão chưa kiểm.

## Liên quan
`deploy-tencent.md` (cài một lần trên Tencent), `docs/handover/10-ban-luu-tep-tren-o-dia.md` (bản lưu ổ đĩa), `northflank-deploy.md` (dev Northflank, một phần lỗi thời).
