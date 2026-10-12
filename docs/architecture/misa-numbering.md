# Xác nhận MISA thủ công, đánh số Vi bằng, cổng thu hồi (#7)

Dữ liệu giả lập. **Không có số tiền, thanh toán từng phần, công nợ, VAT, hoá đơn; không gọi MISA.** MISA là sổ kế toán duy nhất; ở đây chỉ là cổng quy trình.

## Đã chốt (theo #1, #7)

- Kế toán được cấp chi nhánh ghi tay `NOT_CONFIRMED` / `CONFIRMED_FULL` kèm tham chiếu, người ghi, thời điểm (`vibang_record_misa`).
- Văn thư được cấp chi nhánh cấp số **đúng một lần** cho mỗi hồ sơ, chỉ khi `CONFIRMED_FULL` và hồ sơ ở `ASSIGNED` (`vibang_allocate_number`). Số dạng `<seq>/<năm>/VB-THV`, đếm theo **văn phòng**, reset theo năm (múi giờ `Asia/Ho_Chi_Minh`). Gọi lại là idempotent.
- Admin nhập số cuối đã dùng ngoài hệ thống, chỉ tiến, có bảng lịch sử (`vibang_import_last_number`).
- Không tái sử dụng số khi huỷ hồ sơ; bộ đếm chỉ tăng; số đã cấp bất biến.
- Kế toán đề xuất thu hồi (`vibang_propose_revoke`); chỉ Admin chấp nhận/từ chối (`vibang_decide_revoke`). Đang chờ hoặc đã thu hồi thì chặn `RETURNED` ở DB. Chấp nhận thu hồi **không** đổi trạng thái hồ sơ, số đã cấp hay bản ký.

## Cổng ở tầng DB

- Quyền (vai + chi nhánh được cấp) kiểm tra trong chính các hàm; mọi kết quả, kể cả từ chối, ghi `audit_log` cùng transaction. Từ chối trả về mã (không ném lỗi) để audit không bị rollback.
- `vibang_cases_guard`: `SIGNED` cần có dòng trong `vibang_numbers`; `RETURNED` cần `CONFIRMED_FULL` không có thu hồi chờ và bản scan cuối. Mảng `proofs` của #6 không còn đủ để qua hai cổng này.
- Lưu ý khi gọi: dùng `SELECT * FROM fn(...)`, KHÔNG `SELECT (fn(...)).*` (Postgres chạy hàm một lần cho mỗi cột; đã gặp khi viết test).

## Giả định chưa xác nhận (không suy diễn)

- Không hứa "không đứt số": rollback transaction không để lại lỗ hổng, nhưng luật có bắt buộc liền mạch hay không chưa được chốt.
- Năm theo giờ Việt Nam. Mốc đổi năm chưa được owner xác nhận.
- Hồ sơ phải ở `ASSIGNED` mới cấp số; kế toán có thể ghi xác nhận trước đó (trừ hồ sơ đã trả/huỷ).
- Nhãn `VB-THV` là hằng số; cấu hình theo văn phòng chưa làm.
- Admin không ghi xác nhận MISA và không cấp số (theo vai trong hợp đồng).

## Chưa làm

Controller HTTP + guard gọi các hàm này, ghi `AuditSink` vào `audit_log`, UI. Chứng minh runtime qua HTTP thuộc lát tiếp theo của #5 và các issue UI.
