# Rà soát trước khi lên production (03/11/2026)

Nguồn: cấu hình thật trên Northflank (chỉ đọc tên biến, không đọc giá trị bí mật), phiên Admin trên `dev.nexagnet.com`, web của khách `thihanhandansuhaibatrung.com`, checklist 75 câu hỏi khách (`docs/handoff/tham-chieu/cau-hoi-khach-hang-72-cau-2026-10-29.md`) và các báo cáo E2E.

Kết luận ngắn: **code và giao diện đã đủ để chạy thử nghiệm thu; chưa đủ để nhập dữ liệu thật.** Thiếu chủ yếu là hạ tầng production, sao lưu, các việc pháp lý và 19 câu hỏi khách loại P0 chưa có câu trả lời.

## 1. Web của khách cho biết gì

Web `thihanhandansuhaibatrung.com` là web giới thiệu (WordPress, theme Bosa Lawyer). Không có log hệ thống, thông tin kỹ thuật hay dữ liệu nghiệp vụ. Chỉ lấy được thông tin công khai:

| Mục                  | Giá trị lấy từ web                                                                                                  | Dùng cho                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Tên pháp lý          | "Văn phòng Thi hành án dân sự Doanh nghiệp tư nhân Hai Bà Trưng", đổi tên chính thức từ 01/10/2026 (bài 06/10/2026) | A2: khớp tên hệ thống đang dùng            |
| Địa chỉ              | Số 4 – A11 Đầm Trấu, phường Bạch Đằng, quận Hai Bà Trưng, Hà Nội                                                    | A2, biểu mẫu                               |
| Điện thoại           | 0965.126.126 và 0965.128.128                                                                                        | A2, biểu mẫu                               |
| Email                | thuaphatlaihaibatrung@yahoo.com.vn                                                                                  | I1 (hộp thư gửi)                           |
| Trưởng văn phòng     | Bà Cao Anh Thúy                                                                                                     | B2, B10                                    |
| Số thừa hành viên    | 5 (chỉ có ảnh, tên gọi tắt, không có họ tên đầy đủ, email, số thẻ)                                                  | B10 chưa đủ                                |
| Quyết định thành lập | QĐ 1122/QĐ-UBND ngày 24/2/2014 của UBND Hà Nội                                                                      | A2 (số giấy đăng ký hiện hành vẫn cần xin) |
| Giờ làm việc         | 8:00 – 17:30 tất cả các ngày trong tuần                                                                             | H9 (xem mục 5)                             |

Web chưa có: văn bản Sở Tư pháp chấp thuận lưu cloud (A1), số cuối các sổ giấy (A3), danh sách nhân sự đầy đủ (B10), ngày nghỉ lễ (H9), mã số thuế, tài khoản ngân hàng, người đại diện (các trường `office.tax`, `office.bank`, `office.representative` của biểu mẫu).

## 2. Hạ tầng: những gì đã đo

- **Chỉ có một môi trường.** Project `legal-office` gồm `lo-api`, `lo-web`, `lo-postgres`, `lo-migrate`, `lo-ocr`. `dev.nexagnet.com` và `www.nexagnet.com` cùng trỏ vào một hệ, `NODE_ENV=production` nhưng tên đơn vị là "Van phong thu". Không có môi trường production tách riêng, nên dữ liệu thử và dữ liệu thật sẽ lẫn nhau nếu nhập luôn vào đây.
- **Postgres chưa có bản sao lưu nào** (`northflank get addon backups` trả danh sách rỗng). Đây là chặn số một: mất DB là mất hồ sơ pháp lý.
- **Kích thước nhỏ.** `lo-api` và `lo-web` chạy `nf-compute-10` (0,1 vCPU, 256 MB), 1 bản. Đủ để thử, chưa kiểm tải, chưa có chỗ chịu lỗi.
- **Kho tệp:** `FILE_STORE=r2` đã bật trên dev, đủ khóa. Chưa có quy trình sao lưu R2 và chưa bật dọn kho 30 ngày: `SCAN_PURGE_SCHEDULE` không có trong cấu hình, nên scan đã xóa mềm sẽ không bao giờ bị dọn thật.
- **Email:** SMTP đã cấu hình trong ứng dụng, dùng `smtp.gmail.com` (hộp thư cá nhân của dev), khóa mã hóa `MAIL_SETTINGS_KEY` sẵn sàng. Production cần hộp thư của văn phòng, có mật khẩu ứng dụng, người giữ mật khẩu rõ ràng (I1).
- **Tên miền:** gốc `nexagnet.com` chưa có https đầy đủ (I3). Header bảo mật cơ bản có (HSTS, nosniff, X-Frame-Options DENY); chưa thấy Content-Security-Policy.
- **OCR:** job `lo-ocr` chạy mỗi phút (`* * * * *`), khớp với câu "1 đến 2 phút" trên giao diện; chỉ phần mô tả của job còn ghi "10 phút" (lệch chữ, không lỗi).
- **Chưa kiểm được:** cảnh báo khi dịch vụ sập, giám sát dung lượng DB và R2, nơi đặt R2 (vùng) so với yêu cầu lưu trữ của Sở. Cần khách và chủ dự án quyết.

## 3. Dữ liệu và tài khoản

- Tài khoản thử đều `@example.invalid`, 5 tài khoản vai được duyệt bằng seed trực tiếp vào DB, bỏ qua quy tắc hai người. Dữ liệu `[seed-demo]` và `[e2e-gd5]` còn trên dev. Production phải bắt đầu từ tenant mới, không mang dữ liệu thử sang.
- Cần danh sách nhân sự thật (B10) và ít nhất **hai người khác nhau**: Admin và Trưởng VP, vì cấp vai theo quy tắc hai người (B6).
- Admin tự duyệt bản trình của chính mình hiện được phép; cần khách xác nhận (B3).

## 4. Việc code còn mở (không chặn, nhưng nên làm)

- OCR cho scan của bản trình (Trình / Duyệt) chưa có; chữ OCR thô của scan đã xóa vẫn còn trong `dms_ocr_results` (câu mở: xóa hay giữ).
- Giao diện: khung xem PDF nền đen (trình xem PDF của trình duyệt); thẻ đầu trên điện thoại khác Figma M1 ở khối Xem / Tải; chưa kiểm chi tiết hồ sơ ở 390 px và trang Xuất sổ sau khi PDF dựng xong; hộp thoại hủy nháp mới chỉ có test, chưa bấm thử trên dev.
- Sổ điện tử chưa phải biểu mẫu chính thức; chưa có trạng thái đóng quyển (H4); chưa làm N-09, N-10 vì chưa có Excel gốc (A6); S-06 chưa có bản in (H5).
- Chưa kiểm tải với lượng hồ sơ thật (kế hoạch quy mô ở `docs/engineering/dms-scale-search.md`).

## 5. Câu hỏi khách loại P0 chưa có câu trả lời (19)

Cột "Khách trả lời" trong checklist vẫn trống toàn bộ. Nhóm chặn dùng dữ liệu thật:

- Pháp lý: **A1** Sở Tư pháp chấp thuận lưu hồ sơ ngoài trụ sở; **A2** số giấy đăng ký hoạt động (tên, địa chỉ, điện thoại đã có từ web); **A3** số cuối từng sổ giấy.
- Quyền: **B1** bảng quyền từng vai; **B2** ai đứng tên ký từng loại văn bản; **B3** Admin được làm đến đâu; **B4** đăng nhập khi nhân viên không có email; **B10** danh sách nhân sự thật và số Thẻ THV.
- Nghiệp vụ: **C4** hợp đồng không lưu số tiền; **D5** chỉ cấp số khi MISA xác nhận đủ; **D11, D12** quy trình nháp, ký, đóng dấu, scan và N-11; **G1** chấm dứt vụ việc Điều 46; **H4** đóng quyển sổ; **H5** S-06; **H9** ngày làm việc và ngày lễ (web ghi văn phòng làm việc cả tuần, giả định hiện tại là chỉ T2–T6 tính hạn pháp định, cần khách xác nhận).
- Hạ tầng: **I1** dịch vụ email gửi; **I2** nơi lưu tệp và quét mã độc; **I6** ngày chuyển sang dữ liệu thật và người ký nghiệm thu (UAT).

## 6. Thứ tự đề xuất để lên production

1. Khách trả lời 19 câu P0 (ưu tiên A1, A3, B1, B2, B10, I1, I2, I6). Chưa có A1 thì không nhập dữ liệu thật.
2. Dựng môi trường production riêng (project hoặc tenant mới, DB mới, bucket R2 riêng, tên đơn vị thật), nâng cấu hình `lo-api`, `lo-web`, DB lên cỡ vừa.
3. Bật sao lưu DB định kỳ và thử khôi phục một lần; chọn chu kỳ sao lưu R2 (I4).
4. Bật `SCAN_PURGE_SCHEDULE=on` kèm `SCAN_PURGE_TENANT_IDS` cho tenant production.
5. Gắn hộp thư gửi của văn phòng; nhập số cuối các sổ, danh sách nhân sự, ngày lễ; tạo Admin và Trưởng VP thật.
6. Cấp https cho tên miền gốc (chuyển nameserver sang nhà cung cấp có CNAME flattening) hoặc chốt `www` là địa chỉ chính thức.
7. Kiểm tải nhẹ, chạy lại E2E 5 vai trên production với dữ liệu giả, rồi UAT với khách, rồi mới nhập dữ liệu thật.
