# Xác minh điều kiện (N-05/N-06) — lát #10

Migration `apps/api/drizzle/0005_verification.sql`. Dữ liệu giả lập; không crawl nguồn ngoài, không AI quyết định, không tài chính.
Quyền kiểm tra **trong DB** (dùng lại `td_authorize`), mọi kết quả kể cả từ chối ghi `audit_log`.

## Mô hình
- `vx_cases` hồ sơ xác minh (OPEN → CONCLUSION_PROPOSED → CONCLUDED), có THV phụ trách.
- `vx_rounds` một hồ sơ nhiều vòng; mỗi vòng có bên liên quan, thời gian, kết quả. Vòng chỉ COMPLETED khi có ≥1 nguồn và kết quả có nội dung; sau đó bất biến.
- `vx_sources` chỉ ghi thêm: loại, mức bảo mật (PUBLIC/CONFIDENTIAL/PII), mục đích sử dụng, khoá tệp + SHA-256 (tệp ở kho riêng, không lưu nội dung).
- `vx_delegations` + `vx_delegation_steps` (chỉ ghi thêm). `vx_s04_book` là nguồn cho sổ S-04, chỉ đếm nguồn.

## Quy tắc
| Việc | Ai | Điều kiện |
|---|---|---|
| Tạo hồ sơ | Admin, Trưởng VP, Thư ký, Văn thư (đúng chi nhánh) | |
| Giao THV | Admin, Trưởng VP | THV cùng văn phòng |
| Mở vòng / thêm nguồn / hoàn tất vòng | THV phụ trách, Admin, Trưởng VP | hồ sơ OPEN; hoàn tất cần nguồn + kết quả |
| Truy cập nguồn | như trên | nguồn không PUBLIC cần nêu mục đích; luôn audit; trả khoá tệp, không trả nội dung |
| Đề xuất kết luận | THV phụ trách, Admin, Trưởng VP | MỌI vòng đã hoàn tất, ≥1 vòng |
| Quyết định kết luận (N-06) | Admin/Trưởng VP có `legal_signer`, **khác** người đề xuất | từ chối cần lý do, đưa hồ sơ về OPEN; duyệt chốt hồ sơ |
| Ủy quyền | yêu cầu: THV phụ trách/Thư ký/Admin/Trưởng VP | người nhận là THV cùng văn phòng |

Ủy quyền chỉ ACTIVE khi đủ 4 bước theo thứ tự kiểm tra, thiếu bước nào trả mã bước đầu tiên thiếu:
`CONSENT_MISSING` (văn bản đồng ý của người yêu cầu) → `APP_APPROVAL_MISSING` (Admin/Trưởng VP) → `LEGAL_SIGNATURE_MISSING` (`legal_signer`) → `HANDOVER_MISSING` (Admin/Trưởng VP/Thư ký). Kích hoạt chỉ Admin/Trưởng VP và đổi THV phụ trách.

## HTTP (`/verification`)
`POST cases`, `PUT cases/:id/handler`, `POST cases/:id/rounds`, `POST rounds/:id/sources`, `POST sources/:id/access`, `POST rounds/:id/completion`, `POST cases/:id/conclusion-proposal`, `POST cases/:id/conclusion-decision`, `POST cases/:id/delegations`, `POST delegations/:id/steps`, `POST delegations/:id/activation`. Chưa có endpoint đọc (cần chốt quyền đọc sổ S-04).

## Giả định chưa được chủ sản phẩm xác nhận
- Người ký N-06 = `memberships.legal_signer` thuộc vai Admin/Trưởng VP (cùng giả định với N-11 ở #8).
- Ai được ghi nhận văn bản đồng ý / biên bản bàn giao (bảng trên) và việc chỉ THV phụ trách đọc được nguồn.
- Từ chối kết luận đưa hồ sơ về OPEN để làm tiếp, không có trạng thái "bị từ chối" riêng.
- Việc đọc/ghi tệp nguồn thật (kho riêng) và xác thực thật chưa làm — thuộc #5.
