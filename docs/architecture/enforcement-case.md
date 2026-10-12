# Hồ sơ Tổ chức thi hành án (THA) — lát #13

Migration `apps/api/drizzle/0006_enforcement_case.sql`. Dữ liệu giả lập. **Không có số tiền, thu/chi, sổ sách**; không thay MISA.
Quyền kiểm tra trong DB (dùng lại `td_authorize`), mọi kết quả kể cả từ chối ghi `audit_log` (không chứa tên đương sự hay ghi chú).

## Mô hình
- `th_cases`: tham chiếu hợp đồng dịch vụ (N-07), siêu dữ liệu quyết định/bản án, THV phụ trách. OPEN → COMPLETED.
- `th_parties` (chỉ ghi thêm): người/tổ chức với vai CREDITOR / DEBTOR / RELATED_PARTY / REPRESENTATIVE.
- `th_obligations`: nhiều nghĩa vụ mỗi hồ sơ, trạng thái riêng OPEN → PARTIAL → COMPLETED, gắn bên có nghĩa vụ (cùng hồ sơ).
- `th_obligation_events` (chỉ ghi thêm): PARTIAL_RESULT / COMPLETION cần bằng chứng (khoá tệp + SHA-256); NOTE không đổi trạng thái. `idem_key` duy nhất mỗi nghĩa vụ: ghi lại cùng khoá trả `ALREADY_RECORDED`, không tạo bản sao.
- `th_obligation_book`: nguồn chiếu mỗi nghĩa vụ một dòng, chỉ đếm sự kiện.

## Quy tắc
- Hoàn tất một nghĩa vụ **không** hoàn tất hồ sơ cha. Hồ sơ chỉ COMPLETED khi có ≥1 nghĩa vụ, mọi nghĩa vụ đã COMPLETED **và** có bằng chứng hoàn tất cấp hồ sơ; chỉ Admin/Trưởng VP.
- Tạo hồ sơ: Admin, Trưởng VP, Thư ký, Văn thư (đúng chi nhánh). Giao THV: Admin, Trưởng VP. Thêm đương sự / nghĩa vụ / ghi kết quả: THV phụ trách, Admin, Trưởng VP. THV không được giao bị từ chối.
- Nghĩa vụ/hồ sơ đã COMPLETED bất biến (trigger); không xoá; kết quả cũ không bị viết lại.

## HTTP (`/enforcement-cases`)
`POST /`, `PUT :id/handler`, `POST :id/parties`, `POST :id/obligations`, `POST obligations/:id/events` (thân có `idempotencyKey`), `POST :id/completion`. Chưa có endpoint đọc.

## Giả định chưa được chủ sản phẩm xác nhận
- Danh sách vai đương sự và ai được tạo hồ sơ.
- "Bằng chứng hoàn tất cấp hồ sơ" là một tệp có hash; loại văn bản pháp lý cụ thể chưa chốt.
- Đồng thời (concurrency) dùng khoá hàng + khoá idempotency; chưa có `version` lạc quan.
- Tài sản và chuyển giao THA là #11 (làm sau lát này).

## Đọc danh sách và giao diện (lát #12)

Chủ dự án chọn 12/10/2026: quyền xem **theo phạm vi ghi**. `GET /enforcement-cases` (hàm `th_list_cases`, migration 0017) trả hồ sơ kèm đương sự và nghĩa vụ: Admin/Trưởng VP/Thư ký xem cả văn phòng; Văn thư và Kế toán theo chi nhánh được cấp; THV chỉ hồ sơ mình phụ trách; người khác nhận danh sách rỗng. Không trả khoá bằng chứng, không có số tiền. Trang `/to-chuc-tha`: danh sách, mở hồ sơ, thêm đương sự, thêm nghĩa vụ, ghi chú diễn biến (mỗi ghi chú có khoá chống trùng riêng). Ghi kết quả có bằng chứng và hoàn tất hồ sơ cần tệp, chưa có trên giao diện vì chưa có kho tệp; giao THV chưa làm trên giao diện.
