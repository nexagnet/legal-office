# Phương án server cao cấp cho production (11/11/2026)

Chỉ là đề xuất, chưa mua gì. Phương án rẻ đã chốt trước đó (OVH VPS, xem `ke-hoach-chuyen-production-ovhcloud-2026-11-09.md`) vẫn là mốc so sánh. Giá lấy từ trang nhà cung cấp ngày 11/11/2026, chưa VAT, và **cần kiểm lại ở trang đặt hàng**. Đổi tiền tạm tính S$1 ≈ 0,77 USD, 1 EUR ≈ 1,08 USD.

## 1. Khối lượng cần phục vụ
- Web (Next.js) + API (NestJS) + Postgres 17 tự chạy + OCR Tesseract + cron nền.
- Tệp scan nằm trên R2 (bucket Lock), 200GB nhập một lần, OCR/tìm kiếm cho cả tệp cũ và mới.
- Một văn phòng thừa hành viên, vài chục người dùng cùng lúc là nhiều. **Tải thường ngày nhẹ**; chỗ nặng duy nhất là OCR hàng loạt 200GB (một lần) và Postgres cần RAM/NVMe tốt khi tìm kiếm toàn văn.
- Vì vậy "cao cấp" ở đây nên hiểu là **độ tin cậy và dư sức**, không phải cần nhiều CPU.

## 2. Giá đã tra được
| Sản phẩm | Cấu hình | Giá/tháng | Ghi chú |
|---|---|---|---|
| OVH VPS-2 (mốc cũ) | 4 vCore, 8GB, 75GB NVMe | ~$8,50 | đã chốt dòng VPS |
| OVH VPS-4 | 8 vCore, 24GB, 200GB NVMe | $23,37 | nấc VPS cao nhất |
| OVH Advance-1 (2026) | EPYC 4245P 6c/12t, 32GB DDR5 ECC, 2×960GB NVMe RAID1 | **$204** (+ phí lắp $204) | Singapore/Sydney/Mumbai có hạn mức lưu lượng |
| OVH Advance-2 (2024) | EPYC 4344P 8c/16t, 64GB, 2×960GB NVMe | **$198** (+ phí lắp $198) | đời cũ, 64GB |
| OVH Advance-3 (2024) | EPYC 4464P 12c/24t, 64GB, 2×960GB NVMe | $255 | |
| OVH Public Cloud b3-16 (SG) | 4 vCore, 16GB | S$112/tháng không cam kết (~$86); S$95,25 nếu cam kết 12 tháng | giá không cam kết là tôi tính 0,1535×730h |
| OVH Public Cloud b3-32 (SG) | 8 vCore, 32GB | S$224 (~$173); S$190 cam kết 12 tháng | |
| Hetzner AX42 | Ryzen 7 8700GE 8 nhân, 64GB DDR5 ECC, NVMe | €79–99 (+ phí lắp €49) | **không có datacenter châu Á** (Đức, Phần Lan) |
| Hetzner AX102 | Ryzen 9 7950X3D 16 nhân, 128GB ECC, 2×1,92TB NVMe | €159–259 (+ phí lắp €129) | như trên |

Lưu ý: OVH báo tăng giá dòng Advance (có hiệu lực với gói đang chạy từ 1/10/2026), trang không ghi giá trước/sau nên số trên coi là giá mới đang bán. Chưa tra được giá OVH Rise và Hetzner AX52. Public Cloud chưa tính volume/block storage và băng thông riêng.

## 3. Hai cấu hình đề xuất

### Phương án A: một máy dedicated mạnh + dự phòng nguội (khuyến nghị)
- **OVH Advance-1 hoặc Advance-2 tại Singapore** (cùng khu vực với kế hoạch cũ, độ trễ từ VN thấp). Advance-2 $198 có 64GB RAM nên thoải mái hơn Advance-1 $204 (32GB); nên hỏi OVH còn bán đời 2024 không.
- Chạy tất cả bằng Docker Compose như kế hoạch OVH: Caddy, web, api, Postgres, OCR. Có RAID1 NVMe (chịu hỏng 1 ổ), RAM ECC.
- Postgres: `pgBackRest` (full hằng ngày + WAL liên tục) ra **hai nơi**: OVH Object Storage và R2/bucket nhà cung cấp khác, giữ 30 ngày, mã hóa. RPO ≤ 15 phút.
- **VPS-2 làm máy dự phòng nguội** ($8,50, đã có kế hoạch): luôn sẵn compose, khôi phục từ backup khi máy chính hỏng. RTO ước 2–4 giờ, đã diễn tập.
- OCR 200GB chạy ngay trên máy này (6–8 nhân) vào ban đêm/ cuối tuần, không cần thuê máy riêng.
- Giám sát: Uptime Kuma ngoài máy + cảnh báo email/Telegram.
- **Chi phí: khoảng $215–230/tháng** (máy ~$200 + VPS dự phòng $8,5 + backup/Object Storage ~$5–10) và phí lắp một lần ~$200.

### Phương án B: tách app và DB, có replica (HA nhỏ)
- Máy 1 `app` (web, api, OCR, Caddy), máy 2 `db` (Postgres primary), máy 3 hoặc cùng máy 1 giữ replica streaming. Ví dụ Public Cloud: 2 × b3-16 + 1 × b3-16 hoặc dedicated ×2.
- Public Cloud (3 × b3-16, cam kết 12 tháng ~S$286 ≈ $220; không cam kết ~S$336 ≈ $260, chưa tính block storage 200GB+ và snapshot ~$20–40). Hoặc 2 × Hetzner AX42 (€158 ≈ $170 + phí lắp, nhưng ở châu Âu, độ trễ cao với người dùng VN).
- Failover tự chạy bằng Patroni/repmgr, hoặc chuyển tay; phần này **tốn công vận hành đáng kể** (thử failover, theo dõi lag, nâng cấp).
- **Chi phí: $250–330/tháng + công vận hành.**

## 4. So sánh nhanh
| | VPS-2 (đã chốt) | **A: 1 dedicated + dự phòng nguội** | B: tách + replica |
|---|---|---|---|
| Giá/tháng | ~$9–16 | ~$215–230 | ~$250–330 |
| RAM/ổ cứng | 8GB, 1 NVMe ảo | 32–64GB ECC, RAID1 NVMe | 3 × 16GB |
| Chịu hỏng 1 ổ đĩa | không | có | có |
| Chịu mất cả máy | khôi phục từ backup | khôi phục sang VPS dự phòng (vài giờ) | failover vài phút nếu cấu hình đúng |
| OCR 200GB | cần thuê máy riêng | chạy tại chỗ | chạy trên máy app |
| Độ phức tạp vận hành | thấp | thấp-vừa | **cao** |
| Hợp với 1 văn phòng | đủ | dư | quá mức |

## 5. Ưu và nhược
**A**: Ưu: gấp ~14–25 lần tài nguyên VPS-2 với vận hành gần như cũ, RAID + ECC bớt rủi ro phần cứng, OCR/tìm kiếm nhanh, không cần máy thuê ngắn hạn. Nhược: đắt hơn ~15–20 lần VPS; một máy vật lý vẫn là một điểm hỏng (giảm bằng backup 2 nơi + VPS dự phòng); phí lắp bằng 1 tháng; OVH Singapore có hạn mức lưu lượng (cần hỏi mức cụ thể, 200GB nhập chủ yếu đi vào R2 nên ít ảnh hưởng).
**B**: Ưu: gần như không mất dữ liệu và downtime ngắn khi một máy hỏng. Nhược: đắt nhất, công vận hành cao (người duy nhất vận hành là chúng ta), nhiều thành phần dễ cấu hình sai; HA không thay được backup (xóa nhầm vẫn nhân bản sang replica).

## 6. Khuyến nghị
**Chọn phương án A**, bắt đầu bằng OVH Advance tại Singapore, giữ VPS-2 làm dự phòng nguội. Lý do: khách là một văn phòng, rủi ro chính là **mất/ hỏng dữ liệu** chứ không phải quá tải hay downtime vài giờ; RAID1 + backup hai nơi + diễn tập khôi phục xử lý đúng rủi ro đó với chi phí hợp lý. Phương án B chỉ đáng khi khách đòi cam kết thời gian hoạt động (SLA) bằng văn bản.
Nếu muốn nấc trung gian rẻ hơn A: **OVH VPS-4 ($23,37, 24GB, 200GB NVMe)** + backup hai nơi, chưa có RAID/ECC nhưng đủ cho tải thực tế; vẫn nên thuê máy OCR ngắn hạn cho 200GB.
Lưu ý quyết định trước đó của anh/chị là "mục tiêu rẻ"; phương án cao cấp là lựa chọn thêm, không bắt buộc, và có thể **bắt đầu bằng VPS rồi nâng lên dedicated khi cần** (chuyển bằng backup/restore, vài giờ).

## 7. Cần anh/chị quyết
1. Giữ mục tiêu rẻ (VPS-2/VPS-4) hay lên A (~$220/tháng)?
2. Nếu lên A: đồng ý đặt ở Singapore (Advance), hay muốn Hetzner châu Âu rẻ hơn (~€79–159 nhưng độ trễ ~250ms, không có Châu Á)?
3. Khách có yêu cầu SLA/HA bằng văn bản không (quyết định có cần B)?
4. Ai đứng tên và thanh toán tài khoản OVH (tôi không mua thay).

## Chưa xác minh
- Giá OVH Rise và Hetzner AX52; giá cuối sau tăng giá OVH; phí block storage của Public Cloud.
- Hạn mức lưu lượng cụ thể của Advance tại Singapore.
- Còn bán Advance đời 2024 tại Singapore không.
- Tương thích S3 của OVH với `lo-import` (xem báo cáo OVH).

## Nguồn
- https://us.ovhcloud.com/bare-metal/advance/
- https://us.ovhcloud.com/resources/blog/dedicated-servers-price-change-for-the-second-half-of-2026/
- https://www.ovhcloud.com/en-sg/public-cloud/prices/
- https://www.hetzner.com/dedicated-rootserver/matrix-ax/

---
# Bổ sung: phương án ngân sách ~12 triệu/năm, ưu tiên an toàn dữ liệu (11/11/2026)

Ngân sách người dùng nêu: $50–100/tháng, sau đó 12 triệu đồng/năm (~$460, ~$38/tháng). Tỷ giá tạm tính 25.500đ/$, giá chưa VAT.

## Phương án C (khuyến nghị cho ngân sách này): OVH VPS-4 + sao lưu 3 lớp
- VPS-4 Singapore: 8 vCore, 24GB RAM, 200GB NVMe, $23,37/tháng.
- Lớp 1: Premium backup + snapshot của OVH (~$1,4 + ~$0,4/tháng).
- Lớp 2: Postgres sao lưu liên tục bằng pgBackRest (full hằng ngày + WAL, RPO ≤ 15 phút), mã hóa, giữ 30 ngày, ra OVH Object Storage.
- Lớp 3: bản sao Postgres thứ hai và bản sao tệp sang nhà cung cấp khác (R2 / bucket khác). Tệp chính ở R2 có Bucket Lock; thêm bản sao 200GB sang OVH Object Storage (~$1,6/tháng).
- Diễn tập khôi phục hằng quý, ghi vào checklist go-live.

| Khoản | USD/năm |
|---|---|
| VPS-4 | ~280 |
| Premium backup + snapshot | ~17 |
| Bản sao tệp 200GB sang OVH | ~19 |
| R2 lưu tệp chính 200GB | ~36 |
| Backup Postgres 2 nơi | ~10 |
| **Tổng** | **~360 (~9,2 triệu)**, dư ~2,5 triệu cho VAT/biến động |

Thêm VPS-2 dự phòng nguội ($100/năm) thì tổng sát 12 triệu.

**Hơn VPS-2:** RAM 24GB so với 8GB (Postgres, API, OCR không giành nhau), đĩa 200GB so với 75GB, 8 vCore so với 4, đủ chỗ cho sao lưu tại chỗ. **Chưa hơn:** không RAID/ECC, không SLA, vẫn nên thuê máy OCR ngắn hạn cho 200GB cũ.

## Phương án D: Hetzner AX42 (~$95–100/tháng, trên ngân sách 12 triệu)
8 nhân, 64GB ECC, 2×NVMe RAID, €79/tháng + €49 phí lắp. Chỉ có Đức/Phần Lan (độ trễ ~250ms). Backup vẫn ra OVH + R2. Chỉ hợp nếu coi trọng RAID/ECC hơn tốc độ.

## Phương án E (rẻ nhất): VPS-2 + sao lưu 3 lớp, ~6–7 triệu/năm
Cùng chính sách sao lưu như C, nhưng 8GB RAM sát khi OCR và tìm kiếm chạy cùng lúc.

Khuyến nghị cho ngân sách 12 triệu/năm: **C**.

---
# Bổ sung 2: thiết kế tối ưu chi phí, ngân sách 3 triệu/năm (~$118) (11/11/2026)

Người dùng xác nhận ngân sách **3 triệu đồng/năm**. Tỷ giá 25.500đ/$, chưa VAT.

## Phương án F: OVH VPS-1 Singapore, ~2,4 triệu/năm
- VPS-1 (2 vCore, 4GB, 40GB NVMe, ~$4,5/tháng) chạy Caddy + web + API + Postgres bằng Docker Compose, đặt ở Singapore (độ trễ ước 30–60ms).
- Tệp scan ở R2; trình duyệt tải thẳng bằng link ký sẵn nên 200GB không đi qua VPS.
- OCR tài liệu cũ **không chạy trên VPS** (`LEGACY_OCR_ENABLED` tắt); chạy một lần trên máy tính người dùng cùng lúc nhập 200GB. OCR tài liệu mới chạy trên VPS với giới hạn 1 nhân.
- Chỉnh cho 4GB RAM: `shared_buffers` ~768MB, swap/zram, giới hạn bộ nhớ từng container, nén gzip/brotli và cache tệp tĩnh ở Caddy.
- Sao lưu 4 bản gần như miễn phí: (1) backup hằng ngày của OVH, (2) pg_dump hằng đêm + WAL ra R2, (3) bản sao thứ hai ra nhà cung cấp khác (Backblaze B2 dưới 10GB), (4) bản nén định kỳ về máy người dùng. Diễn tập khôi phục một lần trước khi nhập dữ liệu thật. Gói miễn phí của R2/B2 là số nhớ, chưa kiểm lại.

| Khoản | USD/năm |
|---|---|
| VPS-1 Singapore | ~55 |
| R2 lưu tệp 200GB | ~36 |
| Backup Postgres (R2 + B2 trong gói miễn phí) | 0–5 |
| **Tổng** | **~95 (~2,4 triệu)** |

Đánh đổi: một máy, không RAID, không SLA, OCR 200GB bằng máy người dùng. Nếu 4GB thiếu khi chạy thật thì nâng lên VPS-2 (+~$50/năm, tổng ~3,6 triệu) mà không đổi cách dựng.
