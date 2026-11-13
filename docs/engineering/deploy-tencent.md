# Triển khai production trên Tencent Lighthouse (2 vCPU / 2GB / 40GB)

Máy: Ubuntu 22.04, Postgres 17 (apt, chỉ `127.0.0.1`), Docker, Caddy. Web và API chạy trong Docker (mạng host, bind localhost, ufw chặn 3000/3001), Caddy làm điểm vào HTTPS. Số đo thật trên máy này (30k và 150k hồ sơ giả) ở `reports/phuong-an-tencent-lighthouse-2gb-2026-11-12.md` (mục 13-14).

## Thành phần trong repo
| Tệp | Việc |
|---|---|
| `deploy/docker-compose.yml` | api + web, giới hạn RAM (256MB/384MB), log xoay vòng, health check. Bí mật lấy từ `.env`, không có trong repo. |
| `deploy/Caddyfile` | Reverse proxy + HTTPS tự động. `SITE_ADDRESS=:80` trước khi có DNS. |
| `deploy/env.example` | Mẫu `/opt/legal-office/.env` (quyền 600). |
| `deploy/scripts/deploy.sh` | Kéo image theo tag, cập nhật, kiểm `/health`, tự quay lại bản cũ nếu lỗi, làm nóng cache. |
| `deploy/scripts/backup.sh` | `pg_dump | zstd | rclone` lên bucket R2 `lo-backup` (token riêng). |
| `deploy/scripts/restore-test.sh` | Diễn tập khôi phục vào database tạm, đối chiếu số hàng. |
| `deploy/scripts/warmup.sh` | Làm nóng cache sau reboot (truy vấn đầu sau reboot ~2 giây). |
| `deploy/scripts/monitor.sh` | Cron 5 phút: ổ đĩa >75%, RAM available <150MB, swap, `/health`, Postgres, backup quá 26 giờ. |
| `.github/workflows/deploy.yml` | Chạy tay (`workflow_dispatch`): build api/web, đẩy GHCR, SSH cập nhật. |

## Bí mật GitHub (chủ dự án đặt)
`DEPLOY_HOST` (IP/hostname), `DEPLOY_USER` (`dev`), `DEPLOY_SSH_KEY` (khoá riêng ed25519 chỉ dùng cho deploy; khoá công khai thêm vào `~dev/.ssh/authorized_keys`), `DEPLOY_KNOWN_HOSTS` (kết quả `ssh-keyscan -t ed25519 <host>` đã đối chiếu vân tay).

## Cài một lần trên server
1. `sudo apt-get install -y zstd rclone`; `sudo mkdir -p /var/log/legal-office && sudo chown dev:dev /var/log/legal-office`.
2. Cài `deploy/Caddyfile` vào `/etc/caddy/Caddyfile`, đặt `SITE_ADDRESS`, `sudo systemctl reload caddy`.
3. Cron của `dev`: `15 2 * * * /opt/legal-office/deploy/scripts/backup.sh >> /var/log/legal-office/backup.log 2>&1` và `*/5 * * * * /opt/legal-office/deploy/scripts/monitor.sh` và `@reboot sleep 60 && /opt/legal-office/deploy/scripts/warmup.sh`.
4. Tạo tenant và Admin đầu tiên bằng `bootstrap-tenant` (xem `docs/engineering/go-live-checklist.md`), đặt `TENANT_ID` vào `.env`.
5. Chạy workflow `deploy` từ nhánh `main`.

## Lưu ý vận hành
- Không build web trên server: build làm RAM còn ~93MB.
- Giữ API ở 1 bản (rate limit và lịch nhắc/dọn scan nằm trong bộ nhớ một tiến trình).
- OCR và dựng chỉ mục 200GB làm trên PC; nạp OCR hàng loạt vào bảng chưa `ANALYZE` khi trigger `dms_osi_ocr_trg` bật rất chậm, nên nạp theo lô hoặc tắt trigger rồi `dms_index_ensure`.
- Sau khởi động lại Postgres/reboot, đợi `warmup.sh` trước giờ làm việc.
