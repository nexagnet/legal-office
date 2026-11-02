# Bàn giao thread "E2E và so Figma DMS" (2026-11-02)

Thread này chạy trên máy của chủ dự án (có Chrome, Northflank CLI, Python). Không còn code hoặc ảnh dở: nhánh `claude/project-thread-dc4ira` đồng bộ với `origin`, mọi PR của thread đã merge vào `main`.

## 1. Đã làm

- Dựng dữ liệu thử "TEST E2E" trên dev (không dùng dữ liệu thật), chạy E2E Admin, Thừa hành viên, Thư ký, Kế toán, Văn thư: 4 nghiệp vụ (Vi bằng, Tống đạt, Xác minh THA, Tổ chức THA), 3 sổ Văn thư (đến, đi, nội bộ) với Số đến/STT tự động, yêu cầu sửa đổi, nhóm quyền, xuất sổ S-01/02/04/05, báo cáo N-09/N-10, văn phòng phẩm (điều chỉnh bắt buộc lý do), OCR.
- Sửa lệch Figma DMS v2 (file `bueSNVniMoYD6lQFHwqeHz`, trang chuẩn 352-917; Figma là bản chuẩn): hơn 25 PR từ #284 đến #335, gồm Admin có đủ quyền (migration 0086), trang chi tiết hồ sơ, Phiên bản/so sánh, trạng thái S1, trang bìa sổ, modal xác nhận thay cho hộp thoại trình duyệt, danh sách dùng chung 4 miền và Văn thư.
- Đợt này: #330 (tổng 0 khi trang đầu rỗng, hộp Bộ lọc đã lưu), #332/#333/#334 (Quản trị không tràn ngang trên điện thoại), #335 (nút Lưu bộ lọc đã lưu bị gửi nhầm cả biểu mẫu tìm vì form lồng nhau), #341 (thẻ số Tống đạt/Xác minh/Tổ chức hiện "—" do thiếu hàm trong allowlist, không phải lỗi migration), #339/#345/#349/#351/#354/#356/#357 (ảnh và PDF dev để so Figma và so mẫu TT 08).

## 2. Ảnh và PDF bằng chứng (trong repo)

- `reports/danh-sach-figma-2026-11-02/`: `dev` (trước sửa), `dev-sau`, `dev-sau2`, `dev-sau3` (có 1024), `dev-sau4`, `dev-sau5`, `dev-sau6`. Tên: `<màn>-<tab>-<rộng>.png`, rộng là 1440/1024/768/390.
- `reports/xuat-pdf-dev-2026-11-02/`: 7 PDF xuất thật từ dev (S-01, S-02, S-04, S-05, VT-DEN, VT-DI, VT-NB) kèm ảnh trang 1-3.

## 3. Việc còn lại (đã báo thread sửa danh sách và thread xuất PDF TT 08)

- Danh sách: chữ "Tải" của hàng cuối ở 1024 (Tống đạt) bị chân thẻ bảng cắt nửa dưới; link "Tìm trong nội dung scan" nằm trong thẻ bảng (Figma không có chỗ này, cần quyết vị trí); phân trang chưa kiểm vì dev chỉ có 3 hồ sơ; Tống đạt/Xác minh/Tổ chức/Văn thư chưa đo từng pixel với khung Figma riêng; trạng thái lỗi (S1) chưa chụp vì không giả lập được lỗi API trên dev.
- PDF sổ: đối chiếu từng sổ với mẫu TT 08 (tên văn phòng in không dấu "VAN PHONG THU" là tên tenant dev, "Địa chỉ" chấm trống, Văn thư 1 trang không bìa và không dòng chấm).
- Nhận xét nhỏ: màn Văn thư trống có câu "Thêm bản ghi" khi người dùng không có nút tạo (Admin đã có nút "+ Thêm bản ghi").
- Tài liệu hướng dẫn có ảnh: chờ khi mọi màn khớp Figma (thread khác viết).

## 4. Cách chạy lại E2E và chụp ảnh dev

- Môi trường dev: `https://dev.nexagnet.com` (web) và API cùng gốc `/api`. `WEB_ORIGIN` của lo-api phải chứa `https://dev.nexagnet.com`, nếu không mọi POST trả 401 (CSRF theo Origin).
- Đăng nhập: form email và mật khẩu ở `/login`. Tài khoản thử nằm trên máy chủ dự án trong `C:\Users\phung\Documents\legal-office-test-accounts-thu.txt` (Thư ký, Kế toán, Thừa hành viên, Văn thư, Trưởng văn phòng) và `C:\Users\phung\Documents\legal-office-admin-thu.txt` (Admin). Không ghi mật khẩu vào repo hoặc chat. Mỗi lần chỉ đăng nhập một tài khoản trong một trình duyệt, đăng xuất rồi mới đổi.
- Chụp ảnh: dùng chrome-devtools MCP, mở 4 trang (1440x900, 1024x768, 768x1024, 390x844 mobile) và chụp `fullPage` vào thư mục `reports/...`. Bẫy: trang chưa được "chọn" (`select_page`) có thể hết thời gian khi chụp, nên chọn từng trang trước khi chụp; `resize_window` của claude-in-chrome không đổi viewport thật, dùng `emulate`.
- PDF sổ: gọi `/api/dms/books/<MÃ>?officeId=<id>&year=2026&format=pdf` từ trang đang đăng nhập (`fetch` cùng gốc), lưu base64 ra tệp rồi giải mã; render trang bằng PyMuPDF (`import pymupdf`, chạy `python -X utf8`).
- Dữ liệu "TEST E2E" đã có sẵn trên dev (3 hồ sơ mỗi miền, 1 nháp).

## 5. Northflank CLI

- Chỉ dùng context `legal-office-owner` thứ hai, `--projectId legal-office` (không đụng dự án `bmsl`).
- Dịch vụ: `lo-api`, `lo-web`.
- Trạng thái build/deploy: `northflank list services --projectId legal-office`.
- Log chạy: `northflank get service logs --projectId legal-office --serviceId lo-api -t runtime -l 300 -d backward --startTime <ISO> --textIncludes "<chuỗi>" --quiet`.
- Migration tự chạy khi lo-api khởi động (log có dòng "Đã chạy NNNN_ten.sql"). Không sửa secret, không xóa dịch vụ.
- Đợi deploy: sau khi merge vào main, build mất vài phút; đừng chụp ảnh khi `status: 'BUILDING'`, chờ vài lượt kiểm liên tiếp đều không còn BUILDING.

## 6. Bẫy đã gặp

- Hàm đọc mới trong DB phải thêm vào allowlist regex ở `apps/api/src/vibang/vibang.repo.ts` (`rows()`), nếu không API báo "unsafe function name" và web hiện "—" (đã gặp với `dms_domain_pending_counts`).
- Không dùng `<form>` lồng nhau (nút Lưu bộ lọc từng gửi nhầm cả biểu mẫu tìm).
- Lưới CSS: `grid-cols-1` phải có ở mức nhỏ nếu cột lớn chỉ khai báo từ `lg`; `admin-figma.css` từng ghi đè cột 240px ở mọi cỡ.
- Test phụ thuộc ngày: dùng giờ Việt Nam, không dùng UTC (đã sửa `office-ledgers.itest.ts`, `forms.test.tsx`).
- Hook pre-push chạy test: sau khi merge main có thể thiếu phụ thuộc mới (ví dụ `@expo-google-fonts/tinos`), chạy `pnpm install --frozen-lockfile` rồi push lại.
- Push bị từ chối do nhánh đã được "update-branch" trên GitHub: merge `origin/<nhánh>` rồi push, không force-push (bị chặn).
- PR "BEHIND": `gh pr update-branch <số>` rồi chờ CI.
- GateGuard hook đòi nêu 4 sự kiện trước khi Edit/Write lần đầu mỗi tệp.
- Phiên chrome-devtools hoặc hearthbot có lúc mất kết nối; kiểm lại bằng `list_pages`, trang cũ mất thì mở trang mới.
- Hộp thoại gốc của trình duyệt (confirm/alert) làm treo công cụ chụp; giao diện dùng modal trong ứng dụng.
- Mật khẩu, secret của dịch vụ: không đọc, không ghi lại, không nhập vào host khác ngoài dev.nexagnet.com.
