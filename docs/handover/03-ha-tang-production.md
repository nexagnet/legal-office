# 03. Hạ tầng production

Trạng thái ngày **13/11/2026**: server đã dựng và đo, cấu hình triển khai đã có trong repo (PR #437, #438), **chưa triển khai bản chạy thật** (thiếu token R2, GitHub Secrets, DNS, SMTP, tạo tenant). Chưa có dữ liệu khách thật.

> Repo công khai: tài liệu này không ghi IP server hay bí mật. Địa chỉ server do chủ dự án giữ (và là giá trị của secret `DEPLOY_HOST`).

## 1. Sơ đồ

```
Trình duyệt (Việt Nam)
   │ HTTPS
   ▼
Caddy (host, HTTPS tự động) ──► web (Next.js, Docker, 127.0.0.1:3000) ──► api (NestJS, Docker, 127.0.0.1:3001)
                                                                              │ Postgres 17 (apt, chỉ 127.0.0.1)
                                                                              │ URL ký sẵn
                                                                              ▼
                                                                  Cloudflare R2: bucket lo-files (tệp, Bucket Lock)
Cron trên server: pg_dump | zstd | rclone ──► R2 bucket lo-backup (token riêng)
PC của chủ dự án: lo-import, OCR hàng loạt, kéo bản sao về ổ ngoài
GitHub Actions: build image api/web ──► GHCR ──► SSH cập nhật server (chạy tay)
```

## 2. Server chính

- **Tencent Cloud Lighthouse, Singapore, 2 vCPU / 2GB RAM / 40GB SSD**, Ubuntu 22.04, AMD EPYC (KVM). Mua ngày 12/11/2026, giá năm đầu khoảng $10,08; giá năm 2 tham chiếu ~$50,40 (không cam kết, chưa xác minh chính thức).
- Cài sẵn: Postgres 17.11 (PGDG, `shared_buffers` 256MB, `effective_cache_size` 768MB, `work_mem` 4MB, `max_connections` 30, nghe `127.0.0.1`), Docker, Caddy, ufw; swap 2GB (swappiness 10). Role `legal_app` (không superuser, không BYPASSRLS) và vai chủ DB tách riêng.
- Người dùng vận hành `dev` (không dùng root); mã ở `/opt/legal-office`; `.env` quyền 600. Phiên Claude điều khiển server qua `claude rc` trong tmux (phiên `dev`); phiên này có thể offline và khi đó việc trên server dừng lại.
- Chủ dự án đã: tạo snapshot, reboot, mở 80/443 ở tường lửa Lighthouse. **DNS để sau.**
- Máy ảo chỉ cách ly bằng ufw (chặn 3000/3001 từ ngoài). Chưa gia cố SSH xong (tắt đăng nhập mật khẩu, fail2ban dự kiến): việc còn lại ở tệp 06.

## 3. Thành phần triển khai trong repo (`deploy/`)

Mô tả đầy đủ ở [docs/engineering/deploy-tencent.md](../engineering/deploy-tencent.md). Tóm tắt:

| Tệp | Việc |
|---|---|
| `deploy/docker-compose.yml` | `api` (giới hạn RAM 256MB, heap Node 160MB) và `web` (384MB) dùng mạng host; log xoay vòng; health check; bí mật từ `.env` |
| `deploy/Caddyfile` | Reverse proxy + HTTPS tự động. `SITE_ADDRESS=:80` trước khi có DNS, sau đó đặt tên miền chính thức |
| `deploy/env.example` | Mẫu `/opt/legal-office/.env` (không có giá trị thật) |
| `deploy/scripts/deploy.sh` | Kéo image theo tag, `up -d`, kiểm `/health` tối đa ~200 giây, **tự quay lại tag cũ nếu lỗi**, làm nóng cache |
| `deploy/scripts/backup.sh` | `pg_dump -Fc` → `zstd` → `rclone` lên bucket `lo-backup` (cron 02:15 hằng đêm); báo lỗi nếu bản sao quá nhỏ |
| `deploy/scripts/restore-test.sh` | Diễn tập khôi phục vào DB tạm, đối chiếu số hàng |
| `deploy/scripts/warmup.sh` | Làm nóng cache sau reboot/restart (truy vấn đầu sau khởi động ~1,5–2,6 giây) |
| `deploy/scripts/monitor.sh` | Cron 5 phút: ổ >75%, RAM available <150MB, swap >=1500MB, `/health`, Postgres, backup quá 26 giờ; ghi `alerts.log`, tùy chọn webhook |
| `.github/workflows/deploy.yml` | `workflow_dispatch` (**chạy tay**, chỉ nhánh `main`): build `api`, `web` → GHCR → SSH → `deploy.sh` |

- **CD chạy tay:** không tự deploy khi push. Secrets GitHub cần có: `DEPLOY_HOST`, `DEPLOY_USER` (`dev`), `DEPLOY_SSH_KEY` (khóa ed25519 riêng cho deploy), `DEPLOY_KNOWN_HOSTS`. Image `ghcr.io/nexagnet/legal-office-{api,web}:<sha>`. `API_URL` của web được nướng lúc build (`http://127.0.0.1:3001`).
- **Quy tắc vận hành:**
  - **Không build trên server**: build web làm RAM available xuống ~93MB (đã đo). Luôn build ở CI/GHCR.
  - **Chạy 1 bản API** (giới hạn request và lịch nền nằm trong bộ nhớ).
  - **OCR không chạy trên server**; OCR và dựng chỉ mục 200GB làm trên PC.
  - Migration tự áp khi API khởi động; trước migration lớn nên có bản sao lưu mới; rollback = triển khai lại tag cũ (`.previous-tag`).
  - Downtime vài giây khi deploy được chấp nhận.
  - Sau reboot đợi `warmup.sh` trước giờ làm việc.
  - Nạp OCR hàng loạt: tắt trigger `dms_osi_ocr_trg` hoặc nạp theo lô + `ANALYZE`, rồi `dms_index_ensure` (xem tệp 04).

## 4. Biến môi trường chính

Danh sách đầy đủ: [docs/engineering/go-live-checklist.md](../engineering/go-live-checklist.md) mục 2 và `deploy/env.example`. Nhóm: `NODE_ENV=production`, `AUTH_MODE=password`, `TRUST_PROXY=1`, `DATABASE_URL` (chủ DB, dùng cho migration) và `APP_DATABASE_URL` (vai `legal_app`), `WEB_ORIGIN`/`PUBLIC_WEB_URL` (tên miền chính thức), `FILE_STORE=r2` + `R2_*`, `BACKUP_R2_*`, `MAIL_SETTINGS_KEY`, `TENANT_ID`/`TENANT_NAME`, `SCAN_PURGE_*`, `REMINDERS_*`, `RATE_LIMIT_*`, `LEGACY_*`. **Giá trị thật chỉ ở `.env` trên server và trình quản lý mật khẩu của chủ dự án.** Không bao giờ dán khóa vào chat hay repo: nhập vào `.env` bằng `read -s` như hướng dẫn của luồng Tencent.

## 5. Kho tệp R2 (Cloudflare)

- Bucket **`lo-files`** (riêng tư, không bật truy cập công khai): tệp scan và tài liệu cũ. Bucket **`lo-backup`** (riêng): sao lưu DB, token riêng. Dự kiến 3 token: backend `lo-files` (Object Read & Write, chỉ bucket đó, **không dùng token Admin**), `lo-backup-writer`, `lo-backup-reader` (chỉ đọc, dành cho PC kéo bản sao).
- **Bucket Lock BẬT** (9/11/2026) cho `lo-files`: rule `legacy-<8 ký tự đầu mã tenant>`, prefix `t/<TENANT_ID_VP_HBT>/legacy/`, giữ **vô thời hạn**; xóa/ghi đè trả 409 (đã thử). **R2 không có versioning**: đừng dựa vào "bật versioning".
- Prefix scan hồ sơ `t/<tenant>/dms/` **không khóa**: cron `scan-purge` (02:30 giờ VN) xóa object sau 30 ngày xóa mềm; khóa prefix này sẽ gây lỗi 409 ở cron. Rule khóa 30 ngày cho `dms/` là tùy chọn, chưa bật, cần kiểm tài liệu Cloudflare về xung đột với purge.
- Thùng rác không cần sửa khi có Bucket Lock (không đường xóa nào đụng `legacy/`): [reports/khao-sat-thung-rac-bucket-lock-2026-11-09.md](reports/khao-sat-thung-rac-bucket-lock-2026-11-09.md). Đã vá kẽ hở chạy lại nhập (HEAD trước PUT) ở PR #431.
- **CORS** cho `lo-files` (cần để trình duyệt PUT thẳng lên R2): cho origin tên miền chính thức; method GET, PUT, HEAD; header `content-type`, `x-amz-checksum-sha256`, `x-amz-sdk-checksum-algorithm`; expose `ETag`. **Chưa cấu hình, chưa thử với R2 thật.**
- Chi phí R2 ước ~$36/năm cho 200GB (ước, chưa kiểm hóa đơn thật).

## 6. Sao lưu và khôi phục

Kế hoạch gốc: [reports/bien-phap-khoi-phuc-du-lieu-2026-11-09.md](reports/bien-phap-khoi-phuc-du-lieu-2026-11-09.md). Chủ dự án muốn **ít biện pháp, đơn giản**; mục tiêu đề xuất: Postgres RPO ≤ 15 phút (chưa đạt: hiện chỉ dump đêm, RPO ~24 giờ; WAL liên tục là tùy chọn), RTO ≤ 4 giờ; tệp RPO ≤ 24 giờ.

Các lớp đã chốt hoặc dự kiến:
1. **Dump đêm** lên R2 `lo-backup` (script có trong repo, **chưa chạy thật**), giữ 14 ngày + 8 tuần (dự kiến lifecycle rule, chưa đặt).
2. **PC của chủ dự án** kéo bản sao hằng tuần về ổ ngoài bằng token chỉ đọc; **diễn tập khôi phục hằng tháng** vào Postgres trên PC.
3. **Bucket Lock** cho tài liệu cũ; **thùng rác 30 ngày** cho scan; hồ sơ ghi sổ bất biến.
4. **Snapshot Lighthouse** là lớp phụ (đã chụp một bản trước khi có dữ liệu).
5. Ngày 9/11 chủ dự án ghi nhận đã mua gói backup VPS của OVH (khi còn chọn OVH). Sau đó production chuyển sang Tencent; **không rõ khoản mua OVH còn hiệu lực hay có VPS OVH nào đang chạy** (chưa xác minh, hỏi chủ dự án). Nếu quay lại OVH thì dùng lại. Hiện **chưa có bản sao thứ hai khác tài khoản/nhà cung cấp cho tệp** (`rclone copy` đêm sang bucket thứ hai): còn ở mức đề xuất.
- **Cất khóa giải mã backup và `.env` ở 2 nơi** ngoài máy chủ (mất khóa thì mọi bản sao vô dụng): **chưa xong**, việc của chủ dự án.
- **Chưa từng diễn tập khôi phục thật** (`restore-test.sh` chưa chạy). Đây là việc bắt buộc trước khi nhận dữ liệu thật.
- Mất cả server: dựng VPS mới (OVH VPS-1 là đường lui), `pg_restore` từ R2, trỏ DNS lại; thời gian ước vài chục phút đến vài giờ (ước, chưa đo).

## 7. Giới hạn tải đã đo (dữ liệu giả, trên đúng server này, 12/11/2026)

Chi tiết: [reports/phuong-an-tencent-lighthouse-2gb-2026-11-12.md](reports/phuong-an-tencent-lighthouse-2gb-2026-11-12.md) mục 13–14.

| Quy mô | 30.000 hồ sơ | 150.000 hồ sơ (cỡ 200GB) |
|---|---|---|
| DB sau chỉ mục | 2,46GB | **4,79GB** ("200GB" là tệp trên R2, không nằm trong DB) |
| `dms_index_ensure` lần đầu | 124 giây | 5 phút 31 giây |
| 20 người đồng thời, tải thực tế (1 IP, nghỉ 3–6s) | p95 311ms | p50 82ms, p95 ~1,2s |
| 20 người, tải nặng (qua web) | p95 384ms | p50 224ms, p95 833ms, p99 ~1,2s |
| Điểm chậm nhất: đếm bộ lọc "mọi miền" | ~0,2s | **1,1–1,6s** (tĩnh); tối đa 4,7–6,5s khi tải nặng |
| Cache nguội (sau restart/reboot) | — | mỗi truy vấn đầu 1,5–2,6s (cần `warmup.sh`) |
| RAM available thấp nhất lúc tải | ~610–650MB | **~552MB**, swap ~350MB, không thấy thrash |

Kết luận: **chịu được 20 nhân viên về độ trễ (0 lỗi)** nhưng **RAM mỏng**. Nếu chậm/hết RAM: nâng 4GB, hoặc chuyển OVH VPS-1 (2 vCore/4GB/40GB) bằng dump/restore + đổi DNS, hoặc cache ngắn hạn cho truy vấn đếm bộ lọc mọi miền (một thay đổi mã nhỏ, chưa làm).

**Chưa đo:** scan A4 thật, chạy liên tục nhiều giờ, Caddy/HTTPS trong đường đo, ghi dữ liệu thật của người dùng, p95 trong 24 giờ thực tế, nhập dữ liệu thật.

## 8. Môi trường dev cũ (Northflank)

Dev chạy trên Northflank (tài khoản thứ hai của chủ dự án) tự deploy từ `main`: `dev.nexagnet.com`, `www.nexagnet.com`, dữ liệu giả, CI/CD riêng. Tài liệu: [docs/engineering/northflank-deploy.md](../engineering/northflank-deploy.md). Lưu ý: **tài khoản Northflank của dự án khác (`bmsl`) tuyệt đối không đụng**; không patch nhóm biến `lo-secrets` bằng payload một phần (từng làm mất biến). Tài khoản thử và mật khẩu nằm trên máy chủ dự án, **không** trong repo. Tencent là production; dev vẫn dùng cho E2E và demo.

## 9. Tài liệu hạ tầng liên quan

- Kế hoạch OVH ban đầu (đường lui): [reports/ke-hoach-chuyen-production-ovhcloud-2026-11-09.md](reports/ke-hoach-chuyen-production-ovhcloud-2026-11-09.md)
- Checklist trước production (9/11, nhiều mục còn mở): [reports/checklist-truoc-production-2026-11-09.md](reports/checklist-truoc-production-2026-11-09.md)
- Đo trên laptop (11/11): [reports/do-hieu-nang-northflank-free-vps1-2026-11-11.md](reports/do-hieu-nang-northflank-free-vps1-2026-11-11.md)
- Chip CPU OVH (suy đoán, chưa kiểm vùng Singapore): [reports/chip-cpu-ovh-vps-2026-11-11.md](reports/chip-cpu-ovh-vps-2026-11-11.md)
