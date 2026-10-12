# Lõi hồ sơ Vi bằng (lát của #6)

Phạm vi: mô hình và quy tắc cho hồ sơ Vi bằng, người chịu trách nhiệm, cửa sổ sửa 48 giờ, Change Request và
chuyển trạng thái được bảo vệ. Không có tiền (MISA là sổ duy nhất), không cấp số (#7), không scan cuối (#8), không UI.

## Đã chốt trong hợp đồng nghiệp vụ (#1) và được cài đặt

- Khách hàng là `PERSON` hoặc `ORGANIZATION`; hợp đồng tuỳ chọn; một hợp đồng gắn nhiều hồ sơ.
- Admin, THV, Thư ký, Văn thư được tạo hồ sơ. **Chỉ Admin gán đúng một THV chịu trách nhiệm.**
- THV xem chéo chi nhánh nhưng chỉ thao tác trên hồ sơ mình được gán (`NOT_RESPONSIBLE_THV`).
- Trường nội bộ (`title`, `description`, `contactNote`) sửa trực tiếp trong đúng 48 giờ liên tục kể từ `createdAt`
  (47:59:59 còn, 48:00:00 hết; tính cả cuối tuần). Sau đó: Change Request có trước/sau/lý do, **chỉ Admin duyệt**.
- Trường khác (nội dung pháp lý cuối) bị từ chối ở cả hai đường (`NOT_INTERNAL_FIELD`); đường đúng là N-11, chưa làm ở lát này.
- Hồ sơ đã `RETURNED`/`CANCELLED` là bất biến; không xoá cứng; huỷ phải có lý do.
- Chuyển trạng thái không bỏ qua bằng chứng: `SIGNED` cần `NUMBER_ALLOCATED`; `RETURNED` cần
  `MISA_CONFIRMED_FULL` và `FINAL_SCAN_WITH_SIGNATURE_AND_STAMP`. Bằng chứng do #7/#8 ghi; lát này chỉ kiểm tra.
- Khoá lạc quan bằng `version`; DB bảo vệ thêm bằng `UPDATE … WHERE version = $n`, RLS theo tenant, khoá ngoại kép.

## GIẢ ĐỊNH chưa chốt (cần owner/#1 xác nhận)

- Ai được sửa nội bộ/lập Change Request: Admin, THV (nếu được gán), Thư ký, Văn thư. Văn thư cần branch grant; Kế toán chỉ xem.
- Ai thực hiện bước nào: `SIGNED` bởi THV được gán, `STAMPED` bởi Văn thư, `RETURNED` bởi Văn thư hoặc THV được gán, `CANCELLED` bởi Admin.
- Vai xem mọi chi nhánh: Admin, Trưởng VP, THV, Thư ký; Văn thư/Kế toán theo branch grant.
- Gán lại THV chỉ khi hồ sơ còn `INTAKE`/`ASSIGNED`.

## Chưa làm

HTTP controller/guard Nest và repository Drizzle nối domain với bảng (thuộc phần còn lại của #5/#6); đường N-11;
tái cấp số khi huỷ (#7); kiểm tra ký/dấu/scan thực tế (#8). Runtime proof qua HTTP chưa có.
