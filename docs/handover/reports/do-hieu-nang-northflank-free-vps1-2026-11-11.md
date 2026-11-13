# Đo hiệu năng để ước lượng OVH VPS-1 (11/11/2026)

Tên file giữ nguyên từ bản đầu (câu hỏi gốc là Northflank free). **Đã đổi hướng đo theo lựa chọn của anh/chị: chạy Docker giới hạn trên PC**, vì Northflank free không dựng được cấu hình giống VPS-1 (xem mục 1). Tải mục tiêu: **văn phòng 20 nhân viên**.

## Kết luận ngắn
- **Với 20 nhân viên, tầng cơ sở dữ liệu của VPS-1 (2 vCore, 4GB) dư sức cho thao tác thường ngày** (xem danh sách, lọc, tìm tên/số): ước lượng trên VPS-1 khoảng 30-100 ms mỗi truy vấn, kể cả khi 20 người bấm liên tục mỗi 2 giây.
- **Chỗ chậm là các truy vấn đếm bộ lọc không giới hạn miền ("facets all-domains")**: khoảng 0,5 s trên laptop đo, ước lượng 1-1,3 s trên VPS-1 với dữ liệu 1/5 quy mô 200GB. Quy mô đủ 200GB có thể chậm hơn nữa (chưa đo được, xem mục 5).
- **Con số trên là cận trên về tốc độ của PC, không phải số của VPS-1.** Đã quy đổi thô nhân 2-2,5 lần (mục 3); chưa kiểm chứng trên VPS-1 thật. Muốn chắc: thuê VPS-1 một tháng thử, hoặc chạy cùng script trên đó (`apps/api/bench/dms-scale`, đã có sẵn trong repo).
- Chưa đo: web Next.js, toàn chuỗi HTTP có đăng nhập, RAM tổng khi chạy đủ web + API + Postgres + OCR cùng lúc.

## 1. Vì sao không đo trên Northflank free
Gói Sandbox: 2 dịch vụ + 1 database + 2 job, tối đa $20 tài nguyên/tháng; docs ghi rõ không dùng production, cần phương thức thanh toán (trang giá ghi "không cần thẻ", docs ghi ngược lại). Một con 2 vCPU/4GB riêng đã $48/tháng. Project dev hiện có đã dùng hết chỗ free (OCR phải chạy dạng Cron Job). Container của tôi cũng bị chặn truy cập dev.nexagnet.com. Nguồn: https://northflank.com/pricing , https://northflank.com/docs/v1/application/billing/pricing-on-northflank

## 2. Cách đo
- Máy: Dell Latitude 5510 (i7-10610U, 4 nhân/8 luồng, laptop 15W dễ giảm xung), Docker Desktop (VM 8 CPU/8GB). Một số container khác của anh/chị (pocwf-*) tự chạy lúc Docker khởi động nên có thể làm số hơi xấu đi. **Không tắt turbo** (không đổi cài đặt nguồn của máy), nên số là cận trên.
- Postgres 17 trong Docker: `--cpus=2 --memory=2,5g`, `shared_buffers=768MB`, `effective_cache_size=1,5GB` (theo kế hoạch cho VPS-1; phần còn lại của 4GB dành cho web/API/hệ điều hành).
- Code: nhánh `main` mới nhất (commit f5bbb62), 123 migration. Dữ liệu GIẢ bằng `generate.sql` của repo, **30.000 hồ sơ, 120.000 tài liệu, 360.000 tệp, 296.000 văn bản OCR; DB 2GB**. Bản 150.000 hồ sơ (cỡ 200GB) bị kẹt hơn 40 phút ở bước nạp tệp trên 2 CPU, đã dừng, nên chỉ có 1/5 quy mô.
- Truy vấn: đúng các hàm DB mà API gọi (`dms_search_cases`, facets, tìm nội dung), chạy bằng vai không phải superuser nên RLS có hiệu lực. Đo một người (25 lần mỗi truy vấn) và 20 người đồng thời 60 giây (script mới `concurrent.mjs`, người dùng nghỉ giữa các thao tác).
- OCR: Tesseract 5.3 gói `vie`, giới hạn 1 CPU/1GB, trên ảnh mẫu của repo (89 từ).

## 3. Quy đổi sang VPS-1
Thread khác tra được: mỗi vCore VPS-1 bằng khoảng 40-55% một nhân i7 khi turbo (Geekbench 6 VPS-1: 727-965 một luồng; i7-10610U cao hơn nhiều; OVH không công bố chip thật, chỉ ghi "Intel Xeon", VM tự khai Haswell ~2,4GHz). Đó là **suy đoán thô**, nên tôi nhân **2 đến 2,5 lần** thời gian. Chi tiết: `chip-cpu-ovh-vps-2026-11-11.md`.

## 4. Kết quả

### 20 nhân viên đồng thời (Postgres 2 CPU, dữ liệu 1/5 quy mô)
| Kịch bản | Truy vấn/s | p50 đo | p95 đo | p99 đo | ước lượng VPS-1 p50 / p95 |
|---|---|---|---|---|---|
| 20 người, nghỉ ~2 s giữa 2 thao tác (~10 truy vấn/s) | 9,7 | 17,5 ms | 337 ms | 994 ms | 35-45 ms / 0,6-0,85 s |
| 20 người, nghỉ ~0,5 s (rất nặng, ~22/s) | 21,9 | 122 ms | 996 ms | 2,4 s | 0,25-0,3 s / 2-2,5 s |
| 20 người, nghỉ ~0,1 s (thử chịu tải, ~26/s) | 26,4 | 293 ms | 1,3 s | 4,0 s | quá tải, hàng đợi |
Không lỗi nào trong cả ba lần. Tải thực tế của 20 người ước chừng vài truy vấn/s (một thao tác mỗi 5-10 giây, mỗi trang vài truy vấn), nằm gần dòng đầu hoặc nhẹ hơn.

### Một người dùng (đo trên laptop, p50 / p95)
- Danh sách chính thức Vi bằng trang 1: 17 / 37 ms. Trang sâu (offset): 15 / 26 ms. Cursor giữa danh sách: 15 / 16 ms.
- Danh sách mọi miền, không lọc (quản trị): **105 / 156 ms**; văn thư 26 / 27 ms; THV 17 / 38 ms.
- Danh sách chờ sửa đổi (quản trị): 107 / 189 ms.
- Tìm theo tên / số hồ sơ: 8-15 ms (nhiều kịch bản trả 0 dòng vì bộ từ khoá mẫu tuned cho dữ liệu lớn hơn, nên chưa phản ánh đủ chi phí tìm kiếm).
- Đếm bộ lọc (facets): theo năm/miền 65-75 ms; **mọi miền không lọc: quản trị 507 / 736 ms**, văn thư 121 / 261 ms.
- Tìm nội dung OCR: 12-66 ms (cùng lưu ý 0 dòng).
Toàn bộ 60 dòng: `C:\Users\phung\lo-bench\bench-1user-b.txt` trên máy anh/chị.

### Khác
- **Dựng chỉ mục tìm kiếm lần đầu** (`dms_index_ensure`, tự chạy ở lần tìm đầu tiên sau khi có dữ liệu hoặc nâng cấp): 181 s ở 30k hồ sơ trên laptop. Ngoại suy tuyến tính ở 150k hồ sơ khoảng 15 phút laptop, **30-40 phút trên VPS-1**, và trong lúc đó mọi truy vấn của tenant có thể quá hạn (lần đầu tôi gặp đúng hiện tượng này: mọi truy vấn quá 20 s và bị hoàn tác). Cần chạy chủ động một lần sau khi nhập dữ liệu, ngoài giờ.
- **API NestJS nhàn rỗi**: ~93-97 MB RAM, `/health` ~22 ms/lượt (đo qua Docker Desktop nên có chi phí mạng ảo).
- **OCR Tesseract 1 CPU/1GB**: 1,9-3,7 s mỗi ảnh mẫu (trung bình ~2,6 s), RAM đỉnh ~90 MB. Ảnh mẫu nhỏ; trang A4 300dpi thật đông chữ sẽ lâu hơn, chưa đo. Quy đổi VPS-1: thêm 2-2,5 lần.
- Postgres dùng ~1,8-2,0 GiB trong giới hạn 2,5GiB khi tải (một phần là cache tệp).

## 5. Hạn chế đã biết (đánh giá VPS-1)
1. **RAM 4GB**: Postgres đã cần ~2GB để chạy dữ liệu 2GB; cộng web (Next.js thường 150-300MB, chưa đo), API ~100MB, Caddy, hệ điều hành và OCR 1GB, tổng sát 4GB. Cần swap/zram và giới hạn từng container như kế hoạch F. Không nên chạy OCR cùng lúc với giờ cao điểm.
2. **Quy mô 200GB**: DB sẽ lớn gấp ~5 lần bản đo (~10GB nếu giữ nguyên cách lưu văn bản OCR cũ), vượt xa RAM, nên cache nguội sẽ đọc NVMe nhiều; `LEGACY_OCR_ENABLED` tắt như kế hoạch giúp giảm mạnh. **Chưa đo được ở quy mô này**, nên các con số trên là của dữ liệu nhỏ hơn.
3. **2 vCore chia sẻ**: truy vấn nặng (facets không giới hạn) và OCR sẽ tranh CPU; 20 người bấm dồn có thể thấy trễ vài trăm ms đến vài giây ở p95.
4. **Ổ 40GB**: DB + WAL + backup tại chỗ + image Docker; cần theo dõi dung lượng.
5. Không RAID/ECC, một máy là một điểm hỏng (đã có backup 3-4 lớp trong kế hoạch F).
6. Lưu lượng 1TB/tháng ở Singapore (theo ghi chú của anh/chị, chưa xác minh): tệp đi thẳng từ R2 nên VPS chủ yếu phục vụ HTML/JSON, nhẹ.
7. Nạp dữ liệu giả cỡ 150k hồ sơ không xong trong 40+ phút trên 2 CPU: phản ánh chi phí chèn hàng loạt có chỉ mục/trigger, cần kế hoạch cho đợt nhập `lo-import` 200GB (chạy trên máy anh/chị rồi nạp vào production, đừng nạp qua VPS-1 nhỏ lúc giờ làm việc).

## 6. Việc nhỏ tìm thấy khi đo (cho đội dev)
- Clone repo trên Windows với `core.autocrlf=true` làm migration `0079` lỗi ("dms_list_documents không có gì để vá") vì file `.sql` bị đổi xuống dòng CRLF. Build Docker từ bản clone Windows cần `core.autocrlf=false`.
- Bản clone của tôi nằm ở `C:\Users\phung\lo-bench` (sạch, không đụng thư mục `legal-office` của anh/chị đang có thay đổi chưa commit và chậm 234 commit so với origin). Đã xoá container thử của tôi, Docker Desktop vẫn đang chạy; xoá thư mục `lo-bench` nếu không cần.

## 7. Nên làm tiếp (nếu cần chắc hơn)
- Đo lại ở 150k hồ sơ bằng máy có nhiều nhân hơn (nạp dữ liệu nhanh) rồi giới hạn 2 CPU lúc đo truy vấn.
- Thuê VPS-1 một tháng (~$4,5) chạy cùng script: cho số thật, rẻ hơn mọi cách quy đổi.
- Đo cả chuỗi web + API có đăng nhập, RAM tổng, và OCR trên trang A4 300dpi thật (dữ liệu giả).
