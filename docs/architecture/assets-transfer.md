# Tài sản THA, lệnh cơ quan có thẩm quyền và chuyển giao N-08 — lát #11

Migration `apps/api/drizzle/0007_assets_transfer.sql` (sau `0006` hồ sơ THA). Dữ liệu giả lập. Không sổ sách/kho tài chính; không đóng băng, kê biên hay nộp hồ sơ ra ngoài tự động. Quyền kiểm tra trong DB (`td_authorize`), mọi kết quả ghi `audit_log`.

## Mô hình
- `as_assets` (chỉ ghi thêm): loại, nhãn, mức nhạy cảm (NORMAL/SENSITIVE), gắn hồ sơ và tuỳ chọn nghĩa vụ/đương sự **cùng hồ sơ**.
- `as_events` (chỉ ghi thêm, luôn có bằng chứng, idempotent): DISCOVERY, VERIFICATION, DISPUTE, HANDOVER; `ORDER_RECORDED` do hệ thống ghi khi nhận lệnh.
- `as_proposals`: đề xuất biện pháp của THV/văn phòng (PROPOSED → WITHDRAWN hoặc APPLIED). Ràng buộc DB: `APPLIED` **chỉ khi có lệnh gắn kèm** (`order_id`).
- `as_orders` (chỉ ghi thêm): tên cơ quan, số lệnh, bản có chữ ký (khoá tệp + SHA-256), người ghi nhận.
- `as_transfers` + `as_transfer_steps` (chỉ ghi thêm): chuyển giao hồ sơ sang THV khác cùng văn phòng.
- `as_s05_book`: nguồn chiếu S-05, không lộ nhãn tài sản.

## Quy tắc
| Việc | Ai | Điều kiện |
|---|---|---|
| Đăng ký tài sản / ghi sự kiện / đề xuất / rút đề xuất | THV phụ trách, Admin, Trưởng VP | hồ sơ OPEN |
| Truy cập metadata tài sản | như trên | luôn audit; SENSITIVE cần mục đích |
| Ghi nhận lệnh cơ quan có thẩm quyền | Admin, Trưởng VP | tên cơ quan + số lệnh + bản có chữ ký; không có thì `SIGNED_ORDER_REQUIRED` |
| Đề xuất chuyển giao | THV phụ trách, Thư ký, Admin, Trưởng VP | người nhận là THV khác cùng văn phòng |
| Hoàn tất chuyển giao | Admin, Trưởng VP | đủ 3 bước, thiếu bước nào trả mã bước đầu tiên thiếu |

Ba bước chuyển giao: `APP_APPROVAL` (Admin/Trưởng VP, chỉ là duyệt trong ứng dụng) → `LEGAL_DECISION` (Admin/Trưởng VP **có `legal_signer`**, quyết định/chữ ký pháp lý riêng) → `HANDOVER_N08` (bằng chứng bàn giao thật; Admin/Trưởng VP/Thư ký). Mã thiếu: `APP_APPROVAL_MISSING`, `LEGAL_DECISION_MISSING`, `HANDOVER_N08_MISSING`. Hoàn tất đổi THV phụ trách; THV cũ mất quyền.

## HTTP (`/enforcement`)
`POST cases/:id/assets`, `POST assets/:id/events`, `POST assets/:id/access`, `POST assets/:id/measure-proposals`, `POST measure-proposals/:id/withdrawal`, `POST measure-proposals/:id/order`, `POST cases/:id/transfers`, `POST transfers/:id/steps`, `POST transfers/:id/completion`. Chưa có endpoint đọc (cần chốt quyền đọc S-05).

## Giả định chưa được chủ sản phẩm xác nhận
- Ai được ghi nhận lệnh của cơ quan (Admin/Trưởng VP) và người ký quyết định chuyển giao = `legal_signer` Admin/Trưởng VP.
- Danh mục loại tài sản và biện pháp là văn bản tự do, chưa chuẩn hoá.
- #12 (quy trình duyệt dùng chung) chưa làm; bước duyệt ở đây là bản tối thiểu cùng mẫu với #10 và sẽ được #12 gom lại sau.
- Kho tệp thật và xác thực thật thuộc #5.
