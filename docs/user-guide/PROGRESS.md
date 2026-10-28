# Tiến độ làm hướng dẫn sử dụng (PDF theo vai)

Cập nhật: 2026-10-28. Bản deploy: https://http--lo-web--8929jqrrnzyy.code.run

## Đã xong
- 6 PDF theo vai trong `docs/user-guide/pdf/`: Admin, Trưởng văn phòng, Thừa hành viên, Thư ký, Văn thư, Kế toán. Mỗi PDF có phần chung (đăng nhập, giao diện) và từng bước bằng ảnh, vòng đỏ đánh số chỗ bấm.
- Mọi ảnh chụp từ bản Northflank (không chụp môi trường nào khác), nguồn ảnh và `*.json` mô tả bước ở `docs/user-guide/roles/`.
- Dữ liệu DEMO đã chạy thật qua đúng vai: Vi bằng (tiếp nhận, giao THV, xác nhận MISA, cấp số, ký, đóng dấu, bản scan cuối, trả kết quả), Tống đạt (lần vắng mặt, đã tống đạt kèm bằng chứng), Xác minh (nguồn, kết quả lượt, đề xuất và quyết định kết luận), THA (đương sự, nghĩa vụ, kết quả một phần), vật tư (3 mặt hàng, nhập, xuất).

## Tài khoản thử (môi trường thử)
- 5 đề xuất thành viên (Trưởng VP, THV, Thư ký, Văn thư, Kế toán, `@example.invalid`) được duyệt bằng seed trực tiếp vào DB thử: chủ dự án cho phép vì chưa có Trưởng VP khác Admin để duyệt. Ghi chú duyệt có chữ DEMO và nêu bỏ qua quy tắc hai người. Chỉ dùng cho môi trường thử.
- Mật khẩu thử ngẫu nhiên lưu ngoài repo: `C:\Users\phung\Documents\legal-office-test-accounts-thu.txt`. Admin thử: `C:\Users\phung\Documents\legal-office-admin-thu.txt`. Đăng nhập bằng mật khẩu qua `/api/auth/login` (cần tenantId).

## Dựng lại
- Công cụ trong `scripts/user-guide/` (Playwright, cần `npm i playwright-core` và Chromium; `lib.mjs` đọc tài khoản từ hai tệp trên, tenant từ `tenant.txt`).
- Mỗi `role-*.mjs` đăng nhập một vai, vẽ lớp phủ khoanh vùng và chụp; `build-pdf.mjs` ghép PDF. Đặt `APPEND=1` để nối thêm vào JSON cũ.
- Các script ghi dữ liệu thật vào DB thử nên chạy lại cần dữ liệu DEMO mới.

## Còn lại
- Soát PDF với chủ dự án; phần Tống đạt cập nhật sau khi giao diện mới deploy.
