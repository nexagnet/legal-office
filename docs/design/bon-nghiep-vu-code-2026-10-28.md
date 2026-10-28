# Code bốn nghiệp vụ theo Figma N17 (28/10/2026)

Nguồn: Figma N17 và N15 đã chốt, báo cáo `figma-gap-van-phong-2026-10-28.md`. Mỗi PR gồm migration, API, web và test.

| PR | Nội dung | Figma | Ghi chú |
|---|---|---|---|
| #236 | Tống đạt: đóng yêu cầu, ghi việc báo kết quả cho cơ quan (Điều 25.2) | D1 | Migration 0059 |
| #239 | THA: tài sản, đề xuất biện pháp, lệnh cơ quan | H2 | Migration 0060 |
| #240 | THA: chuyển hồ sơ (đề nghị, ba bước kèm tệp, hoàn tất) | H3 | Dùng API sẵn có, thêm tải tệp bước |
| #241 | Xác minh: nguồn và nhật ký mở, ủy quyền, quyết định N-06 | X1, X2, X3 | Migration 0061 |
| #242 | Vi bằng: Cấp số, Trả kết quả | V2, V3 | Migration 0062 |
| #244 | Vi bằng: Từ chối, Tạo hồ sơ | V4, V1 | Không migration |

## Giả định đã tự chốt (chủ dự án đã ủy quyền)

1. Báo kết quả tống đạt cho cơ quan chỉ ghi cơ quan, nội dung, người, thời điểm; chưa đính kèm tệp (chờ mẫu văn bản từ khách). Ghi xong thì đóng hạn `TD_RESULT_REPORT` còn mở của yêu cầu.
2. Danh sách tài sản THA không trả nhãn của tài sản nhạy cảm; muốn xem phải nêu mục đích (có audit). Không trả khoá hay hash tệp bằng chứng ở mọi API đọc mới.
3. Chỉ Admin thấy danh sách THV để chọn người nhận hồ sơ hoặc người được ủy quyền (theo `GET vibang/thv` hiện có).
4. Quyết định N-06 là quyết định ra khi bắt đầu xác minh (Điều 35.1, 3 ngày làm việc từ ngày ký hợp đồng), mỗi hồ sơ một quyết định bất biến, chỉ Admin hoặc Trưởng VP có quyền ký pháp lý ghi được; ghi xong đóng hạn `VX_DECISION`.
5. "Mở nguồn" xác minh hiện chỉ ghi nhật ký (chưa đọc tệp thật vì kho tệp riêng chưa xong).
6. Số xem trước khi cấp số chỉ là dự kiến; số thật do máy chủ cấp khi bấm Cấp số. Cảnh báo "chưa nhập số cuối sổ giấy" dựa vào bảng nhập số cuối của năm hiện tại.
7. Ngăn kéo Tạo hồ sơ Vi bằng chỉ dùng các trường API đang nhận; địa điểm, thời gian dự kiến, người tham gia, ghi chú nội bộ của Figma V1 chưa có chỗ lưu nên chưa đưa vào.

## Còn lại (chưa làm trong đợt này)

- Chấm dứt vụ việc THA đủ Điều 46 (H4) và áp mẫu đương sự, nghĩa vụ (H1, P2).
- Các thao tác Vi bằng còn thiếu bản vẽ (phân công THV, MISA, cập nhật số, bản sao, N-11, huỷ hồ sơ).
- Hai migration cùng số 0059 trên main (`0059_labels_with_full_name` và `0059_td_result_notices`) đã chạy đúng thứ tự tên; không đổi tên file đã áp.
