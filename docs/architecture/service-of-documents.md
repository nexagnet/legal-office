# Tống đạt: nhiều văn bản, người xử lý, các lần tống đạt, bằng chứng N-02 (#9)

Dữ liệu giả lập; không tên/địa chỉ thật, không tài chính, không niêm yết hay gửi tự động, không AI quyết định hiệu lực tống đạt.

## Đã chốt (theo #1, #9)

- Một yêu cầu N-01 (`td_requests`) chứa nhiều văn bản (`td_documents`), mỗi văn bản có người nhận, địa chỉ, hạn, người xử lý và các lần tống đạt (`td_attempts`, chỉ ghi thêm). Văn bản đã `DELIVERED`/`UNDELIVERABLE` là cuối.
- Chỉ Admin hoặc Trưởng VP giao người xử lý (`td_assign`); người xử lý phải là THV của văn phòng. Chưa giao thì chưa ghi nhận được lần tống đạt nào.
- `SERVED` cần bằng chứng (khoá + sha256) và mới đánh dấu `DELIVERED`; thất bại giữ văn bản mở để thử lại. `POSTED_NOTICE` (niêm yết) chỉ ghi khi nêu căn cứ pháp lý và **không bao giờ tự thành công**. Kết luận không tống đạt được cần mã lý do và ít nhất một lần thử.
- Yêu cầu cha chỉ đóng (`td_close_request`) khi **mọi** văn bản đã ở trạng thái cuối; một văn bản thành công không đóng cha. Yêu cầu đã đóng bất biến.
- Mỗi lần thử ghi `late` so với hạn (ghi nhận, không chặn). Giờ do máy chủ ghi, endpoint HTTP không nhận giờ từ client.
- Lịch sử việc (`td_events`: tạo, thêm, giao, nhắc, ghi nhận, đóng) chỉ ghi thêm; view `td_s01_book` là nguồn chiếu cho sổ S-01 (RLS của bảng gốc áp dụng).
- Quyền kiểm trong DB, audit cả từ chối; THV chỉ thao tác trên văn bản mình được giao; Văn thư theo chi nhánh được cấp. Cô lập tenant bằng RLS.

## Giả định chưa xác nhận (không suy diễn)

- Ai được tạo yêu cầu (Admin, Trưởng VP, Thư ký, Văn thư đúng chi nhánh), ai được nhắc việc, và người xử lý chỉ là THV: cấu hình giả lập.
- Danh sách mã kết quả/mã lý do không tống đạt được là tập tối thiểu; quy trình ngoại lệ hợp pháp khác (vắng mặt kéo dài, niêm yết theo luật) cần owner/luật xác nhận, vì vậy không có mã "ngoại lệ pháp lý" tự do.
- Hạn pháp định theo loại văn bản chưa được tính; `deadline_at` nhập tay.
- Báo cáo cơ quan, mẫu N-01/N-02 in chính xác: thuộc #14; chưa có nguồn mẫu thì `NOT_PROVEN`.

## Chưa làm

Endpoint đọc (cần chốt quyền đọc), sổ S-01 xuất Excel/PDF, tệp bằng chứng thật (khoá chỉ là chuỗi được kiểm), UI, xác thực thật.
