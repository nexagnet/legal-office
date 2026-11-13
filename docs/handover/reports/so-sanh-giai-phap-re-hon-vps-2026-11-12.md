# So sánh các giải pháp khác VPS có rẻ hơn không (12/11/2026)

Chỉ là phân tích, chưa mua hay đổi gì. Giá lấy từ trang nhà cung cấp ngày 12/11/2026, USD, chưa VAT, đổi 25.500đ/$. **Cần kiểm lại ở trang đặt hàng** trước khi quyết.

## 1. Mốc so sánh
Phương án F đã chốt (xem `phuong-an-server-cao-cap-2026-11-11.md`): OVH VPS-1 Singapore (2 vCore, 4GB, 40GB NVMe) ~$55/năm ≈ **1,4 triệu/năm**, chạy Caddy + web + API + Postgres bằng Docker Compose. Tệp 200GB nằm ở R2 (~$36/năm ≈ 0,9 triệu) và **khoản R2 này giống nhau ở mọi phương án dưới đây**, nên so sánh chỉ xét phần chạy app + Postgres. Tổng F ≈ 2,4 triệu/năm, trong ngân sách 3 triệu.

Yêu cầu của app: Postgres thuần SQL có RLS và hàm PG, NestJS + Next.js, OCR Tesseract, cron nền, văn phòng 20 người. Bài đo ngày 11/11 cho thấy 20 người dùng đồng thời vẫn ổn khi giới hạn 2 CPU.

## 2. Bảng tổng hợp (phần app + Postgres, chưa tính R2)
| Hướng | Chi phí/năm | Chạy được app + Postgres + OCR? | Rủi ro mất dữ liệu | Rẻ hơn VPS-1 (1,4tr)? |
|---|---|---|---|---|
| **OVH VPS-1 (mốc)** | ~1,4tr | Có (OCR cũ chạy ngoài) | Một máy, tự backup 4 lớp | — |
| Fly.io | ~3,5–4tr (2 máy shared-2x 2GB ≈ $11,4/tháng/máy; 1 máy ~3,5tr) | Có, nhưng Postgres tự chạy trên volume | Volume 1 vùng, snapshot 5 ngày mặc định; vẫn phải tự backup | **Không**, đắt hơn 2,5 lần |
| Railway | ~7–9tr (RAM $10/GB-tháng, CPU $20/vCPU-tháng; app + PG ~2GB RAM, 0,5 CPU ≈ $30/tháng) | Có | Volume 1 nơi, vẫn phải tự backup | **Không**, đắt 5–6 lần |
| Render | ~10tr (2 web <1 CPU $7×2 + Postgres 1GB $19 = $33/tháng) | Có nhưng RAM 512MB/dịch vụ rất sát cho NestJS và OCR | PITR 3 ngày (gói Hobby) | **Không**, đắt ~7 lần. Gói free (web 512MB ngủ; PG 256MB) không đủ |
| Neon (chỉ DB) | Free $0; Launch tính theo dùng, trang tự ghi ví dụ ~$15/tháng (~4,6tr) | Chỉ là DB, app vẫn cần chỗ chạy | Free chỉ khôi phục 6 giờ, 1GB/dự án; Launch PITR 7 ngày $0,20/GB | Free rẻ nhưng **không đủ**: 1GB, tạm ngưng khi hết 100 giờ CU; cộng thêm VPS thì chỉ đắt hơn |
| Supabase (chỉ DB) | Free $0; Pro $25/tháng ≈ 7,6tr | Chỉ là DB | Free: **không có backup**, tự tạm ngưng sau 1 tuần không dùng, 500MB; Pro: backup 7 ngày | **Không**. Free quá nhỏ và không backup; Pro đắt 5 lần |
| Cloudflare Workers + D1 + R2 | ~$5/tháng ≈ 1,5tr (gói Workers Paid) | **Không.** D1 là SQLite (tối đa 10GB/DB), không có RLS và hàm PG; Workers giới hạn CPU theo yêu cầu, không chạy Tesseract hay cron dài | Time Travel 30 ngày (tốt) | Chỉ rẻ trên giấy; phải **viết lại toàn bộ tầng dữ liệu**, chi phí công vượt xa khoản tiết kiệm |
| Oracle Cloud Always Free | $0 | Có thể: ARM, theo hai blog (chưa đối chiếu trang Oracle) đã giảm còn **2 OCPU / 12GB**, 200GB đĩa | **Cao nhất trong danh sách**: không SLA, bị thu hồi khi ít dùng, hay hết tài nguyên ("Out of host capacity"), chính sách thay đổi liên tục | Rẻ hơn 1,4tr nhưng **không nên làm máy chính** vì dữ liệu pháp lý. Chỉ cân nhắc làm nơi chép backup thứ 3 |
| VPS khác (Hostinger KVM 1) | 4GB, 50GB NVMe: 167.900đ/tháng nếu trả 24 tháng (≈2,0tr/năm), tự gia hạn 279.900đ/tháng (≈3,4tr/năm) | Có, cùng loại với OVH | Như VPS | **Không**, đắt hơn VPS-1 |
| VPS Việt Nam rẻ (VinaHost $3,07/tháng, UltaHost $4,8/tháng) | 1GB RAM — quá nhỏ | Không đủ RAM cho Postgres + API + web | — | Gói đủ dùng (4GB) không tra được giá |
| Mini PC tại văn phòng (N100 16GB 512GB) | Phần cứng ~$322 (giá bán lẻ Mỹ, giá VN chưa tra) ≈ 8,2tr một lần; chia 3 năm ≈ 2,7tr/năm, chưa tính điện, UPS, mạng | Có, dư sức | Mất điện, hỏng đĩa, cháy, mất cắp, mạng văn phòng đứt; không ai trực | **Không** trong 3 năm đầu; rủi ro lớn hơn |
| Shared hosting | Không tra được giá | **Không**: không chạy được Postgres tự cấu hình, tiến trình Node chạy dài và OCR | — | Không khả thi |

Ghi chú giá gốc: Fly shared-cpu-2x 2GB $11,39/tháng, volume $0,15/GB, snapshot $0,08/GB (10GB đầu miễn phí); Railway Hobby tối thiểu $5; Render Postgres 1GB $19 + $0,30/GB lưu trữ; Neon Launch $0,106/CU-giờ + $0,35/GB; Supabase Pro $25 gồm 8GB; D1 và Workers $5 tối thiểu.

## 3. Phân tích ngắn
- **PaaS (Fly, Railway, Render)** tính tiền theo RAM/CPU chạy liên tục, trong khi Postgres + API + web luôn bật nên đắt hơn VPS vài lần. Chúng đáng khi muốn đỡ vận hành, không phải khi muốn rẻ. Backup vẫn phải tự làm nên không thay được kế hoạch 4 lớp.
- **Postgres managed gói free** không đủ cho dữ liệu thật: Neon free 1GB và chỉ khôi phục 6 giờ, Supabase free không có backup và tự ngưng. Gói trả phí đắt hơn cả VPS-1 và vẫn thiếu chỗ chạy app.
- **Serverless Cloudflare** là hướng duy nhất có giá ngang VPS-1, nhưng app này dựa vào Postgres (RLS, hàm PG, tìm kiếm toàn văn) và OCR nên phải viết lại gần hết.
- **Oracle free** rẻ nhất nhưng là thứ duy nhất ở đây có thể mất cả máy mà không báo trước.
- **Mini PC** không rẻ hơn trong 3 năm và mọi rủi ro vật lý nằm ở văn phòng.

## 4. Kết luận và khuyến nghị
**Không có hướng nào vừa rẻ hơn OVH VPS-1 vừa giữ được độ an toàn dữ liệu.** VPS-1 (~1,4tr/năm cho phần chạy) đã gần mức sàn thực tế; các hướng "miễn phí" hoặc phải viết lại ứng dụng, hoặc không có backup, hoặc không đáng tin cho dữ liệu pháp lý. Giữ phương án F: VPS-1 Singapore + R2 + backup nhiều bản, tổng ~2,4tr/năm.

Chỗ còn có thể tiết kiệm nhỏ, chưa xác minh:
1. Dùng Oracle Always Free làm **bản sao backup thứ 3** thay vì trả tiền (chỉ nếu chấp nhận nó không đáng tin; không coi là bản chính).
2. Lưu tệp 200GB ở nhà cung cấp rẻ hơn R2 (ví dụ Backblaze B2, theo trí nhớ ~$6/TB-tháng, **chưa kiểm giá**) có thể giảm vài trăm nghìn/năm, nhưng phải sửa `file-store.ts` và kiểm tương thích Bucket Lock; không đáng nếu chỉ vì ~0,5 triệu.

## Chưa xác minh
- Giá Fly Managed Postgres (trang chuyển hướng nên không đọc được); thời hạn gói Postgres free của Render.
- Trang Oracle chính thức (số liệu 2 OCPU/12GB và chính sách thu hồi lấy từ blog tháng 6/2026) và việc Oracle có Singapore còn tài nguyên không.
- Giá mini PC tại Việt Nam, điện năng thực đo, giá shared hosting và VPS 4GB của các nhà cung cấp Việt Nam (Viettel IDC, Vietnix, AZDIGI không tra được).
- Giá Hostinger là giá khuyến mại 11.11, trả trước 24 tháng.
- Mức dùng RAM/CPU thật của app trên Railway/Fly là ước tính của tôi.

## Nguồn
- https://fly.io/docs/about/pricing/
- https://www.railway.com/pricing
- https://render.com/pricing.md
- https://neon.com/pricing và https://neon.com/docs/introduction/pro-plan
- https://supabase.com/pricing
- https://developers.cloudflare.com/d1/platform/pricing/ và https://developers.cloudflare.com/d1/platform/limits/
- https://terminalbytes.com/oracle-cloud-free-tier-changes-2026 và https://braindetox.kr/en/posts/oracle_always_free_tier_reduced_2026.html
- https://www.hostinger.com/vn/vps
- https://onedollarvps.com/vi/locations/vps-in-vietnam
- https://www.aztekcomputers.com/neo-z100-512-neo-z100-mini-pc-intel-n100-16gb-ram-512gb-ssd-minix/p
