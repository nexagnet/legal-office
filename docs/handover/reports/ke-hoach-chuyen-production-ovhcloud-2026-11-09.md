# Kế hoạch chuyển production sang OVHcloud (9/11/2026)

Chỉ là khảo sát và kế hoạch. Chưa mua, chưa đăng ký, chưa đổi gì. Giá lấy từ trang OVH Singapore (S$, chưa VAT) và tài liệu OVH; mục nào chưa xác minh được thì đánh dấu **(chưa xác minh)**. Cần xem lại giá và vùng trên trang đặt hàng trước khi quyết.

## 0. Điều cần nói thẳng
- **Hiện chưa có production thật.** Chỉ có môi trường dev trên Northflank (dev.nexagnet.com, dữ liệu giả), checklist go-live chưa tick mục nào, và 200GB tài liệu cũ chưa nhập. Nên đây là **lần dựng production đầu tiên**, không phải di chuyển dữ liệu khách. Rủi ro và downtime thấp hơn nhiều so với kịch bản "chuyển".
- Vì vậy thời điểm tốt nhất để quyết nơi đặt dữ liệu là **trước khi nhập 200GB**, để khỏi phải chép lại.
- Việc sao lưu và chống xóa nhầm của R2 và OVH đang được thread khác tra; kế hoạch này chỉ nêu phần cần thiết (mục 6).

## 1. Hiện trạng trong repo
| Thành phần | Hiện tại |
|---|---|
| API | NestJS 11, cổng 3001, `/health`; Dockerfile target `api`; tự áp migration khi khởi động nếu có `MIGRATE_DATABASE_URL` (khóa advisory, giữ 1 instance) |
| Web | Next.js 15, target `web`, cổng 3000; `API_URL` truyền lúc **build** (rewrite `/api/*`) và lúc chạy |
| DB | Postgres 17 + RLS (vai `legal_app` không superuser), 118 migration, hàm PG chứa nghiệp vụ |
| OCR | target `ocr` (Tesseract `vie` + poppler), chạy Cron Job `OCR_ONCE=1` mỗi 5–10 phút; bật `LEGACY_OCR_ENABLED` cho tài liệu cũ |
| Lưu tệp | `FILE_STORE=r2` (S3 SDK, link ký sẵn PUT/GET). **Endpoint đang viết cứng** `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` trong `apps/api/src/storage/file-store.ts` |
| Lịch nền | croner trong API: `SCAN_PURGE_SCHEDULE`, `REMINDERS_SCHEDULE` |
| CI/CD | GitHub Actions chỉ kiểm (lint, typecheck, test, build). Deploy do Northflank tự kéo từ `main` |
| Tên miền | nexagnet.com ở zonedns.vn (không ALIAS) nên gốc không có TLS, chỉ `www` qua CNAME |

Không có docker-compose, reverse proxy, script backup hay workflow deploy trong repo. Đây là phần phải viết mới.

## 2. Sản phẩm OVH và đề xuất

### 2.1 Tính toán (chọn)
| Phương án | Cấu hình | Giá/tháng | Nhận xét |
|---|---|---|---|
| **A. VPS (khuyến nghị)** | VPS-2: 4 vCore, 8GB, 75GB NVMe, 1Gbps | **S$10.88** (~8 USD) | Rẻ nhất, đủ cho web+API+Postgres+OCR tệp mới. Backup mặc định 24 giờ miễn phí, "Premium backup" từ S$1.70 (7 ngày), snapshot S$0.50. Singapore/Sydney có trong danh sách vùng APAC nhưng **bản VPS tại SG có hạn mức lưu lượng (500GB–3TB/tháng, vượt thì 10Mbps) (chưa xác minh gói nào)**; đủ cho văn phòng nhỏ |
| A-nhỏ | VPS-1: 2 vCore, 4GB, 40GB NVMe | S$5.78 | Chạy được nhưng sát RAM khi có OCR; nên bắt đầu VPS-2 |
| B. Public Cloud | d2-4 (2 vCore/4GB) S$17.16; d2-8 (4 vCore/8GB) S$30.90; b3-8 ~S$55 (Savings 12 tháng S$47.65) | 17–55 | Có snapshot, volume, mạng riêng, hóa đơn theo giờ. Đắt gấp 2–5 lần VPS, chưa cần ở giai đoạn này |

### 2.2 Postgres
- **Tự chạy trong Docker trên VPS (khuyến nghị)** cùng `pgBackRest` hoặc `pg_dump` + WAL ra Object Storage. Lý do: Managed PostgreSQL của OVH **chưa xác nhận có ở Singapore/Sydney (chưa xác minh)**, gói Essential chỉ giữ backup **2 ngày**, Business (2 node) 14 ngày, và giá thuộc gói Public Cloud (đắt hơn VPS nhiều). Dữ liệu pháp lý cần giữ lâu hơn 2 ngày.
- Đổi lại: mình phải tự lo cập nhật, giám sát, kiểm tra khôi phục. Đây là chi phí nhân công thật, cần chấp nhận.

### 2.3 Lưu tệp (200GB scan)
- **OVH Object Storage Standard**: tương thích S3 (hầu hết, cần thử), có Object Lock (không dùng được ở Cold Archive), đồng bộ/replicate giữa vùng. Giá 1-AZ khoảng 0,0071 EUR/GB/tháng, tức 200GB ≈ **1,4 EUR/tháng**; hiện OVH nói không tính phí lưu lượng vào/ra trên trang SG **(cần xác nhận trên trang giá, tài liệu FAQ chỉ nói "xem website")**. Việc có bucket tại Singapore/Sydney **chưa xác minh**; nếu không có thì vùng gần nhất là châu Âu (độ trễ ~250ms, vẫn dùng được cho tệp nhưng chậm hơn).
- **Giữ R2**: 200GB ≈ 3 USD/tháng, không phí egress, đã có code. Chênh lệch giá với OVH chỉ khoảng 1–2 USD/tháng, nên **tiết kiệm không phải lý do để chuyển tệp**.
- **Khuyến nghị**: nếu mục tiêu của chuyển sang OVH là gom một nhà cung cấp và/hoặc dữ liệu nằm ở nhà cung cấp mà anh/chị tin cậy, dùng OVH Object Storage cho tệp chính **và** giữ bản sao thứ hai ở nơi khác (R2) để không dồn mọi thứ vào một nhà. Nếu không có lý do đó, giữ R2 cho tệp và chỉ chuyển phần tính toán + DB là phương án ít việc nhất.
- Quy mô bản sao: 200GB nhân đôi vẫn chỉ ~3–5 EUR/tháng.

### 2.4 Vùng
Ưu tiên **Singapore** (độ trễ từ Hà Nội thường ~30–60ms), thứ hai Sydney (~150ms+). Cần xác nhận trên trang đặt hàng vùng nào có VPS, và vùng nào có Object Storage. Không chọn châu Âu cho ứng dụng vì độ trễ.

### 2.5 Tổng ngân sách ước tính (EUR/USD gần nhau, làm tròn)
| Khoản | /tháng |
|---|---|
| VPS-2 Singapore | ~8 USD |
| Backup Premium / snapshot | ~1–2 USD |
| Object Storage 200GB (OVH, nếu dùng) hoặc R2 | ~1,5 hoặc ~3 USD |
| Bản sao ngoài (R2 hoặc bucket thứ hai) | ~1,5–3 USD |
| Tên miền | đã có |
| **Tổng** | **khoảng 12–16 USD/tháng, ~150–200 USD/năm** |
Nếu muốn chạy OCR 200GB một lần: thuê máy mạnh ngắn hạn như đã nêu ở kế hoạch tìm kiếm (30–100 USD một lần, ước), không chạy trên VPS này.

## 3. Kiến trúc triển khai
Một VPS Singapore, Docker Compose:
- `caddy` (reverse proxy, TLS Let's Encrypt tự động, cổng 80/443). Chỉ Caddy mở ra ngoài.
- `web` (3000), `api` (3001) trong mạng nội bộ Docker; Caddy chuyển tiếp mọi thứ tới `web`, web tự rewrite `/api/*` sang `api` như hiện tại (nên `API_URL=http://api:3001` lúc build).
- `postgres` 17, volume trên NVMe, **không** mở cổng ra ngoài; cấu hình `shared_buffers` ~1–2GB; `pg_hba` chỉ cho mạng Docker.
- `ocr`: Compose profile chạy `OCR_ONCE=1` qua systemd timer/cron mỗi 5–10 phút (giống Cron Job hiện tại), giới hạn CPU (`cpus: 1`, `mem_limit`).
- Sao lưu: container/cron `pgbackrest` hoặc `pg_dump` + `rclone` (xem mục 6).
- Bảo vệ máy: firewall chỉ mở 80/443 và SSH (khóa SSH, tắt mật khẩu, đổi cổng hoặc giới hạn IP), `unattended-upgrades`, fail2ban, theo dõi bằng Uptime Kuma hoặc dịch vụ ping ngoài.
- Domain/DNS: trỏ **A record** thẳng về IP VPS. Vì máy mình tự giữ TLS nên **bỏ luôn hạn chế "gốc không có TLS" hiện nay**; đặt `nexagnet.com` làm địa chỉ chính và `www` chuyển về. Có thể giữ DNS ở zonedns.vn hoặc chuyển nameserver (OVH DNS/Cloudflare) cho TTL linh hoạt và API quản lý.
- Biến môi trường: cùng danh sách trong `go-live-checklist.md` (tenant MỚI, không dùng DB dev). Bí mật nằm trong file `.env` quyền 600 trên máy chủ (hoặc `docker secret`), **không vào repo**; sao lưu bản mã hóa của `.env` ở nơi khác.

## 4. Thay đổi code/CI cần làm (một PR nhỏ + một PR CI)
1. **`file-store.ts`**: cho phép endpoint tùy ý. Thêm `FILE_STORE=s3` với `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, khóa; giữ `r2` như cũ. OVH dùng endpoint dạng `https://s3.<region>.io.cloud.ovh.net` (kiểm tra tài liệu lúc làm). Hiện `forcePathStyle` đã bật khi có endpoint.
2. **Thử tương thích OVH S3**: PUT link ký sẵn có header `x-amz-checksum-sha256` (công cụ `lo-import` phụ thuộc), HEAD, GET, CORS cho PUT từ trình duyệt, Object Lock. Đây là điều kiện chặn: nếu OVH không hỗ trợ checksum header thì phải điều chỉnh `lo-import` hoặc giữ R2.
3. Thêm `deploy/` : `docker-compose.yml`, `Caddyfile`, `.env.example`, script backup/restore, tài liệu `docs/engineering/ovh-deploy.md`.
4. **CI/CD mới** (GitHub Actions, sau khi CI xanh trên `main`): build image `api`, `web`, `ocr` (web cần build-arg `API_URL`), đẩy lên GHCR, rồi SSH vào VPS (khóa deploy riêng, quyền hạn chế) chạy `docker compose pull && up -d`. Có bước chặn bằng cổng duyệt tay (GitHub Environment `production` yêu cầu người duyệt) để không tự động đẩy lên dữ liệu thật như dev. Migration vẫn tự áp lúc `api` khởi động (quy ước thêm-trước-xóa-sau giữ nguyên); mất khả năng rolling deploy nên downtime vài giây mỗi lần cập nhật, chấp nhận được.
5. Giữ Northflank làm dev/staging (đã chạy, gần như miễn phí) hoặc tắt sau khi ổn định.

## 5. Di chuyển dữ liệu
- **Postgres**: chưa có dữ liệu khách ⇒ không cần di chuyển; chạy `migrate` + `bootstrap-tenant.cli` trên DB mới. Dữ liệu dev là giả, không mang sang.
- **Tệp scan**: chưa có tệp thật trên R2 (nhập 200GB chưa chạy). Nếu đã có bucket R2 thử, chỉ cần `rclone sync` sang OVH (đồng bộ lại được, kiểm checksum). 200GB qua đường truyền văn phòng ~ vài ngày; với `rclone` giữa hai đám mây thì nhanh hơn nhiều. Ưu tiên chạy `lo-import` đẩy thẳng vào kho đích cuối cùng.
- **Quy tắc**: không chạy `tools/seed-demo` trên production.

## 6. Sao lưu và khôi phục thảm họa (phần tối thiểu, chi tiết ở thread backup/R2)
- Postgres: sao lưu đầy đủ hằng ngày + WAL liên tục (PITR) bằng `pgBackRest` ra bucket OVH, **giữ 30 ngày**; kèm bản chép sang nhà cung cấp/ vùng khác (R2 hoặc bucket SYD). Mục tiêu: RPO ≤ 15 phút, RTO ≤ 4 giờ.
- Tệp: bật versioning (nếu OVH hỗ trợ; FAQ không nhắc, **chưa xác minh**) và/hoặc Object Lock cho bucket, tắt quyền xóa của khóa mà ứng dụng dùng, và sao chép bất đồng bộ sang bucket thứ hai.
- Snapshot VPS và Premium backup chỉ là lớp bổ sung, không thay thế sao lưu DB.
- **Diễn tập khôi phục** hàng quý trên VPS tạm; ghi ngày vào go-live-checklist (mục 5 chưa tick).
- Kịch bản mất VPS: tạo VPS mới từ `deploy/` + khôi phục `.env` + `pgbackrest restore`; viết thành runbook và thử một lần trước khi mở cho khách.

## 7. Bảo mật và tuân thủ
- Dữ liệu pháp lý và dữ liệu cá nhân (Luật BVDLCN 91/2025/QH15): xác nhận **khách đồng ý** việc lưu ở Singapore (ngoài lãnh thổ VN); cân nhắc có hồ sơ đánh giá tác động chuyển dữ liệu ra nước ngoài nếu pháp luật yêu cầu. Đây là điều cần luật sư/khách xác nhận, kế hoạch này không kết luận.
- Mã hóa: TLS ngoài, đĩa VPS không mã hóa mặc định ⇒ cân nhắc mã hóa ở lớp ứng dụng cho bản sao lưu (`pgBackRest` hỗ trợ mã hóa AES-256); khóa mã hóa giữ riêng.
- Quyền tối thiểu: khóa S3 ứng dụng chỉ cho một bucket, không quyền xóa phiên bản; khóa sao lưu tách riêng; vai `legal_app` không superuser (đã có); kiểm RLS sau khi dựng.
- Nhật ký truy cập và nhật ký nghiệp vụ đã có trong DB; thêm gửi log hệ thống ra ngoài máy (hoặc giữ 30 ngày).
- VPS đơn lẻ là một điểm hỏng; chấp nhận cho giai đoạn đầu, nêu rõ với khách (SLA không cam kết).

## 8. Kế hoạch cắt chuyển và rollback
Vì chưa có người dùng thật, cắt chuyển rất nhẹ:
1. Dựng VPS + Compose bằng domain tạm (`prod.nexagnet.com`), chạy toàn bộ checklist go-live (mục 6 của checklist) và thử khôi phục.
2. Nhập mẫu thật nhỏ (không phải 200GB) để thử OCR và tìm kiếm trên cấu hình mới.
3. Ngày cắt: hạ TTL DNS xuống 300 giây trước 24 giờ; trỏ `nexagnet.com` + `www` về VPS; Northflank giữ nguyên làm dự phòng.
4. Rollback: đổi DNS về Northflank (nếu chưa có dữ liệu thật) hoặc về VPS cũ; nếu đã có dữ liệu thật trên OVH thì rollback nghĩa là khôi phục bản sao lưu, nên **chỉ cho khách nhập dữ liệu thật sau khi qua 1–2 tuần chạy ổn định**.

## 9. Mốc thực hiện (ước, người làm thường xuyên)
| Mốc | Việc | Thời gian |
|---|---|---|
| M0 | Anh/chị chốt các câu hỏi mục 11; mở tài khoản OVH; xác nhận vùng + giá thật | 1–2 ngày |
| M1 | PR `FILE_STORE=s3` + thử tương thích OVH (bucket thử) | 1–2 ngày |
| M2 | `deploy/` Compose + Caddy + script backup; dựng VPS thử | 2–3 ngày |
| M3 | CI/CD GHCR + SSH deploy + cổng duyệt | 1–2 ngày |
| M4 | Diễn tập khôi phục, checklist go-live, chạy thử 1–2 tuần | 1–2 tuần |
| M5 | Cắt DNS; nhập dữ liệu thật/200GB | theo kế hoạch tìm kiếm |

## 10. Rủi ro chính
1. **Tương thích S3 của OVH** (checksum header, CORS, presign) chưa thử ⇒ có thể phải sửa `lo-import` hoặc ở lại R2.
2. **Vùng Singapore/Sydney cho Object Storage và Managed PostgreSQL chưa xác minh**; VPS SG có hạn mức lưu lượng.
3. Tự vận hành Postgres: sai cấu hình backup là mất dữ liệu ⇒ bắt buộc diễn tập khôi phục.
4. Một VPS = một điểm hỏng; OCR hàng loạt không chạy được ở đây (cần máy thuê riêng).
5. Mất khả năng rolling deploy của Northflank (downtime vài giây khi cập nhật).
6. Mật khẩu/khóa nằm trong `.env`: lộ máy là lộ khóa ⇒ cứng hóa SSH, khóa quyền tối thiểu.
7. Pháp lý: lưu dữ liệu cá nhân ở nước ngoài.
8. Giá OVH đổi theo thời điểm/thuế (số trong file là chưa VAT, có thể lệch).

## 11. Cần anh/chị quyết
1. **Mục tiêu chuyển sang OVH là gì?** (giá, một nhà cung cấp, vùng, điều khoản khác) ⇒ ảnh hưởng chuyện giữ hay bỏ R2.
2. **Tệp ở đâu**: OVH Object Storage hay giữ R2 (kèm bản sao thứ hai)? Khuyến nghị: thử OVH trước, giữ R2 làm bản sao.
3. **VPS-2 Singapore** (khuyến nghị) hay Public Cloud (đắt gấp 2–5 lần)?
4. **Tự chạy Postgres** (khuyến nghị) hay chờ xác nhận Managed PostgreSQL có ở khu vực gần?
5. Chấp nhận **downtime vài giây** khi cập nhật và không có SLA cao ở giai đoạn đầu?
6. Có cần **hạn chế dữ liệu ở trong nước** (khách yêu cầu)? Nếu có, OVH Singapore/Sydney không đáp ứng, cần xem nhà cung cấp trong nước.
7. Domain chính: dùng `nexagnet.com` (gốc) và chuyển DNS ra khỏi zonedns.vn?
8. Ai giữ tài khoản OVH và thanh toán (thẻ, hóa đơn); tôi **không** tạo tài khoản hay mua thay.

## Nguồn
- Trang VPS Singapore: https://www.ovhcloud.com/en-sg/vps/
- Trang giá Public Cloud: https://www.ovhcloud.com/en-sg/public-cloud/prices/
- Object Storage Singapore: https://www.ovhcloud.com/en-sg/public-cloud/object-storage/
- S3 FAQ OVH: https://docs.ovhcloud.com/en/guides/storage-and-backup/object-storage/s3-faq.md
- Managed DB giá/khả năng: https://docs.ovhcloud.com/en/guides/public-cloud/databases/pricing.md , https://docs.ovhcloud.com/en/guides/public-cloud/databases/postgresql-capabilities.md
- Repo: `Dockerfile`, `docs/engineering/northflank-deploy.md`, `go-live-checklist.md`, `ocr.md`, `apps/api/src/storage/file-store.ts`

---
# Phụ lục: xác minh nốt (9/11/2026, trang OVH US + tài liệu S3)
Giá USD, chưa thuế (anh/chị không cần xuất VAT thì giá chưa thuế là giá tham chiếu; vẫn có thể bị tính thuế tùy quốc gia thanh toán, kiểm tra lúc đặt hàng).

## VPS (us.ovhcloud.com/vps)
| Gói | Cấu hình | Giá/tháng |
|---|---|---|
| VPS-1 | 2 vCore, 4GB, 40GB NVMe, 500Mbps | **$4.54** |
| VPS-2 | 4 vCore, 8GB, 75GB NVMe, 1Gbps | **$8.50** |
| VPS-3 | 6 vCore, 12GB, 100GB NVMe | $12.32 |
| VPS-4 | 8 vCore, 24GB, 200GB NVMe | $23.37 |
- Lưu lượng **không giới hạn** ở Mỹ. Châu Á (Singapore, Sydney, Mumbai) có hạn mức **1TB/tháng (VPS-1, VPS-2)**, vượt thì 10Mbps.
- Backup tự động tiêu chuẩn miễn phí (ngày 1 lần, giữ 7 bản); Premium từ $1.40/tháng; snapshot từ $0.40/tháng.
- Trang không ghi tên datacenter Mỹ; trang vùng liệt kê Seattle (HIL) và Washington DC (VIN).
- So với Singapore (S$10.88 ≈ 8.4 USD cho VPS-2): **VPS Mỹ không rẻ hơn Singapore** (8.50 USD), nên chọn Mỹ chỉ có lợi ở lưu lượng không giới hạn, và đổi lại độ trễ từ Việt Nam cao hơn (ước 180–250ms so với 30–60ms; chưa đo). Với ứng dụng nhiều trang/gọi API, độ trễ này thấy rõ.

## Object Storage
- **Không có vùng Mỹ.** Có: Beauharnois (bhs) và Toronto (Canada), Singapore (sgp), Sydney (ap-southeast-syd), Mumbai (ap-south-mum), cùng nhiều vùng châu Âu. Tất cả 1-AZ, hỗ trợ Standard, High Performance, Infrequent Access.
- Giá Standard: **$0.00811/GiB/tháng** ⇒ 200GB ≈ **$1.6/tháng**. Infrequent Access $0.00436/GiB (+ phí truy xuất $0.00436/GiB, tối thiểu 30 ngày). **Lưu lượng vào/ra ngoài và API request: miễn phí.**
- Tính năng S3 (tài liệu tương thích): **versioning** có, **Object Lock** có (retention/legal hold ở vùng thường), **CORS** có, **link ký sẵn GET/PUT/HEAD/DELETE** có, upload nhiều phần có, lifecycle có, sao chép bất đồng bộ có (vùng thường). Phí cho phiên bản cũ: không tìm thấy trên trang.
- **Header `x-amz-checksum-sha256` không có trong bảng tương thích ⇒ vẫn chưa xác minh**; cần thử trực tiếp bằng một bucket thử trước khi quyết (lo-import phụ thuộc).
- Endpoint: `https://s3.<region>.io.cloud.ovh.net` (vd `sgp`).

## Managed PostgreSQL
- Essential rẻ nhất DB1-4 (1 vCore, 4GB, 80–240GiB): **$64.24/tháng** ⇒ không phù hợp ngân sách (gấp ~8 lần VPS-2). Vùng xác nhận được: chỉ châu Âu; Singapore/Sydney/Mỹ **không có trong bảng**. ⇒ **Loại**, tự chạy Postgres trên VPS như đã đề xuất.

## Kết luận sau xác minh
1. Muốn rẻ: VPS-2 ($8.50) **ở Singapore hoặc Mỹ giá như nhau**; chọn Singapore vì độ trễ tốt hơn, trừ khi cần lưu lượng không giới hạn (hạn mức 1TB/tháng vẫn rất dư cho văn phòng nhỏ).
2. Nếu chọn VPS Mỹ thì Object Storage **không ở Mỹ được**; đặt ở Singapore thì tệp đi xa (Mỹ ↔ Singapore) và chậm/không ổn khi xem tệp. Giữ R2 (Cloudflare, gần người dùng, không phí egress) hoặc dùng bucket Singapore với VPS Singapore thì gọn hơn.
3. Ngân sách tối thiểu: VPS-1 $4.54 chạy được nhưng 4GB RAM sát khi có OCR; khuyến nghị VPS-2 $8.50.
4. Tổng cập nhật: VPS-2 $8.50 + backup Premium $1.40 + 200GB Standard $1.6 + bản sao thứ hai ≈ **$13–16/tháng**.
5. Còn lại chưa xác minh: tương thích checksum sha256 của link ký sẵn (phải thử thật), tên datacenter VPS Mỹ, phí phiên bản cũ.
