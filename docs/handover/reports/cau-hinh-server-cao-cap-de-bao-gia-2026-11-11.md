# Cấu hình server cao cấp để đi hỏi báo giá (11/11/2026)

Dùng cho phần mềm văn phòng thi hành án (web + API + cơ sở dữ liệu Postgres + nhận dạng chữ OCR). Khoảng 20–50 người dùng, dữ liệu pháp lý, đã có 200GB tài liệu scan cũ. Nội dung dưới đây không nêu nhà cung cấp, có thể gửi thẳng cho bên bán hoặc người đi hỏi giá.

## 1. Máy chủ chính (bắt buộc)
| Hạng mục | Yêu cầu tối thiểu | Tốt hơn |
|---|---|---|
| Loại | **Máy chủ vật lý riêng (dedicated)**, không chia sẻ | như bên trái |
| CPU | 8 nhân / 16 luồng, hiện đại (AMD EPYC 4000, Ryzen PRO 7000 trở lên hoặc Intel Xeon tương đương) | 12–16 nhân |
| RAM | **64GB DDR5 ECC** | 128GB ECC |
| Ổ cứng | **2 ổ NVMe ≥ 960GB chạy RAID1** (dùng ổ loại datacenter) | 2 × 1,92TB |
| Mạng | 1 Gbps, **lưu lượng không giới hạn** (hoặc ≥ 5TB/tháng) | 1 Gbps không giới hạn |
| Địa chỉ IP | 1 IPv4 cố định + IPv6 | như bên trái |
| Hệ điều hành | Ubuntu Server 24.04 LTS (cài sẵn, quyền root qua SSH khóa) | như bên trái |
| Quản trị từ xa | Có console/IPMI hoặc KVM từ xa, chế độ cứu hộ (rescue) | như bên trái |
| Nguồn / mạng | Nguồn điện dự phòng, đường mạng dự phòng ở datacenter | như bên trái |
| Hỗ trợ | Hỗ trợ kỹ thuật 24/7, **thay linh kiện hỏng trong ≤ 4 giờ** | thay trong ≤ 1–2 giờ |

## 2. Vị trí đặt máy
Ưu tiên theo thứ tự (độ trễ từ Việt Nam): **Việt Nam hoặc Singapore, Hồng Kông, Nhật Bản**; tránh Mỹ và châu Âu (độ trễ 180–300ms, trang sẽ chậm rõ rệt). Cần ghi rõ vị trí vì dữ liệu cá nhân.

## 3. Máy dự phòng (khuyến nghị)
VPS hoặc máy chủ nhỏ ở **nhà cung cấp hoặc trung tâm dữ liệu khác** với máy chính: ≥ 4 vCore, 8GB RAM, 100GB NVMe. Giữ ở trạng thái chờ; khi máy chính hỏng thì khôi phục từ bản sao lưu lên máy này.

## 4. Lưu trữ sao lưu và tệp
- Kho tệp tương thích S3 (S3-compatible object storage), ≥ 500GB, có **versioning hoặc Object Lock**, không giới hạn hoặc không tính phí lưu lượng ra: ít nhất **hai nơi ở hai nhà cung cấp khác nhau** (một nơi hiện đã dùng là Cloudflare R2).
- Cho phép giữ bản sao lưu ≥ 30 ngày.

## 5. Phần mềm và vận hành (bên bán không cần cung cấp, chỉ để biết)
Docker, Caddy, Postgres 17 tự chạy; sao lưu và giám sát do bên triển khai làm. Cần quyền root hoặc sudo đầy đủ qua SSH khóa.

## 6. Câu hỏi nên hỏi bên bán
1. Giá **hàng tháng** và **phí lắp** (setup) một lần; giá khi cam kết 12 tháng so với trả theo tháng.
2. Đã gồm VAT chưa? Có xuất hóa đơn VAT Việt Nam không?
3. Lưu lượng có giới hạn không, vượt thì tính thế nào?
4. RAM có phải ECC thật không; ổ NVMe loại gì (datacenter hay consumer)?
5. Thời gian thay linh kiện hỏng, và có cam kết SLA bằng văn bản không?
6. Đặt ở datacenter nào, tier mấy? Có backup/snapshot đi kèm không?
7. Có thể nâng cấp RAM/ổ cứng sau không, giá nâng?
8. Điều khoản hủy: phạt khi hủy giữa kỳ, hoàn phí thế nào?
9. Xác nhận bên bán không truy cập dữ liệu trên máy (không dùng chung ổ, không dùng ảnh hệ thống của họ có tài khoản ẩn).

## 7. Mức giá tham khảo (đã tra 11/11/2026, chưa VAT)
- OVH Advance (Singapore): $198–255/tháng + phí lắp một tháng.
- Hetzner AX42 (chỉ Đức/Phần Lan): €79–99/tháng + €49 phí lắp; AX102: €159–259/tháng.
- Dự phòng nguội (VPS-2): ~$8,5/tháng.
Nhà cung cấp trong nước (Viettel IDC, VNPT, FPT, Viettel Cloud, CMC...) chưa được tra giá; khách nên hỏi để so sánh, đặc biệt nếu cần đặt dữ liệu trong nước.

---
# Phiên bản vừa túi tiền: máy chủ riêng, giá mục tiêu ~16 triệu/năm (không dùng VPS)

Ngân sách tổng ~16 triệu/năm (~$630). Trong đó ~2,5–3 triệu dành cho lưu tệp R2 200GB và sao lưu ngoài, nên **tiền thuê máy chủ nên ở mức khoảng 13 triệu/năm (~$43/tháng, ~1,1 triệu/tháng)**, đã gồm VAT nếu có.

## Cấu hình hỏi giá
| Hạng mục | Yêu cầu tối thiểu | Tốt hơn nếu cùng giá |
|---|---|---|
| Loại | **Máy chủ vật lý riêng (dedicated)**, không dùng VPS/cloud chia sẻ | |
| CPU | ≥ 6 nhân / 12 luồng hiện đại (Ryzen 5/7, Core i5 gen 12+, Xeon E-2xxx trở lên) | 8 nhân |
| RAM | **≥ 32GB** (ECC càng tốt, không bắt buộc) | 64GB |
| Ổ cứng | **2 ổ SSD NVMe ≥ 480GB chạy RAID1** | 2 × 960GB |
| Mạng | 1 Gbps, lưu lượng ≥ 3TB/tháng hoặc không giới hạn | không giới hạn |
| IP | 1 IPv4 cố định | |
| Hệ điều hành | Ubuntu Server 24.04 LTS, quyền root SSH | |
| Quản trị | Có console/KVM từ xa hoặc chế độ cứu hộ | |
| Hỗ trợ | 24/7, thay linh kiện hỏng ≤ 24 giờ (≤ 4 giờ nếu được) | |
| Vị trí | Việt Nam, Singapore, Hồng Kông hoặc Nhật Bản | |

Ghi chú: ở mức giá này nhiều máy dùng RAM không ECC và ổ NVMe loại phổ thông; RAID1 và sao lưu ngoài bù lại rủi ro. Nếu bên bán chỉ có Đức/Phần Lan rẻ hơn rõ rệt, hỏi lại trước khi quyết (độ trễ ~250ms, trang chậm hơn).

## Mức giá tham khảo
Chưa tra được giá cụ thể cho cấu hình này trong phiên này. Từ hiểu biết chung (cần kiểm lại): máy chủ vật lý entry-level ở châu Âu khoảng €40–50/tháng (Hetzner dòng EX, OVH Rise/Eco), thuê máy chủ vật lý tại Việt Nam khoảng 1–2 triệu/tháng; hai nơi đều chưa xác minh. Đã xác minh: Hetzner AX42 €79 (~$85) và OVH Advance $198+ đều **vượt** ngân sách này.

## Việc cần làm
Khách báo giá ≥ 3 nhà cung cấp (trong nước + nước ngoài). Gửi lại cho tôi các cấu hình và giá, tôi so sánh và chọn.

---
# Kiểm chứng giá (11/11/2026) cho ngân sách ~16 triệu/năm

Tỷ giá 25.500đ/$, 1 EUR ≈ 1,08 USD, chưa VAT.

| Nguồn | Máy | Cấu hình | Giá/tháng | Phí lắp | Đạt yêu cầu? |
|---|---|---|---|---|---|
| OVH So You Start | SYS-2 | Xeon-D 2141I 8c/16t, 32GB+, 2×512GB+, 1–2 Gbps | **$42,10** (~13 tr/năm) | $42,10 | Đạt cấu hình; **vị trí Châu Á và loại ổ (NVMe/SATA) chưa xác nhận** |
| OVH So You Start | SYS-3 | Xeon-E 2288G 8c/16t, 32GB+, 2×960GB+ | $46,50 (~14,2 tr/năm) | $46,50 | như trên |
| OVH So You Start | SYS-1 | Xeon-E 2136 6c/12t, 32GB+, 2×512GB+, 500Mbps–1Gbps | $33,20 | $33,20 | chỉ vài cấu hình đạt 1 Gbps |
| Hetzner | EX44 | Core i5-13500, 64GB DDR4 (ECC chưa ghi), 2×512GB NVMe, 1 Gbps không giới hạn | €59 (~$64, ~19,5 tr/năm) | €0 | Đạt cấu hình, **vượt ngân sách**, chỉ châu Âu |
| Hetzner | Server Auction | từ €75,70 | | | Không vừa |
| OVH Rise | | từ $64 | | | Không vừa |
| Việt Nam | BKNS, PA Vietnam | máy vật lý từ ~2,8–4,5 triệu/tháng (khoảng 34–53 tr/năm) | | | **Vượt ngân sách gấp 2–3 lần** (từ kết quả tìm kiếm, chưa mở trang chi tiết) |

Kết luận: trong ngân sách ~16 triệu/năm (gồm ~2,5–3 triệu cho R2 200GB và sao lưu), **chỉ có OVH So You Start SYS-2/SYS-3 vừa túi tiền**, cộng phí lắp một tháng ở năm đầu (~1 triệu). Hạn chế chưa xác nhận: các SYS thường đặt ở châu Âu/Canada, chưa thấy mẫu nào ở Singapore/Sydney; cần xem lúc đặt hàng. Dedicated trong nước và Hetzner EX44 đều vượt ngân sách.
