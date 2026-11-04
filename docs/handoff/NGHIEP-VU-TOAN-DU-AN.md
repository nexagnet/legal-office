# Legal Office — Nghiệp vụ toàn dự án (bản bàn giao 02/11/2026)

Dành cho: Claude project mới (tài khoản khác) tiếp tục toàn bộ công việc. Chủ dự án: **Phùng Việt** (GitHub `phungtienviet14-sketch`), giao tiếp tiếng Việt.

**Cách đọc nhãn.** Mỗi quyết định có nhãn:

| Nhãn | Nghĩa |
|---|---|
| 🔒 CHỐT | Chủ dự án (CD) hoặc khách (Vân Khanh, VK) đã quyết, có ngày. Không hỏi lại, không tự đổi. |
| ⚖ LUẬT | Ràng buộc từ NĐ 151/2026/NĐ-CP, TT 08/2026/TT-BTP. |
| 🟡 ĐỀ XUẤT | Claude đề xuất, CD chưa xác nhận rõ. Có thể đổi. |
| ❓ MỞ | Chưa quyết. Không được coi là quy tắc. |

Đọc kèm: `DANH-SACH-TAI-LIEU.md` (mọi tài liệu), `PROJECT-INSTRUCTIONS-MOI.md` (bản dán vào project mới), `tham-chieu/` (câu hỏi khách 72 câu, bảng nhóm quyền mẫu).

> **Cảnh báo tài liệu cũ.** `docs/product/nghiep-vu-toan-du-an.md` (26/10), `nghiệp vụ.md` (11/10), Issue #1 và `legal-office-huong-dan-su-dung.pdf` mô tả **quy trình công việc cũ** (giao việc THV, MISA, duyệt 48h...). Từ **30/10/2026 sản phẩm chuyển sang DMS** (quản lý hồ sơ/tài liệu). Khi hai nguồn mâu thuẫn, **mục 2–3 của tài liệu này thắng**. `nghiệp vụ.md` vẫn đúng ở phần pháp lý, danh mục biểu mẫu, thông tin văn phòng.

---

## 1. Mục tiêu sản phẩm

- Phần mềm cho **Văn phòng thi hành án dân sự** (khách đầu tiên: Văn phòng Hai Bà Trưng, Hà Nội; một pháp nhân, ba địa điểm: Trụ sở chính, Đông Anh, Bắc Ninh). Thiết kế đa khách: mỗi văn phòng một **tenant** (cách ly bằng RLS Postgres). Không hard-code tên khách.
- Người dùng cuối không có IT; người dùng: Admin duy nhất, Thừa hành viên (THV, trước gọi Thừa phát lại), Thư ký, Văn thư, Kế toán, Trưởng VP... (nay là **nhóm quyền**, không còn vai cứng, xem mục 4).
- Nhà thầu/đối tác phát triển: Nexagnet (repo `nexagnet/*`). Khác với `nexagnet-platform` (nền tảng AI Zalo, dự án khác). **Không viết code pháp lý vào platform.**
- **Bản chất (🔒 CD 30/10/2026):** DMS = hệ thống lưu trữ, tra cứu, lọc hồ sơ và tài liệu pháp lý + văn phòng phẩm. **KHÔNG** phải phần mềm quản lý quy trình nhân viên: không giao việc nhiều bước, không kanban, không theo dõi tiến độ nhân viên, không tự gửi công văn/báo cáo. Ngoại lệ duy nhất giữ lại: quy trình **yêu cầu sửa đổi + Admin duyệt** (kiểm soát thay đổi).
- Ba nguyên tắc nền (🔒): (1) phần mềm không quyết định pháp lý thay người có thẩm quyền; (2) Admin duyệt trong app ≠ ký pháp lý; (3) không làm kế toán, MISA là sổ kế toán duy nhất.
- Hiện **chưa có production**. Mọi dữ liệu trong hệ thống là **dữ liệu giả/thử**. Dữ liệu khách thật chỉ vào khi CD cho phép.

## 2. Quyết định nghiệp vụ ĐÃ CHỐT (DMS), theo thời gian

Nguồn chi tiết: Issue GitHub **#265** (DMS master, có addendum 30/10), `reports/dms-baseline-2026-10-30.md` (bảng ID P-/D-/A-/N-/V-/F-/O-/L-). Người chốt: CD = Phùng Việt; VK = khách Vân Khanh (đại diện văn phòng).

### 2.1 Ngày 30/10/2026 (CD + VK)
1. 🔒 Bốn module hồ sơ: **Vi bằng, Tống đạt, Xác minh điều kiện THA, Tổ chức THA**, cùng UX danh sách, khác trường dữ liệu. Một dòng danh sách = **một hồ sơ** (không phải một file). Hiển thị riêng 3 con số: tài liệu hiện hành, file scan khả dụng, scan đang chờ duyệt sửa đổi.
2. 🔒 **Không xóa, không ghi đè, không sửa trực tiếp** hồ sơ/tài liệu/file đã lưu — kể cả Admin. Chỉ thêm **tài liệu hoàn toàn mới** (không cần duyệt).
3. 🔒 Muốn đổi dữ liệu đã lưu: **AmendmentRequest** = nêu đối tượng, lý do, giá trị trước/sau + **scan văn bản sửa đổi lập ngoài đời** → **Admin duyệt/từ chối**. Duyệt: lưu trước/sau, giữ bản cũ vĩnh viễn, nguyên tử, chống duyệt lặp, phát hiện xung đột phiên bản. Từ chối: không đổi gì, lưu lý do. Scan của yêu cầu là "đang chờ", chưa tính vào hiện hành.
4. ⚖🔒 N-11 chỉ dùng cho **sửa lỗi kỹ thuật Vi bằng** (Điều 31 NĐ 151). Ba nghiệp vụ còn lại cần văn bản thực tế phù hợp, không bịa mẫu chung. Admin duyệt trong app không thay chữ ký pháp lý.
5. 🔒 **Phân quyền chi tiết**, thực thi ở **backend**, mặc định từ chối; ẩn nút không đủ. Tìm kiếm/đếm/preview không lộ dữ liệu ngoài quyền.
6. 🔒 **Đánh số:** hệ thống chỉ tự cấp **"Số đến"** (sổ văn bản đến) và **"STT"** (các sổ), bộ đếm theo (sổ × văn phòng × năm), không tái dùng số đã hủy. **Không tự sinh** số Vi bằng, số hợp đồng, số quyết định, số/ký hiệu văn bản, số báo cáo. Ba loại số khác nhau: `registerEntryNo` ≠ `documentOfficialNo` ≠ `caseInternalId`.
7. 🔒 **Văn thư** = 3 sổ (đến / đi / nội bộ) với cột đúng theo 3 ảnh Excel của khách (file `1791541*.jpg` trong project-files) + cột scan. Không soạn thảo/phát hành/gửi công văn. Cột đầu sổ nội bộ giữ nguyên chữ "Số Ký hiệu Văn bản đi".
8. 🔒 **Sổ S-01, S-02, S-04, S-05** là sổ pháp định, xuất đúng mẫu Phụ lục I TT 08. S-03 là của Sở Tư pháp (không làm). S-06 là sổ lao động (thuộc Quản trị).
9. 🔒 **Báo cáo N-09/N-10** = chỉ **tổng hợp số liệu** để khách tự điền; không tạo/ký/gửi. Màn chính là bảng chỉ tiêu theo Figma có nút sao chép; mẫu Phụ lục III giữ làm phụ "Mẫu báo cáo". Phải nói rõ chỉ tiêu nào "chưa đủ dữ liệu" (tiền nằm ở MISA).
10. 🔒 **Văn phòng phẩm**: danh mục, ĐVT, tồn đầu, nhập, xuất, tồn, người nhận, lịch sử điều chỉnh. UI đơn giản theo Figma; backend giữ lô/FIFO. Không mua sắm/duyệt nhiều cấp.
11. 🔒 **OCR tự host** (Tesseract `vie`), chỉ phục vụ tìm kiếm, không gợi ý quyết số văn bản, **không gửi dữ liệu thật ra dịch vụ ngoài**.
12. 🔒 Giữ stack: Next.js, NestJS, Postgres, pnpm, modular monolith. Không đổi framework/ORM.

### 2.2 Ngày 30–31/10/2026
13. 🔒 Phân quyền theo **Nhóm quyền** (Permission Group); **không có Role cứng**, **không có "Trưởng văn phòng duyệt"**. Hai quyền duyệt tách riêng: duyệt sửa hồ sơ (`dms.amendment.approve`) và duyệt đổi quyền (`dms.permission.approve`). ~~Người đề xuất không tự duyệt.~~ (Đã thay ở mục 2.4A: luồng đề xuất/duyệt đổi quyền đã bỏ, Admin đổi trực tiếp.)
14. 🔒 **Bản nháp**: cho cả 4 nghiệp vụ và 3 sổ Văn thư; sửa tự do đến khi **"Xác nhận lưu chính thức"**, sau đó bất biến. Hai quyền riêng: "Tạo/sửa nháp" và "Xác nhận lưu chính thức". "Hủy nháp" giữ lịch sử, không xóa cứng, **không khôi phục** được.
15. 🔒 (31/10) **Không kiểm** thiếu scan N-04. Chỉ **một Admin** → ~~khôi phục bằng link email~~ (thay ở mục 2.4A: quên mật khẩu dùng link đặt lại qua email). Admin toàn quyền nhưng **vẫn** không xóa/ghi đè/sửa trực tiếp bản đã lưu; thao tác của chính Admin **không cần ai duyệt** (làm ngay, ghi nhật ký). Thu hồi quyền khẩn: Admin, tức thì, có nhật ký.
16. 🔒 (31/10) THV được nêu tên trong hồ sơ **phải tự xác nhận trong app** trước khi ghi sổ. Điều chỉnh tồn kho văn phòng phẩm: **không cần duyệt** nhưng **bắt buộc có lý do** (server ép). Menu workflow cũ **ẩn hẳn** (dữ liệu, trang, API vẫn giữ). `window.confirm` thay bằng modal trong trang.
17. 🔒 (31/10) Quyền merge: Claude tự merge PR khi CI đúng head xanh và không còn review mở (xem mục 14).

### 2.3 Ngày 01/11/2026
18. 🔒 **Bỏ hẳn** "tự động duyệt yêu cầu sửa đổi sau N giờ" (thay cho D-11..D-13 trong baseline, **baseline lỗi thời ở điểm này**).
19. 🔒 **Phạm vi theo địa điểm (chi nhánh):** người dùng chỉ thấy hồ sơ/sổ/báo cáo của chi nhánh được cấp (kể cả Văn thư xem sổ). Hồ sơ **chưa gắn chi nhánh** chỉ Admin thấy cho đến khi Admin gắn (một lần NULL → chi nhánh, ghi nhật ký). Văn phòng không có chi nhánh thì không giới hạn. (PR #302, #305; migration 0092, 0094.)
20. 🔒 **Thẻ THV:** Admin nhập trực tiếp, **không có bước xác nhận**; thẻ chỉ hiển thị, độc lập, không chặn gì; "Ngừng hiệu lực" giữ lịch sử, không xóa. (PR #307, migration 0095.)
21. 🔒 **6 nhóm quyền mẫu** theo bảng đã duyệt (`tham-chieu/bang-quy-doi-nhom-quyen-mau.md`).
22. 🔒 **Quyền riêng theo từng tài khoản**, đặt được ngay lúc tạo tài khoản: quyền hiệu lực = các nhóm + cấp riêng − thu hồi riêng. Admin có quyền duyệt xử lý yêu cầu sửa đổi/đổi quyền của người không phải Admin. (PR #328 và liên quan, migration 0099–0101.)
23. 🔒 Xuất "bản sao" nhật ký phân quyền (`dms.audit.export`), việc xuất cũng được ghi nhật ký (PR #308, migration 0096).
24. 🔒 CD: "bạn đã hiểu hết nghiệp vụ" → điều phối **tự chốt** mọi thứ suy ra được từ quy tắc đã chốt/Figma, không hỏi lại CD. CD kỳ vọng khi hỏi thì công việc đã xong >90%.

### 2.4A Ngày 04/11/2026 (P0–P8, PR #390–#403)
24. 🔒 **Hồ sơ không bắt buộc gắn THV**; người tạo luôn được lưu và **luôn thấy hồ sơ mình tạo** (kể cả ngoài chi nhánh được cấp; bản nháp chỉ người tạo thấy). Menu "Hồ sơ do tôi tạo"; "Mọi hồ sơ của văn phòng" chỉ hiện khi có quyền `*.read.all`. Tab "Lịch sử hồ sơ" (migration 0111).
25. 🔒 **Nhóm "Admin" hệ thống**: không xóa, không ngừng dùng, không đổi quyền; tài khoản có vai ADMIN hoặc thuộc nhóm Admin không đặt quyền riêng. Chỉ Admin tạo/xóa nhóm quyền (0112).
26. 🔒 **Bỏ luồng Đề xuất/Duyệt đổi quyền**: Admin đổi nhóm, quyền của nhóm (ma trận 7 nghiệp vụ x 6 hành động x 2 phạm vi + 8 quyền đặc biệt = 92 quyền) và quyền riêng trực tiếp (`POST /dms/groups/:id/changes`, 0114); lý do quyền riêng của Admin tự đổi không bắt buộc. Nhật ký phân quyền gộp vào Lịch sử hoạt động, nhóm Phân quyền (0115).
27. 🔒 **Tài khoản**: mật khẩu bắt buộc (tối thiểu 12 ký tự), CCCD 12 số không bắt buộc và duy nhất, đăng nhập bằng email hoặc CCCD, bắt đổi mật khẩu ở lần đăng nhập đầu, quên mật khẩu bằng link email; bỏ đăng nhập bằng link email (0113).
28. 🔒 **Quản trị gọn**: Tài khoản, Nhóm quyền, Chi nhánh, Cài đặt văn phòng (Thư ký không còn vào Cài đặt). Thẻ THV và Hồ sơ lao động là tab của tài khoản; `of_personnel.user_id` (0116). Màn nghiệp vụ cũ (vi-bang, tong-dat, hop-duyet, so-sach…) chỉ còn chuyển hướng sang `/dms`; component/lib mồ côi đã xóa (P7).

### 2.4 Ngày 02/11/2026 (quyết định giao diện/xuất sổ do điều phối chốt)
25. 🔒 Danh sách theo **Figma DMS v2**: giữ bố cục Figma **nhưng không bỏ cột nào**; dùng `DataTable` chung (cột đầu cố định, nút "Cột hiển thị" mặc định hiện đủ, chế độ gọn, đầu bảng dính). Dưới 1280px nút Xem/Tải hiện thêm ở cột đầu (hai dòng). Văn thư: hàng lọc mặc định chỉ ô tìm + Năm, phần còn lại trong "Bộ lọc nâng cao" đóng sẵn. Giữ mục menu "Chờ tôi xác nhận" và "Thư viện biểu mẫu" dù Figma không có. Ô đếm không có giá trị hiện "—".
26. 🔒 PDF sổ: S-05 giữ **13 cột** như mẫu, cột 3 "Quyết định về thi hành án" để trống (web/Excel vẫn 12 cột); in tên pháp lý đầy đủ của văn phòng; dòng địa chỉ để chấm; chỉ thêm số trang nhỏ.

### 2.5 Quyết định cũ còn hiệu lực (từ trước pivot)
- 🔒 Đăng nhập: mật khẩu **hoặc** link qua email (một lần, hết hạn 15 phút, sinh mã 6 số...), cho **mọi tài khoản**; khóa 15 phút sau 5 lần sai.
- 🔒 CD cho phép Claude tự quyết các câu nghiệp vụ còn mở bằng đề xuất tốt nhất (21/10/2026) miễn ghi giả định; **không** áp cho secret, xóa service, dữ liệu khách thật, production.
- ❓ **MISA gate** cũ (xác nhận thanh toán trước khi cấp số Vi bằng): baseline đề xuất coi là đã bị thay thế bởi DMS (D-2), CD chưa xác nhận rõ. Đừng dựng lại, cũng đừng xóa dữ liệu cũ.

## 3. Mô hình dữ liệu (DMS)

| Thực thể | Ý nghĩa |
|---|---|
| `CaseFile` (`dms_case_files`) | Một hồ sơ; miền (domain), trạng thái nháp/đã ghi sổ/đã hủy, chi nhánh, người tạo, thuộc tính theo mẫu |
| `LegalDocument` (`dms_documents`) | Tài liệu logic trong hồ sơ |
| `DocumentFile` / `DocumentVersion` | File scan, bất biến, SHA-256, phiên bản cũ giữ mãi |
| `AmendmentRequest` | Yêu cầu sửa đổi: loại (`ADD_SUPPORTING_FILE`, `CORRECT_EXISTING_METADATA`, `SUPERSEDE_DOCUMENT`, `LEGAL_TECHNICAL_CORRECTION`), trước/sau, scan căn cứ, trạng thái PENDING → APPLIED/REJECTED |
| `BookEntry` + bộ đếm | Dòng trong sổ S-xx và 3 sổ Văn thư; STT/Số đến cấp bằng bộ đếm khóa dòng, không đứt quãng |
| `AuditRecord` (`dms_audit_records`) | Nhật ký chỉ ghi thêm |
| Phân quyền | Nhóm quyền, thành viên nhóm, cấp/thu hồi riêng, `dms_branch_access`, yêu cầu đổi quyền |
| Văn phòng phẩm | Danh mục, lô, nhập/xuất, kiểm kê |
| OCR | `dms_ocr_results`, `dms_ocr_search_index` |
| Chỉ mục tìm | `dms_case_index` (một dòng/hồ sơ, `search_text` bỏ dấu), `dms_saved_filters` |

Năm thuộc tính người tách riêng: `createdBy`, `responsibleThv`, `legalSigner`, `approvedByAdmin`, `documentOriginalIssuer`.

## 4. Phân quyền (hiện hành)

- Quyền = (người dùng × văn phòng × nghiệp vụ × hành động × phạm vi `own|all`) + phạm vi chi nhánh. Mã dạng `<nv>.<hành động>.<own|all>`, nv ∈ vibang, tongdat, xacminh, tochuc, vtden, vtdi, vtnb; hành động ∈ read, draft, confirm, add_document, download, amend_request. Quyền đặc biệt: `dms.amendment.approve`, `dms.permission.approve`, `dms.permission.propose`, `dms.stock.write`, `dms.audit.export`.
- Admin mặc nhiên có mọi quyền DMS ở văn phòng mình (migration 0086), thấy mọi chi nhánh.
- 6 nhóm mẫu được bảo vệ (văn phòng sao chép rồi chỉnh); nhóm sao chép **không** mang `dms.amendment.approve`, `dms.audit.export`.
- Thêm mã quyền mới = vá hai CHECK constraint + `dms_permission_propose`, `dms_my_permissions`, `dms_group_copy`, và test đếm danh mục ở web (`permission-model.test.tsx`).
- Từ 04/11/2026 không còn luồng đề xuất/duyệt đổi quyền: Admin đổi nhóm, quyền nhóm và quyền riêng trực tiếp, có hiệu lực ngay, ghi nhật ký (xem mục 2.4A).
- Thiết kế gốc: Figma trang N11 (P0–P12), `reports/phan-quyen-figma-2026-10-30.md`.

## 5. Bốn nghiệp vụ

Cùng màn danh sách (Figma DMS v2: 352:964 Vi bằng, 352:1415 Tống đạt, 352:1613 Xác minh, 352:1811 Tổ chức), tab Chính thức / Nháp / Đã hủy, thẻ tổng, chip lọc, tìm kiếm, phân trang, "Xuất sổ" và "+ Tạo hồ sơ".

| Nghiệp vụ | Sổ | Mẫu liên quan | Ghi chú |
|---|---|---|---|
| Vi bằng | S-02 | N-03, N-04, N-11 | THV nêu tên phải tự xác nhận. Số Vi bằng nhập từ bản thật. |
| Tống đạt | S-01 | N-01, N-02 | S-01 một dòng cho mỗi văn bản được tống đạt |
| Xác minh điều kiện THA | S-04 | N-05, N-06 | |
| Tổ chức THA | S-05 | N-07, N-08 | N-08 là bàn giao hồ sơ khi VP chấm dứt |

Chi tiết hồ sơ (Figma 352:2613): tiêu đề mã hồ sơ, thanh cảnh báo yêu cầu sửa chờ duyệt, 6 tab (Thông tin chung, Tài liệu, Tệp đính kèm, Phiên bản cũ, Yêu cầu sửa đổi, Sổ liên quan), xem trước PDF, tải scan chính/In/Tạo yêu cầu sửa đổi.

## 6. Sổ Văn thư

Ba tab: **Văn bản đến** (cột: Ngày đến, **Số đến** tự cấp, Cơ quan ban hành, Số ký hiệu, Ngày tháng văn bản, Trích yếu, Đơn vị/người nhận, Ký nhận, Ghi chú, Scan), **Văn bản đi**, **Văn bản nội bộ** (đúng cột từ ảnh Excel của khách). Mỗi dòng đính 1..n scan, xem/tải ngay cạnh dòng; lọc theo năm; tìm số/cơ quan/người ký/trích yếu; xuất Excel và "Xuất PDF để in". Có nháp, hủy nháp, ghi chính thức như hồ sơ.

## 7. Sổ pháp định S-01..S-06 và xuất PDF

- S-01, S-02, S-04, S-05: xuất đúng mẫu Phụ lục I TT 08 (bìa 1, bìa 2, trang ruột). `GET /dms/books/:book?format=pdf`, pdfkit + font Tinos, tọa độ trong `apps/api/src/dms/book-pdf-layout.ts`, `book-pdf.ts`. Văn thư theo Excel của khách. (PR #352.)
- ⚖ TT 08 Điều 37(4): sổ điện tử vẫn phải in hàng tháng, đóng quyển, giáp lai. Điều 38: mẫu S mới bắt buộc từ **01/01/2027**; sổ cũ dùng đến hết 2026.
- S-03: của Sở Tư pháp. S-06: lao động (Quản trị).
- Đang làm: khung xem trước PDF thật + nút in mở hộp thoại in (PR #360 draft).

## 8. Báo cáo N-09 / N-10

- Màn `/dms/bao-cao`: bảng chỉ tiêu có nút sao chép (đếm từ hồ sơ người xem được). ⚖ N-10 chỉ có kỳ 12 tháng và đột xuất (không có 6 tháng); N-09 6 tháng và năm; chốt số liệu hết 24h ngày cuối kỳ.
- Tiền/doanh thu **không tính được** → "chưa đủ dữ liệu". Cột Tổ chức THA ở N-09 từng trống vì quy tắc đếm chưa chốt (❓ nên hỏi CD: chỉ đếm việc đã tổ chức xong?).
- Báo cáo đã lập ngoài và gửi đi có thể đăng ký vào Sổ văn bản đi + scan.

## 9. Văn phòng phẩm

Danh mục, ĐVT, tồn đầu, nhập, xuất, tồn, người/bộ phận nhận, ngày, ghi chú, lịch sử điều chỉnh. Quyền `dms.stock.write`. Kiểm kê áp điều chỉnh ngay, lý do bắt buộc ở server. Backend lô/FIFO; UI đơn giản theo Figma. (E2E 31/10: đã kiểm điều chỉnh lô + hoàn lại.)

## 10. OCR và tìm kiếm

- OCR: Tesseract 5 `vie`, PDF có lớp chữ dùng `pdftotext`, không thì `pdftoppm` 300 dpi (tối đa 50 trang). Worker `apps/api/src/ocr/ocr.cli.ts`; trên Northflank chạy dạng **Cron Job `lo-ocr`** (mỗi 1 phút, `OCR_ONCE=1`, concurrency 1, 0,2 vCPU/512MB; tăng bị từ chối do gói miễn phí). Chất lượng đo trên mẫu tổng hợp tốt, **chưa đo scan thật**; nếu kém thử PaddleOCR sau cổng `OcrEngine`. Chi tiết `docs/engineering/ocr.md`.
- Tìm kiếm quy mô 200GB (PR #286 nhập, migration 0098): `docs/engineering/dms-scale-search.md` (chỉ mục `dms_case_index`, quyền xem tính một lần, trigram, keyset, facet có đếm, hàm `SECURITY DEFINER` ép chi nhánh).
- Ô tìm nội dung scan, gợi ý khi gõ, bộ lọc đã lưu: có trên `/dms/tim-kiem`.
- **Công cụ nhập 200GB tài liệu cũ:** `tools/lo-import-win-x64.zip` (PR #286), CD chạy trên máy khách, thử thư mục nhỏ trước. Đề xuất: `reports/de-xuat-nhap-200gb-tai-lieu-cu-2026-10-31.md`.

## 11. Kiến trúc kỹ thuật

- Monorepo pnpm: `apps/api` (NestJS 11, Postgres 17, Drizzle + SQL migration thuần ở `apps/api/drizzle/NNNN_*.sql`), `apps/web` (Next.js 15, React, TanStack Table, RHF+Zod, theme "Navy–Serif" `theme-v2.css`), `packages/*`, `tools/`, `tests/`.
- Bảo mật: RLS ép buộc theo tenant (`app.tenant_id`), vai ứng dụng `legal_app` không superuser; quyền thật nằm ở **hàm SQL**; nhật ký chỉ ghi thêm; file lưu **Cloudflare R2** (`FILE_STORE=r2`, bucket riêng tư).
- Migration: tự áp khi `lo-api` khởi động (khóa advisory, mỗi file một transaction), **phải tương thích ngược** với bản API đang chạy. Số migration mới nhất trên main khi bàn giao: **0102**. **Luôn kiểm main trước khi chọn số** — luồng song song từng đụng số (0097, 0098, 0100, 0101).
- Tài liệu kiến trúc: `docs/architecture/*`, `docs/engineering/*`. Hướng dẫn sử dụng cũ: `docs/user-guide/` (quy trình cũ).

## 12. Hạ tầng (không ghi bí mật — chỉ ghi chúng nằm ở đâu)

- **Northflank, tài khoản THỨ HAI của CD** (tên team dạng `…-team-legal-office-owner-…`). Project `legal-office`. Dịch vụ: `lo-postgres` (addon PG17), `lo-api` (cổng 3001, health `/health`), `lo-web` (cổng 3000), Job `lo-ocr`, (job `lo-migrate` cũ). Nhóm biến: `lo-secrets` (bí mật), `lo-config` (không bí mật: `WEB_ORIGIN`, `PUBLIC_WEB_URL`). CD (deploy tự động) từ nhánh `main`. Gói miễn phí chỉ 2 service slot (đã dùng hết).
- **Tài khoản Northflank của dự án khác `bmsl`: tuyệt đối không đụng.** CLI: dùng profile riêng (`USERPROFILE=C:\nfhome` trên máy CD, context đúng; `legal-office-owner` ở profile mặc định là SAI). Luôn kiểm context trước khi ghi. Không `patch` nhóm `lo-secrets` bằng payload một phần (từng làm mất biến).
- **Địa chỉ:** https://www.nexagnet.com (DEV, chưa production) và https://dev.nexagnet.com (CNAME `dev` → `dev.nexagnet.com.phun-pgcd.dns.northflank.app` ở zonedns.vn, gắn `lo-web`; dùng cho E2E). Đổi `WEB_ORIGIN` ở `lo-config` rồi **khởi động lại `lo-api`**. CD quyết định **không** chuyển nameserver sang Cloudflare.
- **Tài khoản thử và mật khẩu:** nằm trên **máy của CD**, `~/Documents/legal-office-test-accounts-thu.txt` và `legal-office-admin-thu.txt`. Không ở trong repo. CD cho phép Claude dùng tài khoản thử trên môi trường dev. Email đăng nhập chỉ chứa link.
- **File:** R2 (khóa trong `lo-secrets`). **SMTP:** cấu hình ở Quản trị.
- **Device/`claude rc`:** chỉ dùng `C:\Users\phung\Documents\vietpt\nexagnet\legal-office`. Phiên device có thể offline làm công việc dừng → ưu tiên thread đám mây cho code.
- Chi tiết: `docs/engineering/northflank-deploy.md`, PR #224 (dựng lại trên tài khoản mới, đang mở), #198.

## 13. Quy trình làm việc

- GitHub là nguồn sự thật. Vòng đời: Issue/Task Contract → Builder → PR → **CI đúng head (exact-head)** → Reviewer → Repair → merge theo mức rủi ro → CI main → bằng chứng chạy thật.
- CI (`.github/workflows/ci.yml`): `bootstrap-verify`, `bootstrap-safety`, `app-verify` (lint, typecheck, unit, build, format:check), `audit`. Ruleset `main-protection`: **nhánh phải mới nhất so với main** → `update-branch` → CI → merge ngay. **Force-push bị chặn**; đồng bộ nhánh bằng `merge origin/main` (hoặc `merge -s ours`) rồi push thường. Nhánh thread hay tái dùng tên sau merge: `fetch` + `checkout -B` từ `origin/main`.
- Rủi ro: R0/R1 tự merge có bằng chứng; **R2** (auth, phân quyền, dữ liệu pháp lý, migration) Claude **được tự merge** khi CI đúng head xanh và không còn review mở (CD 31/10); **R3** (`.github`, CI/CD, hạ tầng, secret, deploy) **hỏi trước**; **production deploy** hỏi trước; đổi secret và xóa service luôn hỏi.
- GitHub MCP không có GraphQL; dùng REST (`gh api`). Review thread/auto-merge/ready-for-review qua route `…/pulls/{n}/ccr/…`.
- Tự quyết nghiệp vụ suy ra được; **không** quyết điều chưa chốt có ảnh hưởng pháp lý/tiền/dữ liệu khách; không dùng dữ liệu khách thật; không gửi dữ liệu ra dịch vụ ngoài.
- Báo cáo mỗi đợt ghi vào `/mnt/project-files/reports` (hoặc `docs/` trong repo khi cần bền).

## 14. Quy tắc của chủ dự án (luôn áp dụng)

1. **Tìm thư viện có sẵn trước khi tự viết code.**
2. **Bảng không bao giờ bỏ cột**: dùng `DataTable` chung (cột đầu/hành động cố định, cắt chữ + hover, "Cột hiển thị", gọn).
3. **Figma là chuẩn** (file `bueSNVniMoYD6lQFHwqeHz`, bản Full UX; Figma DMS v2 + N11 phân quyền là canonical); UI phải khớp **chi tiết**. Link: https://www.figma.com/design/bueSNVniMoYD6lQFHwqeHz/Nexagnet-Vi-bang-Quan-ly-Van-phong-Hai-Ba-Trung-Full-UX?node-id=92-2
4. Menu hover không được làm xê dịch mục. Kiểm responsive ở 1440 / 1024 / 768 / 390.
5. Email đăng nhập chỉ chứa link, cho mọi tài khoản.
6. Không đổi secret, không xóa service khi chưa hỏi.
7. Mọi PR chạm giao diện: chụp ảnh dev **trước/sau** đối chiếu Figma, lưu ở `reports/`.
8. Trả lời CD bằng tiếng Việt, ngắn, kết quả trước.

## 15. Việc còn mở và thứ tự ưu tiên

Trạng thái chi tiết từng luồng: **Issue ghim "Bàn giao trạng thái 2026-11-02"** trong `nexagnet/legal-office`.

1. **Hoàn thiện đang dở** (CD yêu cầu theo thứ tự này):
   a. Danh sách 4 nghiệp vụ khớp Figma: #358 đã merge; còn ảnh dev xác nhận Tống đạt ở 1024, chụp trạng thái lỗi, mobile M2 357:799.
   b. Xuất PDF sổ: #360 đã merge (khung xem trước là PDF thật; sửa nút in đã có nhưng **chưa xác nhận hộp thoại in hiện trên màn hình thật**); kiểm 7 PDF trên dev.
   c. Dữ liệu giả: PR #359 nay chỉ còn script `tools/seed-demo`. Thread E2E trên máy chủ được giao: chạy seed trên dev, đợi OCR, kiểm tìm nội dung scan, xuất sổ, thử hộp thoại in, chụp ảnh 1024px.
   d. Figma-match còn lại: Tống đạt/Xác minh/Tổ chức màn tạo và chi tiết, trạng thái trống/lỗi; E2E cuối cùng zero lỗi.
2. **Kiểm thử và tối ưu tìm kiếm/lọc dữ liệu lớn** (quy mô 200GB, CD để Claude tự quyết cách làm).
3. **Tài liệu hướng dẫn sử dụng mới**: bám đúng quy tắc DMS đã chốt, ảnh chụp trên PC (Chrome) từ bản Northflank, **khoanh vùng + chú thích**. Bản PDF cũ là quy trình cũ, làm lại.
4. Câu hỏi mở nhỏ (🟡/❓): hồ sơ không có tài liệu vẫn ghi sổ được (có bắt buộc?); quy tắc đếm cột Tổ chức THA ở N-09; xác nhận MISA gate đã bị thay (D-2); mẫu Excel gốc N-09/N-10 của khách (chưa có → xuất chính thức = chưa chứng minh); đo OCR trên scan thật; dọn tệp tạm mồ côi; production + dữ liệu khách thật chưa được phép.
5. Dọn kho: PR/nhánh cũ liệt kê trong Issue bàn giao (nhiều nhánh đã squash-merge; chưa xóa, hỏi CD).
