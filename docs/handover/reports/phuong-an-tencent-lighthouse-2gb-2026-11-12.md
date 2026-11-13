# Phương án chạy Legal Office trên Tencent Lighthouse 2 vCPU / 2GB / 40GB (12/11/2026)

Đây là phương án **trên giấy**: dựa trên đọc code repo `nexagnet/legal-office` (Dockerfile, worker OCR, entrypoint, docs) và số đo cũ ở `do-hieu-nang-northflank-free-vps1-2026-11-11.md`. **Chưa đo gì trên máy 2GB.** Mọi con số RAM của web/OCR ghi "ước lượng" là chưa đo.

## 1. Kết luận ngắn
- **Chạy được cho công việc hằng ngày của 20 nhân viên** (xem/lọc/tìm hồ sơ, tải lên, tải xuống tệp qua R2), nếu làm đủ các điều chỉnh ở mục 3 và 4.
- **Không nên để server 2GB làm OCR 200GB và dựng chỉ mục.** Việc đó đẩy sang PC của anh/chị (mục 5), server chỉ giữ kết quả.
- **Rủi ro lớn nhất không phải RAM mà là ổ 40GB và tìm kiếm trên dữ liệu 200GB** (CSDL có thể phình tới ~10GB+, cache RAM chỉ còn ~0,5-0,7GB, nên tìm nội dung/đếm bộ lọc có thể chậm hẳn so với số đo laptop). Mục 6, 7.
- **Tách DB ra máy thứ hai cùng vùng giúp 2GB chạy ổn hơn, nhưng không rẻ/an toàn hơn một VPS 4GB (mục 11).**
- **Giá**: $10,08 chỉ là giá năm đầu cho tài khoản mới; giá năm 2 không tra được chính thức. Với tiêu chí "an toàn dữ liệu số 1", tôi khuyên **giữ OVH VPS-1 4GB làm máy chính**, và nếu muốn dùng $10 của Tencent thì dùng làm **bản sao lưu/dự phòng ở nhà cung cấp thứ hai** (mục 8-9).

## 2. Vì sao Northflank free "vẫn chạy được" mà chưa chứng minh được gì cho 2GB
- Đang là dữ liệu giả, nhỏ; vài người dùng; CSDL còn bé nên nằm gọn trong cache.
- Postgres là addon riêng (RAM không tính chung với web/API); OCR phải chạy dạng Cron Job vì hết chỗ free (`docs/engineering/ocr.md`).
- Không có 200GB, không có bước dựng chỉ mục lớn, không có backup.
- Trên Lighthouse 2GB thì **tất cả (HĐH + Docker + Caddy + web + API + Postgres) dùng chung 2GB**. Nên cần ngân sách RAM riêng (mục 3).

## 3. Ngân sách RAM 2GB (ước lượng)
Số đo thật có: API Node nhàn rỗi ~93-97MB; Postgres trong bench dùng 1,8-2GB nhưng với `shared_buffers=768MB` và cache tệp (không phải bắt buộc). Còn lại là ước lượng.

| Thành phần | RAM dự kiến | Giới hạn đề xuất |
|---|---|---|
| HĐH + sshd + Docker daemon | 250-350MB | tắt dịch vụ thừa (snapd, unattended-upgrades nặng...) |
| Caddy (TLS, reverse proxy) | 20-40MB | 64MB |
| Web Next.js (`next start`) | 150-300MB (chưa đo) | `mem_limit 384m`, `NODE_OPTIONS=--max-old-space-size=224` |
| API NestJS | ~100-150MB (nhàn rỗi 95MB đã đo) | `mem_limit 256m`, `--max-old-space-size=160` |
| Postgres | 400-650MB | `mem_limit 768m` |
| **Tổng** | **~1,0-1,5GB** | còn ~0,5GB cho cache hệ thống + đệm |

Cấu hình Postgres đề xuất cho 2GB (thay vì 768MB shared_buffers như bản 4GB):
`shared_buffers=256MB`, `effective_cache_size=768MB`, `work_mem=4MB`, `maintenance_work_mem=96MB`, `max_connections=30`, `wal_compression=on`, `max_wal_size=1GB`, `checkpoint_timeout=15min`, `random_page_cost=1.1`, `autovacuum_max_workers=2`.
Lưu ý: API tạo `new pg.Pool` mặc định 10 kết nối (`apps/api/src/main.ts`), đủ nhẹ; chỉ cần `max_connections` ≥ 30 là thoải mái (lo-api + web + cron).

**Swap**: tạo swapfile 2GB trên ổ + `vm.swappiness=10` (và nếu muốn thêm zram ~1GB). Swap chỉ là phao khi đột biến, không phải RAM thật; nếu thấy swap dùng liên tục thì là dấu hiệu quá tải. Chưa biết IOPS ổ Lighthouse nên đừng dựa vào swap.

## 4. Thay đổi cấu trúc triển khai (không cần sửa code ứng dụng)
Hiện repo có Dockerfile nhiều đích (`api`, `web`, `ocr`) và hướng dẫn triển khai theo Northflank. Với VPS đơn cần:
1. **Một `docker-compose.yml` cho server** (file hạ tầng mới): `caddy`, `web`, `api`, `postgres`, mỗi dịch vụ có `mem_limit`, `restart: unless-stopped`, Postgres bind `127.0.0.1` (không mở ra Internet).
2. **KHÔNG build trên server.** Dockerfile build cả API lẫn Next trong một bước `pnpm install` + `next build`, dễ vượt 2GB. Build ở GitHub Actions, đẩy image lên GHCR, server chỉ `docker pull` (khớp kế hoạch "CD trên GitHub" đã chốt).
3. **Bỏ khỏi server**: service `lo-ocr` (xem mục 5), `lo-migrate` (đã gộp: `docker-entrypoint.sh` tự áp migration khi API khởi động nếu có `MIGRATE_DATABASE_URL`).
4. **Việc định kỳ** (nhắc hạn `reminders.cli`, dọn scan `scan-purge`, backup): chạy bằng cron của host qua `docker run --rm ... ` một lần rồi thoát, không để service thường trực.
5. **Giữ `LEGACY_OCR_ENABLED` tắt trên server.** Công tắc này do worker đọc, nên chỉ bật ở worker chạy trên PC. Việc OCR của hồ sơ mới (nhẹ, ít) có thể chạy trên server dạng cron `OCR_ONCE=1` mỗi 10-15 phút, giờ hành chính thì giới hạn `--cpus=1 --memory=768m` (xem rủi ro ở mục 7).
6. Tránh gộp web và API vào một container: tiết kiệm chỉ ~30MB, mất khả năng giới hạn/khởi động lại riêng. Không đáng.

## 5. OCR và dựng chỉ mục 200GB: làm trên PC, server chỉ nhận kết quả
Cách hoạt động hiện tại (đọc code): worker `ocr.cli.ts` đọc tệp từ R2, nhận việc qua hàm DB `dms_legacy_ocr_claim`, ghi kết quả bằng `dms_legacy_ocr_complete` (văn bản OCR + `search_text` bỏ dấu). **Worker không cần chạy cùng máy với DB**, chỉ cần `DATABASE_URL` (vai `legal_app`) và khoá R2. Nên **không cần sửa code**:
- Trên PC: chạy image đích `ocr` (Docker Desktop) hoặc Node + Tesseract, với `OCR_ONCE=1`, `LEGACY_OCR_ENABLED=1`, `OCR_TENANT_IDS=...`, `FILE_STORE=r2` + khoá R2 giới hạn bucket.
- Kết nối Postgres trên VPS qua **đường hầm SSH** (`ssh -L 5433:127.0.0.1:5432`), không mở cổng 5432 ra Internet. Mỗi tệp một lượt nhận-ghi nên độ trễ đường hầm không đáng kể so với vài giây OCR.
- Có thể chạy nhiều tiến trình song song trên PC (mỗi cái `OMP_THREAD_LIMIT=1`), nhận việc không trùng nhờ hàm claim. PC nhiều nhân sẽ nhanh gấp nhiều lần VPS 2 vCPU.
- Việc nhập bằng `lo-import` đã chạy trên PC và tải thẳng lên R2 qua presign, nên API 2GB chỉ xử lý siêu dữ liệu.
- **Dựng chỉ mục** `dms_index_ensure` (ước 30-40 phút ở 150k hồ sơ trên VPS-1; trên 2 vCPU/2GB chắc lâu hơn và có thể quá hạn request): chạy chủ động một lần sau nhập, ngoài giờ, **tạm dừng web** và nâng `maintenance_work_mem`/`work_mem` trong phiên đó. Nếu quá chậm, phương án B: dựng toàn bộ DB trên Postgres của PC rồi `pg_dump`/`pg_restore` sang server (trái với quyết định "nhập thẳng production" cũ nên cần anh/chị đồng ý lại).
- Thứ tự: nhập tệp → OCR trên PC → dựng chỉ mục → mới mở `LEGACY_SEARCH_ENABLED` cho nhân viên.

## 6. Ổ 40GB và sao lưu
Ước lượng dung lượng (chưa đo ở 200GB): hệ điều hành + image Docker 4-6GB; CSDL ~3GB (không OCR cũ) đến **~10-13GB nếu lưu hết văn bản OCR tài liệu cũ**; WAL 1-2GB; swap 2GB. Còn lại chưa tới ~15GB trống: **đủ chạy nhưng không đủ chứa backup tại chỗ** theo kiểu giữ nhiều bản.
Cách sao lưu cho ổ nhỏ (ít biện pháp, đơn giản):
1. **Đêm: `pg_dump | zstd | rclone rcat` thẳng lên một bucket R2 riêng** (khoá riêng, không dùng khoá của bucket tệp), không ghi tệp lớn xuống ổ. Giữ 14 bản ngày + 8 bản tuần bằng lifecycle.
2. **Hằng tuần kéo một bản về PC** của anh/chị (và/hoặc ổ ngoài). Đây là bản sao ở nơi thứ ba.
3. (Tuỳ chọn) lưu WAL liên tục lên R2 (pgBackRest/WAL-G) để khôi phục tới thời điểm bất kỳ; tốn CPU/RAM thêm không đáng kể nhưng thêm bước vận hành.
4. Snapshot của Lighthouse: có tính năng nhưng hạn mức/giá chưa xác minh được, đừng coi là bản sao duy nhất.
5. **Tệp**: đã nằm trên R2 có Bucket Lock (xem memory dự án), không phụ thuộc ổ VPS.
6. **Diễn tập khôi phục** một lần: dựng DB từ dump trên PC, kiểm số hồ sơ khớp. Chưa diễn tập thì chưa tính là có backup.
Cảnh báo dung lượng: đặt cron báo khi ổ >75%.

## 7. Cái gì chạy được, cái gì còn rủi ro
Chạy được (khả năng cao):
- 20 người dùng thao tác thường (danh sách, lọc theo năm/miền, tìm tên/số): truy vấn ~30-100ms ở bench 4GB; ở 2GB tương tự nếu CSDL còn nhỏ.
- Tải tệp lên/xuống đi thẳng R2, VPS không chịu tải lớn.
- Migration tự áp khi API khởi động (cần để ý RAM khi migration lớn).

Rủi ro (có thể xảy ra):
1. **Tìm nội dung/đếm bộ lọc ở dữ liệu 200GB**: DB 10GB+ mà cache còn ~0,5GB, nên truy vấn "facets mọi miền" (đã 0,5s trên laptop với 1/5 quy mô) và tìm trigram có thể chậm vài giây khi cache nguội. **Chưa đo, và là rủi ro số 1 của 2GB.** Giảm: mở tìm tài liệu cũ sau cùng, theo dõi p95, nâng cấp gói nếu cần.
2. **OCR trên server**: Tesseract trang A4 300dpi thực có thể ăn 200-400MB mỗi tiến trình (ước lượng; bench chỉ đo ảnh nhỏ, đỉnh 90MB). Ngoài ra `store.get` đọc **nguyên tệp vào RAM** (`Buffer`), mà tệp tài liệu cũ cho phép tới 5GiB (`FILE_TOO_LARGE` ở ngưỡng đó): một PDF vài trăm MB có thể làm OOM server 2GB (và còn `pdftoppm` 300dpi cho tới 50 trang). Trên PC thì không sao. Hệ quả: **không bao giờ bật OCR tài liệu cũ trên server 2GB**; nếu OCR hồ sơ mới trên server thì đặt giới hạn container và chấp nhận một tệp lớn có thể bị bỏ qua.
3. **OOM-killer** giết Postgres khi quá tải: đây là kịch bản gây mất dữ liệu đáng sợ nhất. Giảm: `mem_limit` từng container, `oom_score_adj` thấp cho Postgres, swap, và backup đêm.
4. **2 vCPU chia sẻ**, chưa biết có throttle CPU/IO không (nguồn tra được chỉ có lời quảng cáo "vCPU không bị bóp", chưa xác minh). Một truy vấn nặng + `autovacuum` + cron có thể làm giật.
5. Một máy = một điểm hỏng, không biết có ECC/RAID; cả hai gói đều vậy (xem mục 9).
6. Nhà cung cấp thứ hai có chính sách/giới hạn khác (xem mục 8): lưu trữ dữ liệu pháp lý của văn phòng ở Tencent là quyết định về niềm tin; anh/chị đã nói không có yêu cầu về nơi đặt dữ liệu, nên tôi chỉ nêu để cân nhắc.

## 8. Giá Tencent (tra ngày 12/11/2026)
Nguồn chính thức xác nhận có khuyến mãi "tối đa 80% giảm cho máy đầu tiên, **chỉ $10,08/năm**" (https://www.tencentcloud.com/act/pro/lighthouse). Chi tiết giá/vùng lấy từ trang bên thứ ba VN Coupon (ghi ngày 5/7/2026), **chưa đối chiếu với trang thanh toán**:
- 2 vCPU / 2GB / 40GB SSD Linux: 1 tháng $1,68; 6 tháng $6,30; **1 năm $10,08** (giá niêm yết "gạch" $50,4 cho 1 năm). Vùng: Singapore, Silicon Valley, Frankfurt, Seoul, Tokyo, Jakarta, Bangkok (Virginia không có cho gói năm). Hong Kong không có gói 2GB này.
- Băng thông: trang đó nói giới hạn khoảng 20Mbps và ~500GB/tháng (chưa xác nhận).
- **Giá năm 2 (gia hạn): không tìm được con số chính thức.** VN Coupon chỉ ghi "gia hạn trở về giá chuẩn"; nhân viên Tencent trên LowEndTalk (4/2025) nói có thể ra ưu đãi gia hạn nhưng "không sâu như vậy". Cần coi năm 2 **có thể cao hơn hẳn $10**; giá gạch $50,4/năm (~1,3 triệu đồng) chỉ nên dùng làm mốc tham khảo, không phải giá gia hạn đã biết. Khuyến mãi dành cho khách chưa từng mua Lighthouse. Cách chắc chắn: đăng nhập trang mua và xem trang "Renewal" hoặc tài liệu giá chuẩn (https://www.tencentcloud.com/document/product/1103/47794, tôi chưa đọc được).

## 9. Có đáng so với OVH VPS-1 4GB không
| | Tencent 2GB | OVH VPS-1 4GB (kế hoạch hiện tại) |
|---|---|---|
| RAM / ổ | 2GB / 40GB | 4GB / (ổ lớn hơn, theo kế hoạch) |
| Giá năm 1 | ~$10 | ~$4,5/tháng ≈ $54/năm (theo báo cáo trước) |
| Giá năm 2 | chưa biết, có thể ≥ $50 | ổn định |
| Công thêm | nhiều điều chỉnh ở mục 3-5; ít chỗ thở | ít điều chỉnh |
| Hợp với "dữ liệu an toàn số 1" | yếu hơn (ổ nhỏ, RAM nhỏ, giá gia hạn mờ) | tốt hơn |

Chênh năm đầu chỉ ~$44 (~1,1 triệu đồng), còn năm sau có thể bằng hoặc hơn. Tiết kiệm đó nhỏ so với rủi ro mất dữ liệu/đứng hệ thống. **Khuyến nghị**:
1. Production chính: OVH VPS-1 4GB (như kế hoạch), áp dụng chính các điều chỉnh ở mục 3-6 (swap, giới hạn bộ nhớ, backup ra ngoài ổ, OCR trên PC), vì chúng cũng có lợi cho 4GB.
2. Nếu vẫn muốn dùng Tencent $10: dùng làm **node thứ hai độc lập** để nhận bản sao lưu/khôi phục (restore sẵn từ dump hằng tuần) hoặc làm môi trường thử. Như vậy dữ liệu có thêm một bản ở nhà cung cấp khác, đúng ưu tiên an toàn.
3. Chỉ chọn Tencent 2GB làm máy chính nếu ngân sách là yếu tố quyết định, kèm điều kiện: OCR/chỉ mục 200GB làm ngoài, mở tìm kiếm tài liệu cũ sau cùng và đo p95, backup R2 + PC, và sẵn sàng nâng gói/chuyển sang OVH khi p95 xấu.

## 10. Việc nên làm trước khi mua (rẻ, trên giấy hoặc thử nhanh)
- Mua gói tháng $1,68 (nếu còn) thử đúng cấu hình trong mục 3 với dữ liệu giả 30k hồ sơ, đo RAM thật của web/API/Postgres và `dms_index_ensure`, rồi mới quyết gói năm. (Chưa làm; chờ anh/chị đồng ý.)
- Xác nhận trên trang mua: giá gia hạn, băng thông, một khuyến mãi/tài khoản.
- Nếu đi tiếp: tôi soạn `docker-compose.yml`, cấu hình Postgres, script backup và workflow CD (cần anh/chị duyệt trước khi tạo PR).

## 11. Nếu tách CSDL ra khỏi Lighthouse có chạy ổn không (bổ sung 12/11/2026)
Dựa trên số đo cũ: Postgres giới hạn 2 CPU / 2,5GB, dữ liệu 1/5 quy mô, 20 người đồng thời p95 ước 0,6-0,85s (đã nhân 2-2,5 lần cho tốc độ CPU VPS). Phần dưới là suy luận từ đó, **chưa đo trên máy thật**; các giới hạn gói miễn phí của Neon/Supabase là theo hiểu biết của tôi, chưa tra lại hôm nay, cần kiểm trước khi quyết.

### 11.1 Kết luận ngắn
- **Tách DB sang một máy thứ hai cùng vùng (Singapore) thì Lighthouse chạy ổn hơn nhiều**: máy ứng dụng chỉ còn web + API + Caddy (~0,8-1GB), dư ~1GB; máy DB có trọn 2GB cho Postgres (không tranh RAM với Next.js/OCR). Cấu hình này gần với bài đo cũ (Postgres 2 CPU/2,5GB) nhất.
- **DB miễn phí (Neon/Supabase free) không dùng được cho production**: dung lượng free chỉ cỡ 0,5GB mỗi dự án, còn CSDL của ta ~3GB (chưa OCR cũ) đến 10-13GB (có OCR cũ); gói miễn phí có thể tự tạm dừng khi ít dùng, không cam kết dịch vụ, sao lưu/khôi phục ngắn hạn. Chỉ hợp cho môi trường dev.
- **DB thuê trả phí (Neon/Supabase/RDS...) vượt ngân sách** (~$20-25/tháng trở lên so với trần ~$118/năm).
- **DB ở xa (khác vùng/quốc gia) là lựa chọn tệ**: xem độ trễ bên dưới.
- Tách DB **giải quyết RAM, không giải quyết ổ 40GB, OCR 200GB hay backup**, và thêm một điểm hỏng. Tính tổng, **không rẻ/an toàn hơn một VPS 4GB duy nhất** (OVH VPS-1).

### 11.2 Độ trễ (quan trọng vì mỗi lần gọi DB nhiều vòng)
Mã API chạy mỗi truy vấn trong một giao dịch: `BEGIN` → `set_config(app.tenant_id)` → truy vấn → `COMMIT` (xem `inTenant` ở `apps/api/src/ocr/worker.ts`, cùng khuôn với API; RLS cần đặt tenant mỗi giao dịch) = **khoảng 4 vòng đi-về cho mỗi truy vấn**. Một trang danh sách thường vài truy vấn.

| DB đặt ở | RTT từ API đến DB (ước lượng) | Thêm mỗi truy vấn (4 vòng) | Nhận xét |
|---|---|---|---|
| Cùng máy (hiện tại) | <0,5ms | ~0 | tốt nhất |
| Máy thứ hai cùng vùng Singapore (qua IP công cộng + TLS) | ~1-3ms | ~5-15ms | **chấp nhận được** |
| DB trên đám mây khác nhưng cùng thành phố Singapore | ~2-6ms | ~10-25ms | chấp nhận được |
| API ở Singapore, DB ở Mỹ/Châu Âu | 150-250ms | **0,6-1s mỗi truy vấn** | **không dùng được** |
| API/web ở Singapore, người dùng ở Việt Nam | trình duyệt → web ~30-60ms | | luôn có, không đổi dù DB ở đâu |

Nên **đặt web, API và DB cùng một vùng**, và vùng đó gần Việt Nam (Singapore). Người dùng ở Việt Nam đến Singapore ~30-60ms; điều này đúng với mọi phương án và không phụ thuộc DB. (Số RTT trên là ước lượng kiểu thường gặp, chưa ping thật.)

### 11.3 Các phương án tách DB
**A. Hai Lighthouse cùng vùng Singapore** (một máy ứng dụng + một máy DB)
- Máy ứng dụng 2GB: HĐH ~300MB, Caddy ~30MB, web ~300MB, API ~150MB (≈0,8GB). Còn ~1,2GB (kể cả swap thì rộng hơn). Dư cho cron nhẹ và OCR hồ sơ mới (một tiến trình Tesseract 200-400MB, ước lượng) trong giờ vắng; **OCR tài liệu cũ vẫn làm trên PC** (mục 5), vì `store.get` đọc cả tệp vào RAM.
- Máy DB 2GB: HĐH ~250MB, Postgres có thể đặt `shared_buffers=512MB`, `effective_cache_size=1,2GB`, phần còn lại là cache tệp. Ổ 40GB gần như dành riêng cho DB + WAL + dump tạm (không chứa image web/API), nên dư chỗ hơn mục 6 chừng 5-8GB.
- Bảo mật: cổng 5432 không mở công khai; chỉ cho IP của máy ứng dụng (firewall của Lighthouse) và bắt buộc TLS + vai `legal_app`, hoặc dùng đường hầm SSH/WireGuard giữa hai máy (khuyên dùng WireGuard để không lộ cổng DB).
- Hai máy cùng một nhà cung cấp nên cùng chịu một sự cố/chính sách; vẫn cần bản sao ở nơi khác (R2 + PC).

**B. DB trên OVH VPS-1 4GB, web/API trên Tencent 2GB**: có thể, nhưng khi đã trả OVH VPS-1 thì chạy luôn cả web/API trên đó rẻ và đơn giản hơn (khớp kế hoạch hiện tại); Tencent chỉ còn vai máy phụ/sao lưu. Đồng thời chéo nhà cung cấp tăng RTT và độ phức tạp.

**C. DB miễn phí Neon/Supabase**: không đủ dung lượng, có thể tự tạm dừng (lần gọi đầu chậm), pooler giao dịch của họ có thể không hợp với khoá advisory của bước migration (`migrate.cli`), và dữ liệu pháp lý nằm ở bên thứ ba không cam kết. Chỉ dùng cho dev. (Chưa kiểm hỗ trợ `pg_trgm`/`SECURITY DEFINER`/RLS ở các gói đó; Neon và Supabase nói chung có `pg_trgm`.)

**D. DB thuê trả phí**: dễ vận hành và có backup/khôi phục điểm thời gian, nhưng giá vượt trần ngân sách của anh/chị.

### 11.4 Rủi ro mất dữ liệu và backup khi tách
- Có **hai điểm hỏng** thay vì một: máy DB chết thì mọi người dùng dừng; máy ứng dụng chết thì dữ liệu vẫn nguyên (an toàn hơn cho dữ liệu, tệ hơn cho thời gian hoạt động).
- Mạng giữa hai máy đứt: API báo lỗi; cần `restart: unless-stopped` và cảnh báo khi `/health` lỗi.
- Backup chỉ cần ở máy DB: giống mục 6 (`pg_dump | zstd | rclone rcat` đêm lên bucket R2 riêng + một bản hằng tuần về PC + diễn tập khôi phục); ổ DB rộng hơn nên có thể giữ thêm 1-2 bản dump gần nhất tại chỗ để khôi phục nhanh.
- Giới hạn không đổi: tìm kiếm trên 200GB vẫn là rủi ro số 1 vì cache DB còn ~1GB so với DB 10GB+ (mục 7, rủi ro 1); máy DB riêng chỉ tốt hơn cho cache và CPU, không biến thành cache đủ.

### 11.5 Chi phí tổng (1 năm, thô; 1 USD ≈ 25.000đ; chưa gồm tên miền, R2 tệp đã có)
| Phương án | Năm 1 | Năm 2 | Ghi chú |
|---|---|---|---|
| 1 Tencent 2GB (tất cả trong một) | ~$10 (≈0,25 triệu) | chưa biết, có thể ~$50 | rủi ro RAM cao nhất |
| **2 Tencent 2GB (A: ứng dụng + DB)** | **~$20 (≈0,5 triệu)** | chưa biết, tới ~$100 nếu về giá niêm yết (≈2,5 triệu) | chạy ổn hơn; gần trần ngân sách nếu năm 2 lên giá; khuyến mãi có thể giới hạn mỗi tài khoản/lần |
| 1 OVH VPS-1 4GB (kế hoạch hiện tại) | ~$54 (≈1,35 triệu) | ổn định | đơn giản nhất, ít điểm hỏng |
| DB miễn phí Neon/Supabase + 1 Tencent | ~$10 | | **không dùng được** cho production (dung lượng) |
| DB thuê trả phí + 1 Tencent | ≥ $230 | | vượt ngân sách |
Cộng thêm cho mọi phương án: bucket R2 sao lưu (vài USD/năm tuỳ dung lượng dump; ước lượng, chưa tính chi tiết).

### 11.6 Khuyến nghị cập nhật
1. Nếu **bắt buộc dùng Tencent**: chọn **phương án A (hai máy cùng Singapore, nối bằng WireGuard)**, không dùng DB miễn phí/ở xa. Chạy ổn cho 20 người; OCR/chỉ mục 200GB làm trên PC; mở tìm kiếm tài liệu cũ sau cùng và đo p95.
2. Nếu **ưu tiên an toàn và đơn giản**: một OVH VPS-1 4GB như kế hoạch; Tencent $10 làm bản sao/dự phòng (mục 9).
3. Trước khi chốt A, thử tháng ($1,68) hai máy với dữ liệu giả 30k hồ sơ để đo RAM thật và RTT giữa hai máy (ping + một truy vấn danh sách).

## 12. Kiến trúc đề xuất cho 2 gói đang có thể mua (12/11/2026)
Hai gói: **Tencent Lighthouse 2 vCPU/2GB** ($10,08 năm đầu; tham chiếu năm 2 $50,40, không cam kết) và **Alibaba Cloud SAS 2 vCPU/1GB** ($9,90 năm đầu; năm 2 chưa công bố). Tổng năm đầu ~$20 (≈ 0,52 triệu). Chưa xác minh: vùng của Alibaba SAS, dung lượng ổ, băng thông, có bị giới hạn CPU không. **Cả hai phải cùng Singapore** (xem 11.2), nếu khác vùng thì phương án này hỏng.

### 12.1 Nguyên tắc thiết kế
1. **Máy ứng dụng không giữ dữ liệu (stateless)**: dựng lại từ image trong vài phút; chuyển nhà cung cấp năm 2 dễ.
2. **Mọi dữ liệu quý nằm ở 3 nơi độc lập**: Postgres (máy DB), R2 (tệp + dump), PC/ổ ngoài của anh/chị.
3. **Việc nặng ra khỏi server**: build ở GitHub, OCR/chỉ mục 200GB trên PC.
4. **Có đường lui**: giá năm 2 tăng thì chuyển sang OVH VPS-1 (một máy 4GB) bằng dump/restore + đổi DNS.

### 12.2 Phân vai
| Máy | Vai | Chạy | RAM ước lượng |
|---|---|---|---|
| **Tencent 2GB** | **Máy DB** (chỉ Postgres) | Postgres 17, WireGuard, cron backup, node-exporter nhẹ | HĐH ~250MB + Postgres (`shared_buffers` 512MB) → còn ~1GB cache tệp |
| **Alibaba 1GB** | **Máy ứng dụng** | Caddy, `lo-web` (Next.js), `lo-api` (NestJS), WireGuard | HĐH ~250MB + Caddy 30 + web ~250 (`--max-old-space-size=192`) + API ~120 (`--max-old-space-size=128`) ≈ 650-700MB, swap 1GB |
| PC của anh/chị | Nhập + OCR + chỉ mục + bản sao | `lo-import`, worker OCR (`LEGACY_OCR_ENABLED=1`), kéo backup tuần | không giới hạn |
| R2 | Tệp (bucket `lo-files`, Bucket Lock) + bucket backup riêng | | |
| GitHub | CI build image (GHCR) + CD qua SSH | | |

Lý do đặt Tencent 2GB làm máy DB: Postgres cần RAM cache nhiều nhất (rủi ro số 1 ở mục 7), còn web+API vừa đủ trong 1GB. Máy 1GB không đủ để chạy DB 10GB+ nên không đặt DB ở đó.

### 12.3 Sơ đồ
```
Trình duyệt (Việt Nam)
    │ HTTPS (~30-60ms)
    ▼
[Alibaba 1GB, Singapore]  Caddy ─► lo-web (3000) ─► lo-api (3001)
    │  WireGuard 10.8.0.1 ↔ 10.8.0.2 (UDP)                 │
    ▼                                                      │ presign PUT/GET
[Tencent 2GB, Singapore]  Postgres 17 (chỉ nghe 10.8.0.2)  ▼
    │ cron: pg_dump | zstd | rclone ──► R2 bucket backup   Cloudflare R2: lo-files (Bucket Lock)
    │                                                       ▲
PC anh/chị: lo-import ──────────────────────────────────────┘ (tải thẳng R2 qua presign của API)
            worker OCR ── SSH/WireGuard tới Postgres (5433→5432) + khoá R2
            kéo dump tuần từ R2 về ổ ngoài
```

### 12.4 Cấu hình then chốt
**Mạng/bảo mật**
- WireGuard giữa hai máy (UDP 51820, chỉ nhận từ IP kia). Postgres nghe **chỉ** `10.8.0.2`, `pg_hba` cho `10.8.0.1/32`, vai `legal_app` (không superuser, không BYPASSRLS), thêm TLS nếu muốn.
- Tường lửa Lighthouse/SAS: máy DB chỉ mở SSH (khoá, đổi cổng) + UDP 51820; máy ứng dụng mở 80/443 + SSH + 51820. Đóng cổng 5432 hoàn toàn ra Internet. SSH chỉ bằng khoá, `fail2ban`.
- Bí mật (`DATABASE_URL`, khoá R2, `MIGRATE_DATABASE_URL`) chỉ ở file `.env` quyền 600 trên server và secrets GitHub; không đưa vào repo/image.

**Máy ứng dụng (1GB)**: `docker-compose.yml` với `caddy`, `web`, `api`; `mem_limit` 64m/320m/224m; swap 1GB, `swappiness=10`; `restart: unless-stopped`; `API_URL=http://api:3001` lúc build `web`. `TRUST_PROXY=1`, `WEB_ORIGIN=https://thihanhandansuhaibatrung.vn`. Pool kết nối API mặc định 10 là đủ. Migration tự áp khi API khởi động qua `MIGRATE_DATABASE_URL` (chủ DB, chỉ qua WireGuard).

**Máy DB (2GB)**: Postgres cài trực tiếp (apt) hoặc Docker với `mem_limit 1g`; `shared_buffers=512MB`, `effective_cache_size=1,2GB`, `work_mem=4MB`, `maintenance_work_mem=128MB`, `max_connections=30`, `wal_compression=on`, `max_wal_size=1GB`, `random_page_cost=1.1`; swap 2GB; `oom_score_adj=-900` cho Postgres. Ổ 40GB dành cho DB + WAL + 1-2 bản dump gần nhất.

**Việc định kỳ** (cron trên máy DB hoặc ứng dụng chạy `docker run --rm`): nhắc hạn, dọn scan (`scan-purge`, xoá sau 30 ngày), backup đêm, báo khi ổ >75% hoặc RAM/swap bất thường.

**OCR hồ sơ mới**: chạy trên PC cùng worker (bật cả `LEGACY_OCR_ENABLED` cho tài liệu cũ), hoặc nếu muốn chạy tự động thì cron `OCR_ONCE=1` trên máy DB giới hạn `--cpus=1 --memory=512m` ngoài giờ làm; không đặt OCR trên máy 1GB.

### 12.5 CI/CD
GitHub Actions: build `api` và `web` (Dockerfile có sẵn đích `api`, `web`) → đẩy GHCR → SSH vào máy ứng dụng chạy `docker compose pull && docker compose up -d`. API tự migrate lúc lên; rollback bằng cách chạy lại tag cũ (migration chỉ thêm, tương thích ngược theo quy ước repo). Không build trên server 1GB. Thời gian ngừng vài giây mỗi lần deploy (đã chấp nhận).

### 12.6 Sao lưu (3 nơi)
1. **Đêm 02:00 (máy DB)**: `pg_dump -Fc | zstd | rclone rcat r2-backup:db/YYYY-MM-DD.dump.zst`, khoá R2 **riêng** chỉ ghi bucket backup (không xoá được ngoài lifecycle). Giữ 14 ngày + 8 tuần.
2. **Hằng tuần**: PC kéo dump mới nhất về ổ ngoài; mỗi tháng **diễn tập khôi phục** vào Postgres trên PC, đối chiếu số hồ sơ/tệp.
3. **Tệp**: ở R2 có Bucket Lock; bucket backup tách khỏi bucket tệp.
4. (Tuỳ chọn) lưu WAL liên tục lên R2 để khôi phục theo thời điểm.
Mất cả hai máy cùng lúc: dựng VPS mới (OVH), `pg_restore` từ R2, trỏ DNS lại; thời gian khôi phục ước tính vài chục phút đến vài giờ theo cỡ DB.

### 12.7 Thứ tự triển khai
1. Xác nhận trên trang mua: **vùng (Singapore) của cả hai**, ổ đĩa/băng thông Alibaba, giá gia hạn. Mua gói tháng thử nếu có.
2. Dựng WireGuard, đo `ping`/RTT và một truy vấn danh sách giữa hai máy (kỳ vọng RTT <5ms).
3. Dựng Postgres + migration + dữ liệu giả 30k hồ sơ; đo RAM và `dms_index_ensure`; chỉnh cấu hình.
4. Dựng app + Caddy + domain; CI/CD; backup + diễn tập khôi phục.
5. Nhập thật bằng `lo-import` từ PC → OCR → dựng chỉ mục (tạm dừng web) → mở tìm kiếm tài liệu cũ → theo dõi p95.
6. Trước hết hạn năm 1 (~tháng thứ 10): quyết định gia hạn hay chuyển OVH (dump/restore + DNS).

### 12.8 Rủi ro còn lại của thiết kế này
- Máy ứng dụng 1GB sát RAM: web/API có thể bị OOM nếu Next.js tăng; giảm bằng giới hạn bộ nhớ + swap, giám sát; nếu hay chết thì chuyển web sang máy DB (còn dư) hoặc nâng gói.
- Cache DB chỉ ~1GB: tìm kiếm trên 200GB có thể chậm (rủi ro số 1, chưa đo).
- Hai nhà cung cấp, hai điểm hỏng: máy DB chết = ngừng toàn hệ thống (dữ liệu vẫn an toàn nhờ R2/PC).
- Khuyến mãi "không cam kết" năm 2 và có thể giới hạn mỗi tài khoản; Alibaba SAS 1GB chưa rõ chính sách CPU. Đường lui OVH luôn phải sẵn sàng.
- Chưa đo gì trên hai máy này; mọi số RAM/độ trễ là ước lượng.

## 13. Số đo THẬT trên server Tencent 2 vCPU/2GB (12/11/2026)
Máy: Ubuntu 22.04, AMD EPYC 7K62 (KVM), RAM 1,9GB, swap 2GB (swappiness 10), ổ 40GB. Postgres 17.11 (`shared_buffers` 256MB, `effective_cache_size` 768MB, `work_mem` 4MB, `max_connections` 30), Node 22, mã nguồn `main` (f5bbb62), 123 migration chạy OK (115 policy RLS). Dữ liệu GIẢ, DB cách ly `lo_bench`: 30.000 hồ sơ, 120.000 tài liệu, 360.000 tệp, 296.416 bản OCR; nạp 10m28s; DB 1,9GB → 2,46GB sau chỉ mục.

**Truy vấn SQL (1 người, vai không superuser, RLS có hiệu lực):**
- Dựng chỉ mục lần đầu `dms_index_ensure`: **124,5s** (laptop 181s).
- List trang 1 p50 ~9ms; list mọi miền (admin) p50 54 / p95 89ms; tìm tên p50 ~21ms; tìm nội dung OCR p50 35-78 / p95 87-105ms (tổ hợp nặng nhất p95 189ms).
- Đếm bộ lọc mọi miền (nặng nhất): p50 206 / p95 238ms (laptop 507ms).

**20 người đồng thời qua HTTP** (script tự viết, auth tổng hợp chỉ để đo, đã tắt; 0 lỗi mọi kịch bản):
| Kịch bản | req/s | p50 | p95 | p99 |
|---|---|---|---|---|
| API trực tiếp, thực tế (1 IP, nghỉ 3-6s) | 6,8 | 24ms | 311ms | 552ms |
| API trực tiếp, nặng (20 IP, nghỉ 0,2-1s) | 30 | 42ms | 223ms | 413ms |
| Qua web Next, thực tế | ~7 | 34ms | 1120ms (lượt đầu sau bật web) | |
| Qua web Next, nặng | 28,6 | 69ms | 384ms | 668ms |

**RAM lúc tải:** API ~125-170MB, web ~154MB; RAM available thấp nhất ~609-650MB; swap dùng ~218MB (tăng chủ yếu do build web, không tăng thêm lúc tải); không thấy swap thrash.
**Build web trên server:** 67s nhưng RAM available tụt xuống ~93MB: **không build trên server** (dùng CI/GHCR như kế hoạch).

**Phát hiện cần xử lý trước khi lên production:**
1. **Giới hạn 600 request/phút/IP** (`apps/api/src/http/hardening.ts`, bộ đếm trong bộ nhớ). Văn phòng 20 người cùng một IP công cộng = 10 req/s cho cả nhóm. Lần đo đầu (31 req/s từ 1 IP) bị 429 một nửa. Tải thực tế 6,8 req/s qua được nhưng dễ chạm trần khi mở nhiều tab. Đề xuất: sửa mã để giới hạn này cấu hình được bằng biến môi trường và đặt cao hơn cho đường đọc; cần chủ dự án duyệt. (Chưa sửa.)
2. Dư địa RAM mỏng (available ~600MB lúc tải, swap đã dùng ~200MB): cần giám sát và cảnh báo.
3. Dữ liệu đo mới là 1/5 quy mô; chưa đo 150k hồ sơ (cỡ 200GB), cache DB sẽ nhỏ hơn nhiều so với DB 10GB+.

**Chưa đo:** đủ 150k hồ sơ, OCR trên scan A4 thật, thêm Caddy/HTTPS trong đường đo, các bước import/ghi dữ liệu thật của người dùng, p95 trong 24 giờ thực tế, hiệu năng sau reboot.

## 14. Số đo THẬT ở quy mô 150.000 hồ sơ giả (12/11/2026)
Cùng máy Tencent 2 vCPU/2GB, Postgres 17 (`shared_buffers` 256MB). Dữ liệu giả cách ly `lo_bench` (đã xoá sau khi đo, không đụng `legal_office`): **150.000 hồ sơ, 300.000 tài liệu, 900.000 tệp/phiên bản, 742.208 dòng OCR. DB chỉ 4,79GB** sau chỉ mục (không phải 10-13GB như tôi ước ở mục 6; "200GB" là dung lượng tệp scan trên R2, không nằm trong DB). Ổ không xuống dưới 22GB trống.

**Dựng:** nạp bảng hồ sơ/tài liệu/tệp ~13 phút; nạp OCR ~9 phút (sau khi tắt tạm trigger); `dms_index_ensure` **5 phút 31 giây**; VACUUM ANALYZE 15s.
**Phát hiện vận hành:** nạp OCR hàng loạt vào bảng chưa ANALYZE khi trigger `dms_osi_ocr_trg` bật chạy rất chậm (~40 dòng/giây, chậm dần, ngoại suy hàng giờ). Khi nhập 200GB cần nạp theo lô, ANALYZE giữa chừng, hoặc tắt trigger rồi dựng chỉ mục bằng `dms_index_ensure`.

**Truy vấn SQL, 1 người, cache nóng, p50/p95:** list trang 1 ~14/16ms; list mọi miền admin 223/239ms; tìm tên admin 93/102ms; tìm nội dung OCR admin 271/318ms (từ hiếm 193/304ms); đếm bộ lọc mọi miền **admin 1262/1570ms**, văn thư 1064/1101ms (nặng nhất, tăng ~6 lần so với 30k hồ sơ).
**20 người đồng thời qua HTTP (0 lỗi):**
| Kịch bản | req/s | p50 | p95 | p99 |
|---|---|---|---|---|
| API trực tiếp, thực tế (1 IP, nghỉ 3-6s) | 6,8 | 82ms | 1179ms | 1593ms |
| API trực tiếp, nặng (20 IP) | 23 | 173ms | 629ms | 1208ms |
| Qua web Next, nặng | 21,5 | 224ms | 833ms | 1190ms |
Đếm bộ lọc trong tải nặng: p50 ~380-500ms, p95 ~0,7-1s, tối đa 4,7-6,5s.
**Cache nguội** (lượt đầu sau khởi động lại Postgres / sau drop page cache OS): list trang 1 53ms / 2283ms; tìm tên 471ms / 2229ms; đếm bộ lọc mọi miền 2306ms / 2577ms; tìm nội dung 467ms / 1669ms. Sau reboot, mỗi truy vấn đầu mất ~1,5-2,6s; cần làm nóng bằng vài truy vấn sau khởi động.
**RAM lúc tải nặng:** available thấp nhất **552MB**, swap tăng tới ~350MB (không thấy thrash).

**Kết luận:** 2 vCPU/2GB **chịu được 20 người ở quy mô 150k hồ sơ về độ trễ** (p95 ~0,6-0,8s tải nặng, ~1,2s tải thực tế do cache nguội và đếm bộ lọc; 0 lỗi). Điểm yếu: đếm bộ lọc mọi miền (1,1-1,6s tĩnh), cache nguội sau khởi động, RAM mỏng (~550MB), build web phải ở CI. Nếu cần thêm dư địa: tăng `shared_buffers` khi có RAM, nâng lên 4GB, hoặc giới hạn/cache truy vấn đếm bộ lọc mọi miền trong mã. Chưa đo: scan A4 thật, chạy liên tục nhiều giờ, Caddy/HTTPS trong đường đo, ghi dữ liệu thật của người dùng.
