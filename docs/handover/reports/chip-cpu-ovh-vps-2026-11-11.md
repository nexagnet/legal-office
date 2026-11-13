# Chip CPU của OVHcloud VPS (tra 2026-11-11)

## Kết luận ngắn
- OVH **không công bố** model chip cụ thể, xung nhịp, vCore là nhân hay luồng, hay tỷ lệ chia sẻ CPU. Trang OVH chỉ nói "Intel Xeon" (VPS Intel) hoặc "AMD EPYC" (VPS AMD, chỉ ở Local Zone, không thấy Singapore/Mỹ).
- "VPS 2027" là **tên dòng gói hiện hành**, không phải chip: VPS-1 (2 vCore/4GB/40GB NVMe), VPS-2 (4/8/75), VPS-3 (6/12/100), VPS-4 (8/24/200). Không có "2027" ở đời chip.
- Máy ảo tự khai là `Intel Core Processor (Haswell, no TSX)` ~2.4 GHz. Đây là tên CPU ảo giả lập chung của hypervisor, **không** phải chip vật lý thật (suy đoán: host là Xeon đời mới hơn). Nguồn: VPSBenchmarks (bên thứ ba), không phải OVH.
- vCore: khả năng cao là luồng (thread) của host, chia sẻ ("shared but isolated infrastructure", OVH). Suy đoán, OVH không nói rõ.

## So sánh với i7-10610U (PC người dùng)
| | i7-10610U | OVH VPS-1 2027 (2 vCore) |
|---|---|---|
| PassMark 1 luồng | 2201 | không có số PassMark |
| Geekbench 5 | 1244 / 4124 (technical.city) | không có |
| Geekbench 6 1 luồng | không tìm được số kiểm chứng | 727 (Reston US), 848 (Canada), 965 (Pháp)* |
| Geekbench 6 đa luồng | không tìm được số kiểm chứng | 1389 (US), 1514 (CA), 1659 (FR)* |
- Một máy OVH VPS "4-8-75" (Vint Hill, VA, tức loại 4 vCore): GB6 1047 / 3351. Một máy khác 4 vCore (11/2025): 870 / 2806.
- *Điểm Yabs Pháp/Canada: bảng hiển thị có số nhưng JSON cùng trang ghi null, chưa kiểm chứng. Số US (727/1389) khớp cả hai.
- Ước lượng thô (suy đoán, vì thiếu GB6 của i7 trên nguồn đọc được): mỗi vCore VPS-1 mạnh khoảng **40-55%** một nhân i7-10610U khi turbo (PassMark 1 luồng i7 cao do turbo 4.9 GHz; VPS khoảng 2.4 GHz cố định). Tổng VPS-1 (2 vCore) khoảng **1/3 - 1/4** i7-10610U; VPS-2 (4 vCore) khoảng 1/2 - 3/5 tổng.
- Hệ quả cho đo tải: test trên PC i7 chạy nhanh hơn VPS-1 nhiều lần ở 1 luồng; kết quả Northflank free chỉ nên dùng để so tương đối, kèm hệ số trên.

## Nguồn
- OVH VPS Intel: https://www.ovhcloud.com/en-sg/vps/vps-intel/
- OVH VPS AMD: https://www.ovhcloud.com/en-sg/vps/vps-amd/
- OVH VPS (gói 2027): https://www.ovhcloud.com/en/vps/
- VPSBenchmarks CPU: https://www.vpsbenchmarks.com/hosters/ovhcloud_us/cpus
- Yabs US: https://www.vpsbenchmarks.com/yabs/ovhcloud_us-2c-4gb-20261103-tg11164
- Yabs FR: https://www.vpsbenchmarks.com/yabs/ovhcloud-2c-4gb-20260909-eabf8a
- Yabs CA: https://www.vpsbenchmarks.com/yabs/ovhcloud-2c-4gb-20260831-fc8e52
- Geekbench: https://browser.geekbench.com/v6/cpu/14223469 , https://browser.geekbench.com/v6/cpu/15240115
- PassMark i7-10610U: https://www.cpubenchmark.net/cpu.php?id=3738
- technical.city i7-10610U: https://technical.city/en/cpu/Core-i7-10610U

## Chưa kiểm chứng
- Trang /compare/ của OVH không đọc được; bảng spec lấy từ phần tóm tắt của trình đọc trang. Chưa có số đo cho Singapore (trang vpsbenchmarks không ghi vùng theo gói). Cách chắc nhất: thuê VPS-1 tháng đầu và chạy `lscpu` + Geekbench/Yabs.
