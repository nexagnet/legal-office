# Phụ lục hợp đồng dịch vụ

Trạng thái: **giả định nghiệp vụ** do Claude chọn theo ủy quyền của chủ dự án ngày 23/10/2026 (tự quyết nghiệp vụ còn mở).
`nghiệp vụ.md` chưa định nghĩa phụ lục. Chủ dự án sửa ở đây rồi báo, code sẽ chỉnh theo.

## Quyết định (giả định)

| Mục | Chọn | Ghi chú |
|---|---|---|
| Loại thay đổi | `EXTEND` gia hạn/điều chỉnh thời hạn · `SCOPE` bổ sung phạm vi dịch vụ · `PARTIES` thay đổi bên tham gia · `OTHER` khác | Khớp khung Figma "07 · Hợp đồng · thêm phụ lục" |
| Trường nhập | loại, ngày hiệu lực, nội dung thay đổi (≤ 2.000 ký tự), bản scan đã ký | Không có số tiền: MISA là sổ kế toán duy nhất |
| Bản scan | **bắt buộc**, PDF/JPEG/PNG ≤ 25 MB | Lưu qua `contract_attachments`, dùng chung đường tải về |
| Số phụ lục | tự tăng theo từng hợp đồng (1, 2, …) | Không nhập tay, không trùng khi hai người thêm cùng lúc |
| Sửa/xoá | **không**; chỉ ghi thêm | Sai thì thêm phụ lục mới ghi rõ sửa gì; mọi lần ghi có audit |
| Ai ghi/đọc | vai tiếp nhận (`vb_is_intake_staff`) | Giống tệp đính kèm và người tham gia hợp đồng |
| Ảnh hưởng tới hồ sơ | **không** đổi trạng thái hay chặn thao tác | Phụ lục là chứng từ lưu trữ; chưa tự gia hạn hợp đồng |

## Cài đặt

- Bảng `contract_addenda` (migration `0052`), RLS theo `tenant_id`.
- Hàm `vb_add_contract_addendum` (lưu bản scan + ghi phụ lục một giao dịch) và `vb_list_contract_addenda`.
- API: `POST /vibang/contracts/:id/addendum-files?kind&effectiveFrom&summary&name` (thân là tệp), `GET /vibang/contracts/:id/addenda`.
- Giao diện: `ContractAddenda` trong mục "Tệp hợp đồng và người tham gia" của Khách hàng & hợp đồng.

## Câu hỏi cho chủ dự án

1. Có cần loại phụ lục "chấm dứt sớm / thanh lý" không (hiện nằm trong `OTHER`)?
2. Phụ lục có cần Trưởng VP duyệt trước khi hiệu lực không (hiện không)?
3. Ngày hiệu lực có được ở quá khứ không (hiện được)?
