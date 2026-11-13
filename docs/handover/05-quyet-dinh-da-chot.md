# 05. Quyết định đã chốt và lý do

Quyết định nghiệp vụ trước 13/11 xem thêm nhãn 🔒 trong [handoff mục 2](../handoff/NGHIEP-VU-TOAN-DU-AN.md). Tệp này tập trung vào các quyết định hạ tầng, chi phí, dữ liệu từ 9/11 đến 13/11/2026 và những phương án đã bị loại. Người chốt là chủ dự án (phungviet) trừ khi ghi khác.

## 1. Ràng buộc nền

| Ràng buộc | Giá trị | Ghi chú |
|---|---|---|
| Ngân sách hạ tầng | **~3 triệu đồng/năm (~$118)** (chốt 11/11) | Là trần cho server + lưu trữ + sao lưu; R2 ~$36/năm nằm trong đó |
| Ưu tiên | **An toàn dữ liệu số 1**, rồi giá rẻ | Hồ sơ và sổ là bản ghi pháp lý, không tạo lại được |
| Người dùng | **20 nhân viên** | Tải thường ngày nhẹ |
| Vùng/dữ liệu trong nước | Không yêu cầu (9/11) | Vị trí server không quan trọng; nhưng xem rủi ro pháp lý ở tệp 06 |
| Downtime | Vài giây khi deploy là chấp nhận | Không cần HA/dự phòng nóng, nói rõ với khách |
| Khối lượng dữ liệu | 200GB tài liệu cũ của khách (R2); DB đo 150k hồ sơ chỉ ~4,8GB | |
| Tên miền | `thihanhandansuhaibatrung.vn` | Chủ dự án tự mua; DNS chưa trỏ |

## 2. Hạ tầng: dòng thời gian quyết định

| Ngày | Quyết định | Lý do |
|---|---|---|
| 5/11 | Hạ tầng dev trên Northflank free, dữ liệu giả | Chưa có production |
| 9/11 | **OVH VPS-1**, tự chạy Postgres, tệp trên R2, mua backup VPS OVH | Giá rẻ nhất là ưu tiên; vị trí không quan trọng |
| 9/11 | Bật **Bucket Lock** cho prefix `legacy/` (vô thời hạn) | Chống xóa nhầm/độc hại tài liệu cũ khi không có versioning |
| 11/11 | Xem xét phương án "cao cấp" (dedicated OVH Advance ~$200/tháng, HA có replica) | **Loại**: vượt xa ngân sách 3 triệu/năm; user chốt ngân sách nhỏ, 20 nhân viên |
| 11/11 | Đo trên laptop (Docker `--cpus=2`) thay vì Northflank free | Northflank free không dựng được cấu hình giống VPS-1, cần thẻ |
| 12/11 | So sánh giải pháp rẻ hơn VPS | **Loại** Fly/Railway/Render (đắt 2,5–7 lần), Neon/Supabase free (nhỏ, không backup), Cloudflare Workers+D1 (phải viết lại tầng dữ liệu, không có RLS/hàm PG), Oracle Always Free (thu hồi được, chỉ làm bản sao thứ 3), mini PC tại văn phòng, shared hosting |
| 12/11 | **Mua Tencent Lighthouse 2 vCPU/2GB/40GB Singapore** (~$10,08 năm đầu) làm máy production | Rẻ nhất; Alibaba SAS 1GB hết hàng Singapore; đo thực tế đạt |
| 12/11 | Chọn phương án **A: deploy thật** trên Tencent (sau khi đo 30k và 150k hồ sơ giả) | Đo đạt: p95 ~0,6–0,8s (nặng), 0 lỗi, RAM thấp nhất ~550MB |
| 13/11 | Snapshot, reboot, mở 80/443 đã xong; DNS để sau | |

**Lý do bỏ các lựa chọn khác (tóm tắt):**
- **Một máy 4GB (OVH VPS-1) vốn được khuyên cho độ an toàn**: nhưng giá Tencent năm đầu rẻ hơn và đo thực tế đạt. OVH vẫn là **đường lui** (dump/restore + đổi DNS) khi RAM hết, giá năm 2 Tencent tăng, hoặc cần 4GB.
- **Tách DB sang máy thứ hai** (Alibaba 1GB + Tencent 2GB qua WireGuard, hoặc Neon): không rẻ hơn/an toàn hơn một VPS 4GB; mỗi truy vấn API đi ~4 vòng tới DB nên RTT xa làm chậm; Neon trả phí ~$13–40/tháng vượt ngân sách. **Quyết định: chạy tất cả trên Tencent trước, đo, chỉ thêm máy thứ hai nếu cần**, và máy thứ hai chỉ nên ở vùng RTT thấp với Singapore (Kuala Lumpur > Jakarta > Bangkok).
- **Postgres managed gói free**: không đủ dữ liệu thật (Neon free 1GB/khôi phục 6 giờ; Supabase free không backup, tự ngưng).
- **Dedicated + replica/HA**: tốn $200–330/tháng + công vận hành, không cần cho 20 người.

Báo cáo: [reports/phuong-an-server-cao-cap-2026-11-11.md](reports/phuong-an-server-cao-cap-2026-11-11.md), [reports/so-sanh-giai-phap-re-hon-vps-2026-11-12.md](reports/so-sanh-giai-phap-re-hon-vps-2026-11-12.md), [reports/phuong-an-tencent-lighthouse-2gb-2026-11-12.md](reports/phuong-an-tencent-lighthouse-2gb-2026-11-12.md), [reports/ke-hoach-chuyen-production-ovhcloud-2026-11-09.md](reports/ke-hoach-chuyen-production-ovhcloud-2026-11-09.md).

## 3. Triển khai và vận hành

- **Docker Compose + Caddy + GHCR**; image build ở GitHub Actions, không build trên server (RAM). Postgres cài bằng apt trên host, không đóng Docker.
- **CD chạy tay** (`workflow_dispatch`), không tự deploy khi push `main`; trước migration lớn nên có sao lưu mới; rollback = tag cũ. Claude ssh và dựng CD; người dùng tạo khóa deploy và secret, **không gửi mật khẩu root vào chat**.
- Bí mật chỉ vào `.env` trên server (quyền 600) bằng `read -s`, **không bao giờ vào chat hoặc repo**.
- Giới hạn request theo IP cấu hình bằng env (đọc 3000/phút, ghi 600, đăng nhập 20): cả văn phòng ra Internet chung một IP (PR #437).
- Giám sát tối giản bằng cron + webhook tùy chọn (`monitor.sh`) do Claude chọn khi làm PR #438; giám sát uptime ngoài miễn phí (UptimeRobot...) vẫn là đề xuất chưa làm.

## 4. Dữ liệu và sao lưu

- **Tệp ở lại R2** (rẻ nhất; đổi sang B2 chỉ tiết kiệm ~0,5 triệu/năm, phải sửa `file-store.ts`, chưa kiểm tương thích Bucket Lock → báo cáo đề xuất không làm; chủ dự án đã chọn giữ R2).
- **Bucket Lock giữ vĩnh viễn** cho `legacy/` (đơn giản hơn gỡ/áp lại). Không khóa `dms/` (cron `scan-purge` xóa sau 30 ngày).
- Chủ dự án muốn **ít biện pháp khôi phục, đơn giản**: ba việc rút gọn còn lại sau khi mua backup (thử khôi phục, khóa Bucket Lock, cất khóa giải mã + `.env` ở 2 nơi), cộng dump đêm lên R2 và kéo về PC (xem tệp 03).
- Production là tenant MỚI: **không dùng lại DB dev**, **không chạy `tools/seed-demo`** trên production. *(Đề xuất của checklist 9/11, chưa chắc đã làm: chốt chặn để seed-demo từ chối khi `NODE_ENV=production`; dùng dev Northflank làm staging.)*

## 5. Nhập 200GB

Xem tệp 04 mục 3. Tóm tắt: ổ cứng của khách, chạy trên PC của chủ dự án thẳng vào production, chuyển server trước, giữ Bucket Lock, đã có văn bản đồng ý, không loại thư mục, không quét virus, OCR/tìm toàn bộ, Claude chọn thời điểm, trả ổ sau khi đủ tệp.

## 6. Sản phẩm (13/11)

- **Tống đạt Cách A** (1 hồ sơ = 1 dòng S-01; số = STT; bỏ `CASE-TD`; danh sách phẳng).
- **Bộ lọc theo nghiệp vụ**, không chủ yếu theo ngày; xuất Excel theo bộ lọc. Phần tìm kiếm để thanh tìm ở header lo (đang chờ duyệt thiết kế).
- **Giao diện tối giản**; bỏ giải thích thừa; gộp tab trùng ở chi tiết hồ sơ.
- **Dữ liệu dev chỉ là test**: Claude toàn quyền xóa/seed lại dev, nhưng migration trên dữ liệu thật phải có kế hoạch riêng.

## 7. Phương án đã loại (liệt kê để khỏi hỏi lại)

OVH dedicated/Public Cloud HA; Hetzner (không có datacenter châu Á); PaaS (Fly, Railway, Render); Neon/Supabase; Cloudflare Workers + D1; Oracle Always Free làm máy chính; mini PC tại văn phòng; shared hosting; Meilisearch/Typesense cho tìm kiếm (RAM 2GB); OCR bằng dịch vụ ngoài (không gửi dữ liệu thật ra ngoài); OCR 200GB trên VPS (40–60 ngày); gỡ rồi áp lại Bucket Lock lúc nhập; tự duyệt sửa đổi sau N giờ (bỏ 01/11); luồng đề xuất/duyệt đổi quyền (bỏ 04/11); đăng nhập bằng link email (bỏ 04/11); chuyển nameserver sang Cloudflare (chủ dự án quyết không).
