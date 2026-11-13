# Biện pháp khôi phục dữ liệu khi lên production (1 trang, 9/11/2026)

Chỉ khảo sát và đề xuất, chưa triển khai gì. Giá là ước lượng, cần xem lại khi đặt mua.

## 1. Dữ liệu nào mất là không tạo lại được
| Dữ liệu | Nằm ở đâu | Mất thì sao |
|---|---|---|
| Hồ sơ, sổ S-0x, người dùng, nhật ký nghiệp vụ | Postgres | **Không tạo lại được.** Sổ là bản ghi pháp lý |
| Scan mới, bằng chứng (vi bằng, tống đạt) | Bucket R2 | **Không tạo lại được** nếu không còn bản giấy/bản gốc |
| 200GB tài liệu cũ | R2 bucket `lo-files` + nguồn ở máy Windows | **Dự kiến khóa vô thời hạn prefix `t/<tenantId>/legacy/`, chưa áp** (đang chờ tenantId). Giữ nguồn đến khi đối chiếu xong |
| OCR, chỉ mục tìm kiếm, bản xem trước | Postgres/R2 | Tái tạo được bằng job `lo-ocr`, không cần sao lưu riêng |
| Mã ứng dụng, migration | GitHub | Đã có |
| `.env`, khóa R2, khóa giải mã backup | Máy chủ | Mất khóa giải mã thì **mọi backup vô dụng** |

## 2. Mức chịu mất dữ liệu (đề xuất cho văn phòng nhỏ)
- **Postgres: RPO ≤ 15 phút, RTO ≤ 4 giờ** (khôi phục trong một buổi làm việc). Mất cả ngày ghi sổ thì phải nhập lại từ giấy, không nên chấp nhận.
- **Tệp scan: RPO ≤ 24 giờ, RTO ≤ 1 ngày.** Scan mới trong ngày còn bản giấy/bản gốc ở máy người nhập.

## 3. Năm biện pháp (phủ 5 rủi ro: xóa nhầm, lỗi người dùng, lỗi phần mềm/migration, hỏng/mất server, lộ khóa)

### A. Sao lưu Postgres liên tục, ra ngoài nhà cung cấp hiện tại (hỏng/mất server, lỗi phần mềm)
- **Làm gì:** sao lưu đầy đủ mỗi đêm + lưu nhật ký ghi (WAL) liên tục để quay về bất kỳ phút nào (PITR), giữ 30 ngày, mã hóa, đẩy sang bucket/nhà cung cấp **khác** nơi đặt server. Nếu dùng Postgres do nhà cung cấp quản lý thì bật PITR có sẵn và vẫn thêm một bản `pg_dump` đêm sang nơi khác.
- **Ai làm:** Claude viết cấu hình/script và cảnh báo "backup thất bại". Người dùng tạo bucket đích và token.
- **Chi phí:** dưới ~1 USD/tháng khi DB còn nhỏ; công cụ miễn phí (`pgBackRest` hoặc `pg_dump`).
- **Thử khôi phục:** khôi phục vào DB tạm, đăng nhập được, số bản ghi sổ khớp, đo thời gian (phải < 4 giờ). Ghi ngày vào go-live-checklist (mục 2.4).

### B. Bản sao thứ hai cho tệp scan, khác tài khoản (xóa nhầm hàng loạt, lộ khóa, mất bucket)
- **Làm gì:** mỗi đêm chép (`rclone copy`, **không dùng sync**) bucket scan sang bucket thứ hai ở tài khoản/nhà cung cấp khác, bucket đích khóa chống xóa. Bucket Lock chỉ khóa được prefix tài liệu cũ (dự kiến, chưa áp); các thư mục khác có lệnh xóa của app (scan-purge hằng đêm, hoàn tác ở evidence.ts và vibang-files) nên khóa sẽ gây lỗi 409. Khóa API của ứng dụng chỉ ghi/đọc, **không có quyền xóa**; xóa thật chỉ do job dọn 30 ngày dùng khóa riêng.
- **Cần kiểm lại:** checklist 2.5 ghi "bật versioning R2", nhưng theo hiểu biết của tôi R2 **không có versioning kiểu S3** (chưa xác minh lại năm 2026). Nếu đúng, bản sao đêm này mới là lớp "lùi về" thật và mục 2.5 cần sửa.
- **Ai làm:** Claude viết job chép + báo lỗi; người dùng tạo bucket/token thứ hai.
- **Chi phí:** thêm ~0,015 USD/GB/tháng ở R2 (200GB ≈ 3 USD), rẻ hơn ở Backblaze B2 (~1,2 USD).
- **Thử khôi phục:** xóa thử một tệp ở bucket thử, chép lại từ bản sao, mở được; số lượng và tổng dung lượng hai bucket khớp.

### C. Chốt chặn xóa/sửa nhầm trong ứng dụng (lỗi người dùng)
- **Làm gì:** giữ cơ chế đã có: xóa mềm scan 30 ngày, hồ sơ đã ghi sổ không sửa/xóa; thêm nhật ký ai xóa/tải scan (mục 2.6, 5.3). "Thùng rác" 30 ngày là thời hạn khôi phục lỗi người dùng; **chỉ dọn vĩnh viễn khi bản sao B đã chạy**.
- **Ai làm:** Claude kiểm và bổ sung test. **Chi phí:** 0.
- **Thử khôi phục:** xóa một scan trên bản thử, phục hồi từ thùng rác trong giao diện, mở lại được.

### D. Sao lưu bắt buộc trước mỗi lần cập nhật (lỗi migration/phần mềm)
- **Làm gì:** production không tự triển khai từ `main`; trước migration luôn có bản sao lưu mới (hoặc ghi lại mốc PITR), giữ image/tag bản trước. Rollback = triển khai lại tag cũ + khôi phục DB về mốc trước migration nếu migration đã đổi cấu trúc.
- **Ai làm:** Claude thêm bước vào quy trình triển khai (mục 3.5, 8.3); người dùng duyệt mỗi lần. **Chi phí:** 0.
- **Thử khôi phục:** chạy cả chuỗi trên staging: sao lưu → migration → giả lập lỗi → quay lại.

### E. Giữ khóa an toàn và có sổ tay dựng lại server (lộ khóa, mất server)
- **Làm gì:** (1) khóa giải mã backup và `.env` lưu ở **2 nơi ngoài máy chủ** (trình quản lý mật khẩu của chủ văn phòng + bản cất két); (2) mỗi khóa quyền tối thiểu, khóa backup tách khỏi khóa ứng dụng, đổi ngay khi nghi lộ; (3) một trang runbook "mất server": dựng máy mới từ `deploy/` → đặt `.env` → khôi phục DB (A) → trỏ lại bucket.
- **Ai làm:** Claude viết runbook; người dùng cất khóa và tạo token quyền tối thiểu.
- **Chi phí:** ~0 (VPS tạm chỉ thuê vài giờ lúc diễn tập).
- **Thử khôi phục:** **một lần trước go-live** dựng VPS tạm theo runbook và đo thời gian đến khi đăng nhập được; sau đó mỗi quý một lần (gộp thử A và B).

## 4. Cố ý bỏ
Đa vùng/server dự phòng nóng, snapshot VPS làm lớp chính (chỉ là phụ), phần mềm backup riêng cho tệp, mã hóa nhiều tầng. Với văn phòng nhỏ và SLA chưa cam kết, A–E là đủ; nên nói rõ với khách là chưa có dự phòng nóng.

## 5. Cần người dùng chốt
1. Đồng ý RPO/RTO ở mục 2, hay muốn chặt hơn.
2. Nơi đặt bản sao thứ hai (R2 tài khoản khác hay B2 rẻ hơn).
3. Tạo bucket/token đích và cất khóa giải mã ở 2 nơi.
Sau khi chốt, Claude làm theo thứ tự A → B → D → E → C.
