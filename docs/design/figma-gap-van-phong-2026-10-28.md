# Rà soát Figma, web và API cho nghiệp vụ văn phòng (28/10/2026)

Chỉ khảo sát và vẽ Figma, không sửa code. Phạm vi: các màn phong cách mới (trang N0 Navy–Serif, N11–N15). Không tính các màn cũ ở trang 00–08.

Figma: `bueSNVniMoYD6lQFHwqeHz`, trang **N16 — VĂN PHÒNG · BỔ SUNG THEO NGHIỆP VỤ (CHỜ CHỐT)** (node `306:2`).
Nguồn đối chiếu: `docs/product/nghiep-vu-toan-du-an.md`, `docs/design/figma-parity.md`, route trong `apps/web/app`, controller trong `apps/api/src`.
Cách đọc cột: **Figma** = đã có bản vẽ phong cách mới; **Web** = đã có route/màn trong `apps/web`; **API** = đã có endpoint. Ký hiệu: ✅ có, 🟡 một phần, ❌ chưa. Ưu tiên P0 (chặn vận hành văn phòng), P1, P2.
Lưu ý: cột Web/API được kiểm bằng đọc controller và tìm lời gọi trong `apps/web`, chưa chạy lại bản deploy. Ô ghi "cần kiểm" là chưa xác nhận trường dữ liệu.

## 1. Màn nghiệp vụ văn phòng (trọng tâm)

| Màn | Nghiệp vụ (nguồn) | Figma | Web | API | Ưu tiên |
|---|---|---|---|---|---|
| Sổ sách S-01, S-02, S-04, S-05 | Mở sổ 01/01, khóa 31/12, in hàng tháng, đóng quyển, giáp lai; mỗi dòng truy về hồ sơ (§55–56) | ✅ O1 `306:3` (mới) | 🟡 `/so-sach` đọc, xuất Excel/PDF; chưa có đóng quyển theo tháng | 🟡 `GET ledgers/:code`, `…/export`; chưa có trạng thái in/đóng quyển theo tháng | P0 |
| Sổ S-06 sử dụng lao động | Nguồn từ hồ sơ lao động, in được | ✅ O1 tab S-06, O9 | ❌ không có tab S-06 | 🟡 `GET personnel` có; `ledgers/S-06` và xuất in chưa có | P0 |
| Theo dõi cập nhật CSDL / Sở TP | Hạn 3 ngày làm việc, không chặn trả, ghi sự cố (§18) | ✅ O2 `306:287` (mới) | ✅ `/so-sach/theo-doi-so` | ✅ `GET vibang/registrations`, `PUT cases/:id/registration`; cần kiểm trường "sự cố sau khi trả" | P1 |
| Thư viện biểu mẫu N-01…N-11 | Sinh bản nháp DOCX, N-09/N-10 chờ Excel gốc | ✅ O3 `308:2` (mới) | 🟡 `/bieu-mau` chỉ Phụ lục (tt06); nháp chỉ ở `/hop-dong/n-03`, `/bieu-mau/n-04` | ✅ `POST forms/:code/draft`; ❌ lưu và liệt kê bản nháp đã tạo; ❌ N-09, N-10 | P1 |
| Phụ lục I–IX (tra cứu) | Chỉ xem, tải, có phiên bản và hiệu lực | ✅ O3 tab Phụ lục | ✅ `/bieu-mau` | ✅ `GET/POST tt06-forms`, `…/file`, `…/download` | P2 |
| Công văn · danh sách, tạo mới | Đến/đi/sổ quyết định, tự cấp số CV-THV | ✅ D6, D7 (đã có) | ✅ `/cong-van` | ✅ `correspondence`, `correspondence/list`, `decisions` | P2 |
| Công văn đi · chi tiết | Soạn, duyệt nội bộ, ký ban hành, gửi kèm bằng chứng (§46–47) | ✅ O4 `308:264` (mới) | ❌ không có route `/cong-van/[id]` | ✅ `correspondence/:id`, `submission`, `approval`, `issuance`, `issuance-file`, `link`, `attachments`; cần kiểm trường phương thức và bằng chứng gửi | P0 |
| Công văn đến · chi tiết | Giao xử lý, hạn, gắn hồ sơ, ghi kết quả | ✅ O5 `308:510` (mới) | ❌ chưa có trang chi tiết | ✅ `assign`, `result`, `link`, `attachments`; ❌ gỡ liên kết hồ sơ; ❌ lịch sử hoạt động của công văn | P0 |
| Sổ quyết định | Tra theo số, ngày, loại, người ký, hồ sơ | ✅ O6 `309:2` (mới) | 🟡 tab trong `/cong-van`, chưa lọc theo người ký/loại | 🟡 `GET/POST decisions`, `GET signers`; cần kiểm tham số lọc | P1 |
| Vật tư · Tồn kho | Danh mục, tồn, ngưỡng, nhóm | ✅ D9 (đã có) | ✅ `/vat-tu` | ✅ `stock`, `item-thresholds`, `item-categories` (web chưa dùng nhóm) | P2 |
| Vật tư · Lịch sử nhập/xuất, Xuất kho FIFO | Nhập/xuất theo lô, chặn quá tồn, lịch sử có lô | ✅ O7 `309:243` (mới) | 🟡 có form nhập/xuất/điều chỉnh lô; ❌ chưa có tab Lịch sử | ✅ `movements`, `items/:id/receipts`, `issues`, `batches/:id/adjustment` | P1 |
| Vật tư · Kiểm kê theo phiên | Trưởng VP duyệt mới ghi phiếu điều chỉnh | ✅ O8 `309:510` (mới) | ❌ không có màn kiểm kê | ✅ `stocktakes`, `…/lines`, `…/counts`, `…/decision` | P1 |
| Hồ sơ lao động / Nhân sự S-06 | Họ tên, quyết định THV, HĐ lao động, bảo hiểm (tình trạng, không số tiền), phiên bản (§51–52) | ✅ O9 `310:2`, O10 `310:274` (mới) | ❌ không thấy màn nào dùng `personnel` | 🟡 `GET/PUT personnel`; ❌ xem các phiên bản cũ; ❌ lọc theo chi nhánh/trạng thái | P0 |
| Báo cáo | Mỗi đơn vị đếm riêng, xuất Excel/PDF/in (§57) | ✅ D10 (bộ lọc, tab) + O11 `310:519` (chỉ tiêu) | ✅ `/bao-cao` 3 tab, xuất | ✅ `report`, `report/by`, `report/ops`, `branches/activity`, `report/export`; ❌ so với kỳ trước; ❌ N-10 | P1 |
| Cấu hình văn phòng | Tên pháp lý, đánh số, số cuối sổ giấy, Điều 50 | ✅ O12 `310:763` (mới) | 🟡 `/cai-dat` (tên pháp lý); ❌ chưa có nhập số cuối sổ giấy | ✅ `GET/PUT settings`, `POST offices/:id/number-imports`; cần kiểm trường địa chỉ, điện thoại, giấy đăng ký | P0 |
| Thông báo và nhắc hạn | Hộp nhắc, hạn pháp định (§8, §52) | ✅ O13 `310:977` (mới) | ❌ không thấy trang/danh sách thông báo; Tổng quan có khối nhắc hạn | ✅ `notifications`, `notifications/read`, `deadlines`, `deadlines/:id/{done,agree}` | P0 |
| Mobile văn phòng | Hiện trường, xem hồ sơ, nhắc việc (§53) | ✅ MO1 `311:2`, MO2 `311:66`, MO3 `311:126` | 🟡 responsive, chưa có khung riêng | dùng chung API trên | P2 |

## 2. Màn nghiệp vụ pháp lý và quản trị (đối chiếu nhanh)

| Màn (route web) | Figma mới | Web | API | Ghi chú |
|---|---|---|---|---|
| Tổng quan `/` | ✅ N1, D3–D5, M1, M5 | ✅ | ✅ | |
| Việc của tôi `/viec-cua-toi` | ✅ N2, M2 | ✅ | ✅ `my-work` | |
| Hộp duyệt `/hop-duyet` | ✅ N8 | ✅ | ✅ `approvals/pending` | |
| Đăng nhập `/login` | ✅ N9 | ✅ | ✅ | |
| Xác thực link, quên mật khẩu `/xac-thuc` | ❌ | ✅ xác thực link; ❌ quên mật khẩu | ✅ `verify-link`; ❌ quên/OTP | P1 |
| Danh sách Vi bằng `/vi-bang` | ✅ N4 | ✅ | ✅ | |
| Tạo hồ sơ `/vi-bang/tao-moi` | ❌ | ✅ | ✅ `POST cases` | P1 vẽ |
| Chi tiết Vi bằng và tab | ✅ N7, D1–D2, E1–E6 | ✅ | ✅ | |
| Thao tác Vi bằng (cấp số, MISA, trả, bàn giao, từ chối, huỷ, phân công, bản sao, N-11) | 🟡 chỉ mẫu E7, E8 | ✅ 12 modal | ✅ | P1 vẽ từng bước |
| Tống đạt `/tong-dat`, chi tiết | ✅ N3, E10, N15 (T1–T6, M1–M3) | ✅ | ✅ | thread khác đang chỉnh |
| Xác minh `/xac-minh`, chi tiết | ✅ N5, E11 | ✅ | ✅ | ❌ vẽ đợt, nguồn, ủy quyền (P1) |
| Tổ chức THA `/to-chuc-tha`, chi tiết | ✅ N6, E12 | ✅ | ✅ | ❌ vẽ nghĩa vụ, tài sản, chuyển hồ sơ, chấm dứt (P1) |
| Khách hàng, hợp đồng, phụ lục | ✅ N10, D8 | ✅ | ✅ | |
| Hợp đồng N-03 `/hop-dong/n-03` | ❌ (chỉ bản cũ `16:126`) | ✅ | ✅ draft | P2 vẽ |
| Biên soạn N-04 `/bieu-mau/n-04` | ❌ (chỉ bản cũ `16:188`) | ✅ | ✅ draft | P2 vẽ |
| Quản trị `/quan-tri/*` | ✅ Q1–Q9 | ✅ | ✅ | |
| Tìm kiếm toàn cục (Ctrl K) | ❌ | ✅ `SearchPalette` | 🟡 cần kiểm | P2 vẽ |

## 3. Danh sách API còn thiếu theo màn Figma

| # | Màn | Endpoint/dữ liệu cần | Hiện trạng | Ưu tiên |
|---|---|---|---|---|
| 1 | O1 Sổ sách | Trạng thái in/đóng quyển theo tháng của từng sổ (`GET ledgers/:code/periods`, `POST ledgers/:code/periods/:ym/seal`, ghi người, thời điểm) | ❌ chưa có | P0 |
| 2 | O1 Sổ S-06 | `GET ledgers/S-06` và `…/export` (Excel/PDF) từ dữ liệu `personnel` | ❌ (S-06 hiện chỉ đọc qua `GET personnel`) | P0 |
| 3 | O9 Hồ sơ lao động | `GET personnel/:personId/versions`, lọc theo chi nhánh và trạng thái làm việc | ❌ | P0 |
| 4 | O5 Công văn đến | `POST correspondence/:id/unlink` (gỡ liên kết hồ sơ), `GET correspondence/:id/history` | ❌ | P1 |
| 5 | O4 Công văn đi | Trường phương thức gửi và bằng chứng gửi trong `issuance` | cần kiểm | P1 |
| 6 | O6 Sổ quyết định | Lọc theo người ký, loại, hồ sơ, khoảng ngày | cần kiểm | P1 |
| 7 | O3 Biểu mẫu | Lưu và liệt kê bản nháp đã sinh (`GET/POST forms/drafts`) | ❌ | P1 |
| 8 | O3 N-09, N-10 | Mẫu và xuất đúng bố cục (chờ file Excel gốc của khách) | ❌, chặn bởi dữ liệu khách | P1 |
| 9 | O11 Báo cáo | Cột "so với kỳ trước" cho `report` và `report/ops` | ❌ | P2 |
| 10 | O12 Cấu hình | Trường địa chỉ trụ sở, điện thoại, số giấy đăng ký trong `settings` | cần kiểm | P1 |
| 11 | O2 Theo dõi CSDL/Sở | Trường sự cố sau khi trả và lịch sử ghi cập nhật | cần kiểm | P1 |
| 12 | O13 Thông báo | Lọc `notifications` theo đã đọc/loại, đếm chưa đọc cho chuông | cần kiểm | P1 |
| 13 | Đăng nhập | Quên mật khẩu, đặt lại mật khẩu | ❌ | P1 |
| 14 | Hiện trường (mobile) | Nhật ký ngoài hiện trường dùng chung `my-work` | 🟡 | P2 |

## 4. Phần chưa làm trong code so với Figma mới

| Nhóm | Việc còn thiếu trong `apps/web` | Figma | Ưu tiên |
|---|---|---|---|
| Văn phòng | Trang chi tiết công văn `/cong-van/[id]` (đến và đi) | O4, O5 | P0 |
| Văn phòng | Trang Hồ sơ lao động và ngăn kéo cập nhật phiên bản | O9, O10 | P0 |
| Văn phòng | Trang Thông báo (chuông mở danh sách, đánh dấu đã đọc) | O13, MO3 | P0 |
| Văn phòng | Nhập số cuối sổ giấy trong Cấu hình | O12 | P0 |
| Văn phòng | Đóng quyển theo tháng và tab S-06 ở Sổ sách | O1, MO1 | P0 |
| Văn phòng | Vật tư: tab Lịch sử, màn Kiểm kê theo phiên, nhóm vật tư | O7, O8 | P1 |
| Văn phòng | Biểu mẫu: tạo nháp N-01…N-11 từ thư viện, tab Bản nháp đã tạo | O3 | P1 |
| Văn phòng | Sổ quyết định: lọc theo người ký, loại | O6 | P1 |
| Văn phòng | Báo cáo: so với kỳ trước, chỉ tiêu theo đơn vị đếm | O11 | P1 |
| Pháp lý | Áp mẫu N12/N13 (tab, ngăn kéo) cho các màn Vi bằng còn lại; chi tiết Xác minh/THA theo E11/E12 | E1–E12 | P1 |
| Chung | Khung mobile riêng cho hiện trường | M1–M8, MO1–MO3 | P2 |

## 5. Còn thiếu bản vẽ Figma (chưa vẽ ở đợt này)

1. Vi bằng: tạo hồ sơ mới, cấp số, trả kết quả, bàn giao, từ chối, huỷ, phân công, bản sao, N-11, MISA xác nhận sai (mỗi thao tác một khung theo mẫu E7/E8).
2. Hợp đồng N-03 và biên soạn N-04 theo phong cách mới.
3. Xác minh: đợt, nguồn, ủy quyền, kết luận. Thi hành án: nghĩa vụ, tài sản, chuyển hồ sơ, chấm dứt vụ việc.
4. Đăng nhập bằng link email, quên mật khẩu, đổi mật khẩu; tìm kiếm toàn cục; trang lỗi 403, 404, trạng thái rỗng.

## 6. Điểm cần chủ dự án chốt

1. Đóng quyển sổ theo tháng lưu trạng thái trong hệ thống hay chỉ in giấy.
2. Công văn đi có bắt buộc bước Trưởng VP duyệt nội bộ trước khi ký không.
3. Hồ sơ lao động S-06 do ai nhập, ở màn nào.
4. Có kênh nhắc ngoài ứng dụng cho nhân viên không.
5. Vẫn chờ khách: số cuối sổ giấy, giấy đăng ký, file Excel N-09 và N-10, văn bản Sở Tư pháp theo Điều 50.
