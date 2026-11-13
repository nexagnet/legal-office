# 01. Sản phẩm và nghiệp vụ

Nguồn chi tiết và có nhãn từng quyết định: [`docs/handoff/NGHIEP-VU-TOAN-DU-AN.md`](../handoff/NGHIEP-VU-TOAN-DU-AN.md). Tệp này tóm lại những gì cần để làm việc ngay, cập nhật đến 13/11/2026.

## 1. Sản phẩm là gì

- **Legal Office** là phần mềm cho **văn phòng Thừa hành viên** (tiền thân là Thừa phát lại; thi hành án dân sự) ở Việt Nam. Nhiều văn phòng (tenant) trên một hệ thống, cách ly bằng row-level security của Postgres.
- Khách đầu tiên: **Văn phòng Hai Bà Trưng, Hà Nội** (một pháp nhân, ba địa điểm: Trụ sở chính, Đông Anh, Bắc Ninh). Văn phòng chỉ có khoảng **20 nhân viên**. Người dùng cuối không có IT.
- Từ **30/10/2026** sản phẩm là **DMS**: hệ thống lưu trữ, tra cứu, lọc hồ sơ và tài liệu pháp lý. **Không** phải phần mềm điều hành quy trình nhân viên: không giao việc nhiều bước, không kanban, không tự gửi công văn, không làm kế toán (MISA là sổ kế toán duy nhất).
- Ba nguyên tắc nền: (1) phần mềm không quyết định pháp lý thay người có thẩm quyền; (2) Admin duyệt trong app không phải chữ ký pháp lý; (3) không làm kế toán.
- Môi trường dev dùng **dữ liệu giả**. Production đang được dựng (xem tệp 03); chưa có dữ liệu khách thật vào hệ thống tính đến 13/11/2026.

## 2. Căn cứ pháp lý

- **NĐ 151/2026/NĐ-CP** (13/05/2026): Văn phòng thi hành án dân sự, Thừa hành viên.
- **TT 08/2026/TT-BTP**: hướng dẫn thi hành, kèm Phụ lục I–IX (sổ S-01..S-06, mẫu N-01..N-11, báo cáo). Điều 37(4): sổ điện tử vẫn phải in hàng tháng, đóng quyển, giáp lai. Điều 38: mẫu sổ mới bắt buộc từ **01/01/2027**, sổ cũ dùng đến hết 2026.
- Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15: liên quan văn bản đồng ý của khách khi nhập 200GB và nơi lưu dữ liệu (xem tệp 04, 06).
- Bản gốc các văn bản và phụ lục nằm trong thư mục tệp của dự án (project files); không sao chép vào repo.

## 3. Bốn nghiệp vụ (cùng một màn danh sách, khác trường dữ liệu)

| Nghiệp vụ | Mã miền | Sổ | Mẫu | Ký hiệu số hồ sơ |
|---|---|---|---|---|
| Vi bằng | `vibang` | S-02 | N-03, N-04, N-11 | `030/2026/VB-THV` (từ 05/11/2026; số VB-TPL cấp trước đó giữ nguyên) |
| Tống đạt | `tongdat` | S-01 | N-01, N-02 | `005/2026/TĐ-TPL` |
| Xác minh điều kiện THA | `xacminh` | S-04 | N-05, N-06 | `…/XM-TPL` |
| Tổ chức THA | `tochuc` | S-05 | N-07, N-08 | `…/TC-TPL` |

Văn thư có 3 sổ riêng (không phải nghiệp vụ hồ sơ): **Văn bản đến, Văn bản đi, Văn bản nội bộ**, cột đúng theo ảnh Excel của khách. S-03 là của Sở Tư pháp (không làm). S-06 là sổ lao động (thuộc Quản trị).

**Quy tắc chung của hồ sơ (đã chốt):**
- Một dòng danh sách = **một hồ sơ** (không phải một tệp). Hiển thị 3 số: tài liệu hiện hành, tệp scan khả dụng, scan đang chờ duyệt sửa đổi.
- **Bản nháp** sửa tự do đến khi "Xác nhận lưu chính thức", sau đó **bất biến**. Hủy nháp giữ lịch sử, không khôi phục.
- **Không xóa, không ghi đè, không sửa trực tiếp** hồ sơ/tài liệu/tệp đã lưu, kể cả Admin. Chỉ thêm tài liệu hoàn toàn mới. Muốn đổi dữ liệu đã lưu: **yêu cầu sửa đổi** (đối tượng, lý do, trước/sau, kèm scan văn bản sửa đổi lập ngoài đời) và Admin duyệt/từ chối. Bản cũ giữ vĩnh viễn.
- Thừa hành viên (THV) được nêu tên trong hồ sơ phải **tự xác nhận trong app** trước khi ghi sổ. Hồ sơ không bắt buộc gắn THV; người tạo luôn thấy hồ sơ mình tạo.
- Thùng rác scan: xóa mềm, giữ 30 ngày, Admin chỉ xem và tải, **không có khôi phục**; cron `scan-purge` xóa hẳn sau 30 ngày.

### Quy tắc mục A / mục C của form hồ sơ (quy tắc của chủ dự án)

- **Mục A chỉ chứa đúng các cột của sổ S-0x** (theo mẫu TT 08). Mọi thông tin khác (tên hồ sơ, số điện thoại, ghi chú...) nằm ở **mục C**. Không thêm cột lạ vào mục A. (PR #420, 05/11.)
- Mục B là tài liệu đính kèm.

### Tống đạt (S-01) từ 13/11/2026 (PR #440)

- Trước đó một hồ sơ Tống đạt có nhiều giấy tờ, mỗi giấy tờ một dòng sổ. Từ 13/11 chủ dự án duyệt **Cách A**: **một hồ sơ = một văn bản tống đạt = một dòng S-01**, giống 3 nghiệp vụ còn lại. Giấy tờ chỉ là tệp đính kèm.
- Số hồ sơ = **STT S-01**, cấp khi "Xác nhận lưu chính thức". Không còn bộ đếm `CASE-TD` (DB và API từ chối nhập số cuối `CASE-TD`).
- Cột 3 của S-01 tự gắn số hồ sơ = STT trước ngày người nhập (`005/2026/TĐ-TPL ngày dd/mm/yyyy`), giống cột số của 3 nghiệp vụ kia (chốt lại 13/11/2026); giá trị cũ người nhập gõ cả số vẫn giữ nguyên.
- Danh sách phẳng, không nhóm theo hồ sơ.
- Migration 0125. Kế hoạch gốc: [reports/ke-hoach-s01-tong-dat-theo-mau-so-2026-11-13.md](reports/ke-hoach-s01-tong-dat-theo-mau-so-2026-11-13.md).

### Đánh số (đã chốt 30/10/2026)

- Hệ thống chỉ tự cấp **"Số đến"** (Văn bản đến) và **"STT"** (các sổ), bộ đếm theo (sổ × văn phòng × năm), không tái dùng số đã hủy, hết năm về 001.
- **Không tự sinh** số vi bằng, số hợp đồng, số quyết định, số/ký hiệu văn bản, số báo cáo. Ba loại số khác nhau: `registerEntryNo` (STT) ≠ `documentOfficialNo` ≠ số hồ sơ. (Số hồ sơ hiện tự hiện mờ trước ô và tự vào sổ: PR #419.)
- Số cuối của sổ giấy cũ nhập ở trang "Nhập số cuối sổ giấy" (S-01, S-02, S-04, S-05).

## 4. Bộ lọc danh sách (13/11/2026, PR #444, migration 0126)

- Lọc theo **nghiệp vụ**, không chủ yếu theo ngày: hàng chip "Việc cần làm" có số đếm (ví dụ Tống đạt: Chưa tống đạt / Đã tống đạt, Chưa có kết quả; Tổ chức THA: Đang thi hành chưa N-08; Vi bằng: Chưa trả / Đã trả kết quả; Thiếu scan; Việc của tôi) cùng hai ô chọn có đếm (`facet_a`, `facet_b`) riêng cho từng nghiệp vụ trong "Bộ lọc khác".
- **Xuất Excel (đang lọc):** `GET /api/dms/case-search/export`, tối đa 10.000 dòng.
- Chưa có chip **"Quá hạn"** vì chưa có khái niệm hạn xử lý (việc dang dở, xem tệp 06).
- Thiết kế lại vùng lọc (bỏ ô tìm trùng với header, 3 hàng có nhãn, hàng "Đang lọc") **đang chờ chủ dự án duyệt** bản vẽ HTML: proposals/thiet-ke-vung-loc-2026-11-13.html trong thư mục tệp dự án (không ở trong repo). Figma hết hạn mức công cụ gói Starter nên bản vẽ làm bằng HTML.

## 5. Phân quyền (hiện hành)

- Quyền theo **nhóm quyền** (không có vai cứng). Mã `<nv>.<hành động>.<own|all>`; nv ∈ vibang, tongdat, xacminh, tochuc, vtden, vtdi, vtnb; hành động ∈ read, draft, confirm, add_document, download, amend_request. Tổng **92 quyền** = 7 nghiệp vụ × 6 hành động × 2 phạm vi + 8 quyền đặc biệt (ví dụ `dms.amendment.approve`, `dms.audit.export`, `dms.legacy.import`, `dms.legacy.read`, `dms.stock.write`).
- Phạm vi **chi nhánh**: người dùng chỉ thấy hồ sơ/sổ/báo cáo của chi nhánh được cấp; hồ sơ chưa gắn chi nhánh chỉ Admin thấy. Người tạo luôn thấy hồ sơ mình tạo.
- Nhóm **"Admin"** của hệ thống không xóa, không đổi tên, không đổi quyền; tài khoản vai Admin hoặc thuộc nhóm Admin không có quyền riêng. Quyền riêng theo tài khoản = nhóm + cấp riêng − thu hồi riêng. Admin đổi quyền trực tiếp, có hiệu lực ngay, ghi nhật ký (không còn luồng đề xuất/duyệt đổi quyền từ 04/11).
- 6 nhóm mẫu được bảo vệ (văn phòng sao chép rồi chỉnh): [docs/handoff/tham-chieu/bang-quy-doi-nhom-quyen-mau.md](../handoff/tham-chieu/bang-quy-doi-nhom-quyen-mau.md). Nhóm "mẫu Văn thư" được xem 4 nghiệp vụ toàn văn phòng (PR #428).
- Thêm mã quyền mới = vá hai CHECK constraint và các hàm `dms_permission_propose`, `dms_my_permissions`, `dms_group_copy`, cùng test đếm danh mục ở web (`permission-model.test.tsx`).
- Tài khoản: mật khẩu bắt buộc (tối thiểu 12 ký tự), CCCD 12 số tùy chọn và duy nhất, đăng nhập bằng email hoặc CCCD, buộc đổi mật khẩu lần đầu, quên mật khẩu qua link email (cần SMTP).

## 6. Các mảng khác

- **Sổ pháp định và PDF:** S-01, S-02, S-04, S-05 xuất đúng mẫu Phụ lục I (bìa, trang ruột) bằng pdfkit + font Tinos (`apps/api/src/dms/book-pdf*.ts`). S-05 giữ 13 cột như mẫu, cột 3 để trống. Hộp thoại in trên máy thật **chưa được xác nhận**.
- **Báo cáo N-09/N-10:** chỉ **tổng hợp số liệu** (khách tự điền mẫu chính thức). Tiền/doanh thu không tính được ("chưa đủ dữ liệu"). Cột Tổ chức THA ở N-09 còn mở (nên đếm việc đã tổ chức xong?).
- **Văn phòng phẩm:** danh mục, tồn, nhập/xuất, kiểm kê; điều chỉnh không cần duyệt nhưng lý do bắt buộc (server ép); backend lô/FIFO.
- **OCR tự host** (Tesseract `vie`): chỉ phục vụ tìm kiếm, không gửi dữ liệu thật ra dịch vụ ngoài. Chất lượng mới đo trên mẫu tổng hợp, **chưa đo scan thật**.
- **Tài liệu cũ (legacy):** tệp nhập hàng loạt, bất biến, có OCR và tìm kiếm tùy chọn (xem tệp 04).
- **Tab Tài liệu của chi tiết hồ sơ** được thiết kế lại ngày 13/11 (PR #445, #446): một nút Tải lên, danh sách gọn, menu ⋯, gộp tab "Tệp đính kèm" và "Phiên bản cũ".
- **Dữ liệu cá nhân thật** (CCCD, SĐT khách...) không được đưa vào repo, báo cáo hay log.
