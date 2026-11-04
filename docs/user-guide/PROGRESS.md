# Hướng dẫn sử dụng: nguồn, cách dựng lại, tình trạng

Cập nhật: 2026-11-04. Chụp từ `https://dev.nexagnet.com` (bản chạy `8e225c0`), dữ liệu giả.

## Có gì

- `roles/*.json`: nguồn duy nhất (phần, bước, chú thích, các dòng khoanh vùng). `roles/<vai>/NN.png`: ảnh có vòng đỏ đánh số.
- `pdf/huong-dan-<vai>.pdf`: 6 PDF theo vai (Admin, Trưởng văn phòng, Thừa hành viên, Thư ký, Văn thư, Kế toán), mỗi PDF = phần chung + phần của vai. `pdf/huong-dan-day-du.pdf`: gộp tất cả.
- `huong-dan-su-dung.md`: bản chữ để đọc trong repo, sinh từ cùng JSON. Không sửa tay.

Phạm vi: toàn bộ giao diện DMS đang hiện trên thanh bên (Vi bằng, Tống đạt, Xác minh THA, Tổ chức THA, Văn thư, Trình / Duyệt, Chờ tôi xác nhận, Xuất sổ, Biểu mẫu, Báo cáo, Scan đã xóa, Lịch sử hoạt động, Quản trị). Các màn văn phòng cũ không còn trên thanh bên (Hộp duyệt, Hợp đồng, Sổ sách, Công văn) không có trong hướng dẫn này.

## Tài khoản và dữ liệu

- Tài khoản thử đọc từ hai tệp ngoài repo: `C:\Users\phung\Documents\legal-office-test-accounts-thu.txt` (mỗi dòng `email,mật khẩu,VAI`) và `legal-office-admin-thu.txt` (dòng 1 email, dòng 2 mật khẩu). Không in, không chép vào repo.
- Mã tenant: tạo `scripts/user-guide/tenant.txt` (không commit) từ `TENANT_ID` của dev.
- Các script ghi dữ liệu giả có tiền tố `[guide]` lên dev (tạo nháp, lưu chính thức, gửi và duyệt bản trình, sửa, xóa scan). Hồ sơ đã lưu chính thức không bao giờ bị xóa nên mỗi lần chạy để lại thêm dữ liệu `[guide]` trên dev.
- Mọi ảnh chụp đều che email thật (thay bằng `@example.invalid`) và tên tài khoản Admin thật.

## Dựng lại

```bash
cd scripts/user-guide
npm i --no-save playwright-core        # chỉ cần cho thư mục này
APPEND=1 node role-dms-vibang.mjs       # Thừa hành viên: tạo nháp, scan, hủy, lưu chính thức, đã trả
APPEND=1 node role-dms-nghiepvu.mjs     # Tống đạt / Xác minh / Tổ chức THA, Chờ tôi xác nhận
APPEND=1 node role-dms-admin.mjs        # Admin: Tổng quan, Trình/Duyệt, sửa, xóa scan, lịch sử
APPEND=1 node role-dms-quantri.mjs      # Admin: các màn Quản trị
APPEND=1 node role-dms-vanthu.mjs       # Văn thư
APPEND=1 node role-dms-khac.mjs         # Trưởng văn phòng, Thư ký, Kế toán
node role-dms-chung.mjs                 # Phần chung (ghi đè chung.json)
node prune.mjs --write                  # bỏ phần cũ, xóa ảnh không dùng, kiểm nội dung
GUIDE_SHA=<mã bản chạy> node build-pdf.mjs
node build-md.mjs
```

Một khoanh vùng không tìm thấy phần tử thì script dừng và báo lỗi (trừ khi đánh dấu `optional`). `prune.mjs` báo lỗi nếu còn thiếu ảnh, còn chữ "yêu cầu sửa đổi", email thật hoặc URL cũ.

## Chưa làm / hạn chế

- Tống đạt, Xác minh, Tổ chức THA mới có danh sách và biểu mẫu tạo hồ sơ; các tab chi tiết giống Vi bằng nhưng chưa chụp riêng.
- Phần Trưởng văn phòng, Thư ký, Kế toán ngắn vì trên DMS các vai này có ít chức năng và tài khoản thử chưa được cấp chi nhánh để thấy hồ sơ.
- Khung xem PDF hiện nền đen do trình xem PDF của trình duyệt.
- Các ảnh chụp ở 1440 px; riêng phần "Dùng trên điện thoại" chụp ở 390 px.
