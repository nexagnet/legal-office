# Hướng dẫn sử dụng: nguồn, cách dựng lại, tình trạng

Cập nhật: 2026-11-04 (dựng lại toàn bộ sau các thay đổi P0 đến P7). Chụp từ bản chạy cục bộ của `main` (sau #402) với DB thử và dữ liệu giả; không có dữ liệu khách thật.

## Có gì

- `roles/*.json`: nguồn duy nhất (phần, bước, chú thích, các dòng khoanh vùng). `roles/<vai>/NN.png`: ảnh có vòng đỏ đánh số.
- `pdf/huong-dan-<vai>.pdf`: 6 PDF theo vai (Admin, Trưởng văn phòng, Thừa hành viên, Thư ký, Văn thư, Kế toán), mỗi PDF = phần chung + phần của vai. `pdf/huong-dan-day-du.pdf`: gộp tất cả.
- `huong-dan-su-dung.md`: bản chữ để đọc trong repo, sinh từ cùng JSON. Không sửa tay.

Phạm vi: toàn bộ giao diện DMS đang hiện trên thanh bên (Hồ sơ do tôi tạo, Mọi hồ sơ của văn phòng, Vi bằng, Tống đạt, Xác minh THA, Tổ chức THA, Văn thư, Trình / Duyệt, Chờ tôi xác nhận, Xuất sổ, Biểu mẫu, Báo cáo, Scan đã xóa, Lịch sử hoạt động, Quản trị gồm Tài khoản, Nhóm quyền, Chi nhánh, Cài đặt văn phòng). Các màn văn phòng cũ không còn trên thanh bên (Hộp duyệt, Hợp đồng, Sổ sách, Công văn) không có trong hướng dẫn này.

## Tài khoản và dữ liệu

- Tài khoản thử đọc từ hai tệp ngoài repo: `C:\Users\phung\Documents\legal-office-test-accounts-thu.txt` (mỗi dòng `email,mật khẩu,VAI`) và `legal-office-admin-thu.txt` (dòng 1 email, dòng 2 mật khẩu). Không in, không chép vào repo.
- Mã tenant: tạo `scripts/user-guide/tenant.txt` (không commit) từ `TENANT_ID` của dev, hoặc đặt biến `GUIDE_TENANT`.
- Chạy cục bộ: đặt `GUIDE_BASE=http://localhost:3000`, `GUIDE_TENANT`, `GUIDE_ACC` và `GUIDE_ADMIN` (tệp tài khoản thử cùng định dạng như trên). Tài khoản thử cần đủ vai Admin, Trưởng văn phòng, Thư ký, THV, Văn thư, Kế toán, mỗi vai thuộc đúng một nhóm quyền (sao chép từ nhóm mẫu) và chỉ một chi nhánh, để biểu mẫu tạo hồ sơ không hiện ô chọn chi nhánh. Tên THV phải là `DEMO Thừa hành viên`.
- Môi trường thật là tenant mới, không chạy `tools/seed-demo`; không đưa các PDF này kèm dữ liệu mẫu cho khách thật.
- Các script ghi dữ liệu giả có tiền tố `[guide]` lên dev (tạo nháp, lưu chính thức, gửi và duyệt bản trình, sửa, xóa scan). Hồ sơ đã lưu chính thức không bao giờ bị xóa nên mỗi lần chạy để lại thêm dữ liệu `[guide]` trên dev.
- Mọi ảnh chụp đều che email thật (thay bằng `@example.invalid`) và tên tài khoản Admin thật.

## Dựng lại

```bash
cd scripts/user-guide
npm i --no-save playwright-core        # chỉ cần cho thư mục này
APPEND=1 node role-dms-vibang.mjs       # Thừa hành viên: tạo nháp, scan, hủy, lưu chính thức, đã trả
APPEND=1 node role-dms-nghiepvu.mjs     # Tống đạt / Xác minh / Tổ chức THA, Chờ tôi xác nhận
APPEND=1 node role-dms-admin.mjs        # Admin: Tổng quan, Trình/Duyệt, sửa, xóa scan, lịch sử
APPEND=1 node role-dms-quantri.mjs      # Admin: Tài khoản, Nhóm quyền, Chi nhánh, Thẻ THV, Email, Lịch, Hồ sơ lao động, Cài đặt, Báo cáo, Vật tư
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
