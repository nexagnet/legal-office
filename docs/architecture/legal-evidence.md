# Bằng chứng pháp lý Vi bằng: bản nháp, ký, đóng dấu, scan cuối, Sở, N-11 (#8)

Dữ liệu giả lập. Chỉ **siêu dữ liệu** tệp (khoá đối tượng, sha256, mime, kích thước); kho tệp riêng tư thật thuộc #5. Bản scan giấy **không** phải chữ ký số; giai đoạn 1 không có chữ ký số pháp lý, không gửi Sở tự động, không SMS/Zalo.

## Đã chốt (theo #1, #8)

- Bản nháp N-03/N-04 (sinh ra hoặc tải lên, DOCX/PDF) có phiên bản tự tăng; **không** đổi trạng thái hồ sơ và khác bản scan đã ký (`vibang_add_document`).
- THV phụ trách xác nhận đã ký (`vibang_confirm_signed`: ASSIGNED→SIGNED, cần số đã cấp). Văn thư đúng chi nhánh xác nhận đóng dấu (`vibang_confirm_stamped`: SIGNED→STAMPED).
- Bản scan cuối (chỉ PDF, tải lên) chỉ nhận sau khi đã đóng dấu. `vibang_return_case` (Văn thư đúng chi nhánh hoặc THV phụ trách) cần: đã ký, đã đóng dấu, có bản scan cuối, MISA đầy đủ và không có thu hồi chờ. Khi trả, **khoá đúng phiên bản + sha256 mới nhất**; bản đã khoá và các mốc ký/dấu bất biến (trigger), tài liệu chỉ ghi thêm.
- Đăng ký Sở/CSDL theo dõi độc lập (`vibang_set_registration`): hạn, trạng thái, sự cố khi thất bại (mã lý do). Không phải điều kiện để trả; thất bại sau khi trả **không** đổi RETURNED hay tệp đã ký.
- Nhắc/kết quả liên hệ khách thủ công chỉ lưu mã kết quả (không PII), tách khỏi RETURNED (`vibang_log_contact`).
- N-11 là quy trình riêng, tách khỏi Change Request 48h: đề xuất (Admin hoặc THV phụ trách, có lý do, chỉ khi đã ký), văn bản N-11 là một phiên bản tài liệu, áp dụng chỉ bởi thành viên có `legal_signer`; không sửa/xoá tài liệu cũ, kể cả khi hồ sơ đã RETURNED.
- Cổng DB (`vibang_cases_guard`) thay hẳn mảng `proofs` ở các bước SIGNED/STAMPED/RETURNED bằng dữ liệu thật. Mọi hàm kiểm vai + chi nhánh/THV phụ trách trong DB và ghi audit cả khi từ chối.

## Giả định chưa xác nhận (không suy diễn)

- Ai là "người ký có thẩm quyền" cho N-11: dùng cờ `memberships.legal_signer` sẵn có. Cần owner xác nhận quy tắc thật trước khi dùng thật.
- Vai nào được tải bản nháp/ghi liên hệ/cập nhật Sở (Admin, THV phụ trách, Thư ký, Văn thư đúng chi nhánh) là cấu hình giả lập.
- Hạn đăng ký Sở là dữ liệu nhập tay; chưa tính hạn theo luật.
- Chưa có lớp tệp: `object_key` chỉ là chuỗi được kiểm (không `..`, không `/` đầu). Mime ngoài PDF/DOCX bị từ chối; tệp khác cần review bảo mật tệp.
- Sinh bản in chính thức theo mẫu N-03/N-04 thuộc #14; chưa có nguồn mẫu thì ghi `NOT_PROVEN`, không dựng.

## Chưa làm

HTTP controller + guard, lưu tệp thật, ghi `AuditSink` vào `audit_log`, UI; chứng minh runtime qua HTTP.
