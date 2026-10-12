# Quy trình duyệt dùng chung (#12)

Áp dụng cho **chuyển giao hồ sơ THA (N-08)** và **uỷ quyền xác minh**. Dữ liệu giả lập, không chữ ký tự động.

- Duyệt trong ứng dụng (Admin/Trưởng VP) **khác** chữ ký pháp lý (`legal_signer`). Các bước duyệt/ký/bàn giao/đồng ý vẫn ghi ở `as_transfer_steps` / `vx_delegation_steps` (0005, 0007).
- Lớp mới `ap_decisions` (0009, chỉ ghi thêm, RLS tenant) ghi quyết định **REJECT / RETURN / RESUBMIT** kèm lý do bắt buộc và audit.
- `ap_decide` (`POST /approvals/transfers/:id/decisions`, `/approvals/delegations/:id/decisions`):
  - REJECT, RETURN: chỉ Admin/Trưởng VP của văn phòng.
  - RESUBMIT: người đề xuất hoặc Admin/Trưởng VP; chỉ sau RETURN.
  - REJECT là cuối cùng: không mở lại, không ghi đè; làm lại = **đề xuất mới**.
  - Không tác động đề xuất đã hoàn tất (`SUBJECT_FINAL`).
- `as_transfer_complete` và `vx_delegation_activate` trả `APPROVAL_REJECTED` / `APPROVAL_RETURNED` khi đề xuất đang bị từ chối/trả lại, ngoài các điều kiện cũ (thiếu bước nào trả mã bước đó).
- Lịch sử: view `ap_history`.

## Giả định cần chủ dự án xác nhận
1. Trả lại bổ sung không xoá các bước đã ghi; chỉ chặn hoàn tất tới khi nộp lại.
2. Từ chối không cần chữ ký pháp lý, chỉ cần Admin/Trưởng VP.
3. Chưa có hộp thư "chờ duyệt" tổng hợp; sẽ làm cùng giao diện (#16+).
