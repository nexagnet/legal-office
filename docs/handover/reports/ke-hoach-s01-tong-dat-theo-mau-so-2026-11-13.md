# Kế hoạch: danh sách Tống đạt (S-01) theo đúng mẫu sổ + bộ lọc cho 4 nghiệp vụ

Ngày 13/11/2026. CHƯA CODE. Chờ anh duyệt (có 1 câu hỏi cần chốt ở mục 2).

## 1. Hiện trạng (đã khảo sát trong code)

- Mẫu TP-THV-S-01 (TT 08/2026, Phụ lục I) có 10 cột: STT, Loại văn bản, Số/ngày/tháng/năm văn bản cần tống đạt, 3 cột ✓ cơ quan giao (Tòa án, THADS, Kiểm sát), Ngày tống đạt, Hình thức tống đạt, Thừa hành viên thực hiện, Ghi chú. Mỗi dòng sổ là một văn bản cần tống đạt.
- Hiện nay Tống đạt khác 3 nghiệp vụ còn lại ở các điểm sau:
  1. `books.ts`: S-01 có `source: 'document'`, nghĩa là các cột sổ nằm ở thuộc tính của từng TÀI LIỆU (giấy tờ), còn S-02/04/05 nằm ở thuộc tính HỒ SƠ.
  2. DB (`dms_case_record`, `dms_document_add`, migration 0075/0109): một hồ sơ có N dòng `dms_book_entries`, mỗi giấy tờ một STT (trừ "Tài liệu khác").
  3. Số tống đạt (vd `003/2026/TĐ-TPL`) lấy từ bộ đếm RIÊNG `dms_case_number_counters` (0103), không trùng STT. Ba nghiệp vụ kia: số = STT sổ.
  4. Danh sách (`DmsDomainTable`, `dms-list-layout.ts`): một hàng hồ sơ + nút bung các "dòng Sổ S-01 của hồ sơ", cột gộp kiểu "Loại +2", "ngày 15–18/10", "(N chưa tống đạt)", tick đếm.
  5. Chi tiết hồ sơ: mục A hiện một form cho mỗi giấy tờ + nút "Thêm giấy tờ vào sổ S-01" (`AddS01DocumentForm`).
  6. "Việc còn dở" (thẻ số, bộ lọc, `open_flag`) tính theo giấy tờ chưa có `ngay_tong_dat`; trang nhập số cuối sổ giấy có thêm mục `CASE-TD` riêng.
- Bộ lọc (đã làm theo phương án B ngày 05/11, migration 0119 + `DmsFilterBar`): Thời gian ghi sổ, Thừa hành viên, "Bộ lọc khác" (tình trạng scan, loại tài liệu, chi nhánh, người tạo, việc còn dở; "Đã trả KQ" chỉ có ở Vi bằng), tab Chính thức/Nháp/Đã hủy, ô tìm.

## 2. Câu hỏi cần anh chốt (ảnh hưởng toàn bộ thiết kế)

Anh nói "số tống đạt đánh giống 3 nghiệp vụ còn lại". Ở 3 nghiệp vụ kia số = STT, nên một số chỉ ứng với MỘT dòng sổ. Vì vậy phải chọn một trong hai cách:

**Cách A (em đề xuất): một hồ sơ = một văn bản tống đạt = một dòng S-01.**
- Giống hệt Vi bằng/Xác minh/Tổ chức: một hàng danh sách = một hồ sơ = một STT = một số (`STT 005` ↔ `005/2026/TĐ-TPL`).
- Các cột S-01 là thuộc tính hồ sơ. Tài liệu/scan chỉ là tệp đính kèm của hồ sơ.
- Muốn tống đạt nhiều văn bản thì tạo nhiều hồ sơ. "Nhóm theo hồ sơ" như hiện tại biến mất; phần còn cần (xem các văn bản cùng một hợp đồng N-01) làm bằng bộ lọc/ô tìm "Số hợp đồng".
- Ít thay đổi nhất ở danh sách, báo cáo, quyền, tìm kiếm.

**Cách B: một hồ sơ vẫn nhiều văn bản, danh sách hiện phẳng từng văn bản (mỗi hàng = một dòng S-01), có bộ lọc/nút "Nhóm theo hồ sơ" để quay lại kiểu cũ.**
- Đúng từng chữ "không nhóm nữa, nhóm theo hồ sơ chuyển vào bộ lọc".
- Nhưng số tống đạt phải gắn từng văn bản (mỗi dòng một số = STT), hồ sơ không còn một số duy nhất. Phải sửa nhiều hơn: số hồ sơ, tải/xem scan theo văn bản, bộ lọc/chỉ mục theo văn bản, quyền ở mức hồ sơ.

Phần 3 dưới đây viết theo Cách A. Nếu anh chọn B em sẽ lập lại phần 3 (khối lượng ~2 lần).

Câu hỏi nhỏ kèm theo: cột 3 "Số, ngày văn bản cần tống đạt" là số của văn bản do Tòa án/THADS gửi tới, không phải số của văn phòng. Hiện code tự gắn thêm số hồ sơ vào cột này (`autoNumber`). Em đề xuất BỎ gắn tự động ở cột 3 (người nhập tự điền đủ số và ngày), số tống đạt của văn phòng hiện ở cột "STT · Mã hồ sơ". Nếu anh muốn giữ như cũ thì nói em.

## 3. Kế hoạch (theo Cách A)

### 3.1 Quy tắc
- Mục A của form tạo/sửa Tống đạt chỉ chứa cột sổ S-01: Loại văn bản, Số/ngày văn bản, ✓ Tòa án, ✓ THADS, ✓ Kiểm sát, Ngày tống đạt, Hình thức, THV (chọn THV như cũ), Ghi chú.
- Mục B: tài liệu đính kèm. Mục C: SĐT khách, ghi chú khác, hợp đồng N-01 (đã nằm ở C).

### 3.2 Đánh số (giống 3 nghiệp vụ còn lại)
- Khi "Xác nhận lưu chính thức": cấp 1 STT S-01 theo (văn phòng, năm VN) từ `dms_book_counters`; số hồ sơ = `format(STT, năm, 'tongdat')` = `005/2026/TĐ-TPL`. Hết năm về 001. Ký hiệu `TĐ-TPL` giữ nguyên (chưa có yêu cầu đổi như Vi bằng).
- Thôi dùng `dms_case_number_next_tongdat` và bộ đếm `CASE-TD`. Trang "Nhập số cuối sổ giấy" chỉ còn S-01/S-02/S-04/S-05.
- Nháp không có STT và số, như cũ.

### 3.3 Thay đổi DB (một migration mới, dự kiến 0123)
1. `dms_case_record`: nhánh tongdat giống nhánh 3 sổ kia (một `dms_book_allocate` với `document_id` NULL, `case_number` = format theo STT).
2. `dms_document_add`: bỏ cấp STT S-01 cho giấy tờ thêm sau khi ghi sổ. Tài liệu chỉ là tệp đính kèm.
3. "Việc còn dở" (0102 `dms_domain_pending_counts`, 0119 `open_flag` trong `dms_case_index_refresh`): tongdat = hồ sơ chưa có `ngay_tong_dat` ở thuộc tính HỒ SƠ. Phải dựng lại `open_flag` cho hồ sơ cũ.
4. Chỉ mục: `doc_kinds` của tongdat lấy từ thuộc tính hồ sơ `loai_van_ban` (bộ lọc "Loại" vẫn chạy).
5. `dms_book_rows`, `dms_book_rows_for_cases`: giữ nguyên (đã LEFT JOIN tài liệu).
- Ràng buộc định dạng số `…/TĐ-TPL` không đổi. Dòng sổ đã ghi vẫn append-only.

### 3.4 Dữ liệu cũ
- Hồ sơ Tống đạt đã ghi sổ là bất biến, các dòng `dms_book_entries` không sửa được, và hồ sơ cũ có thể có nhiều giấy tờ nên không gộp được về một dòng một cách tự động.
- Theo ghi nhớ dự án, dev chỉ có dữ liệu giả và server thật chưa có hồ sơ Tống đạt thật. Đề xuất: (a) dev: xóa dữ liệu Tống đạt giả rồi seed lại theo mô hình mới; (b) trước khi lên thật em kiểm tra lại bằng một câu truy vấn đếm hồ sơ Tống đạt đã ghi sổ; nếu lúc đó đã có dữ liệu thật thì làm script chuyển riêng (hồ sơ 1 giấy tờ: sao chép thuộc tính lên hồ sơ; hồ sơ nhiều giấy tờ: hỏi anh cách xử lý) và báo anh trước.
- Số đã cấp (`TĐ-TPL` từ bộ đếm cũ) giữ nguyên; bộ đếm sổ S-01 đã có STT lớn hơn hoặc bằng số cũ nên không đụng độ. Em sẽ kiểm tra khi viết migration để số mới không trùng số cũ (có chỉ mục duy nhất `(tenant, office, case_number)` bảo vệ).

### 3.5 Backend
- `books.ts`: S-01 `source: 'case'`, bỏ `autoNumber` cột 3 (nếu anh đồng ý), `bookCells` bỏ nhánh `loai_van_ban` lấy từ `doc_kind`.
- `ledgers.ts`, `book-pdf*.ts`, xuất CSV: kiểm tra và chạy lại test xuất S-01 (PDF mẫu giữ nguyên bố cục).
- `dms-numbers.controller.ts`: bỏ kind `CASE-TD`.
- API tạo/sửa nháp hồ sơ nhận thuộc tính S-01 như 3 nghiệp vụ kia (schema form: `form-fields.ts` nếu có).

### 3.6 Web
- `dms-list-layout.ts` tongdat: mỗi cột đọc thẳng một giá trị của dòng sổ (như vibang): STT · Mã hồ sơ, SĐT, Loại văn bản, Số/ngày văn bản, ✓ Tòa án, ✓ THADS, ✓ Kiểm sát, Ngày tống đạt, Hình thức, THV, Ghi chú, Đã trả KQ, Tài liệu · Scan, Xem · Tải. Xóa các hàm gộp (`kinds`, `firstPlus`, `tickCount`, `servedRange`, `joined`).
- `DmsDomainTable`: bỏ `EXPANDABLE_DOMAINS`, `DmsRowToggle`, hàng "Các dòng Sổ S-01 của hồ sơ …".
- Trang chi tiết: mục A dùng `DmsAttributesForm` mức hồ sơ như 3 nghiệp vụ kia; bỏ `s01Docs`, `AddS01DocumentForm`, nhánh `thvTarget` kiểu `documents`.
- Thẻ số tongdat: "Giấy tờ cần tống đạt" → "Tài liệu hiện hành" (như các nghiệp vụ khác); "Chưa tống đạt" = số hồ sơ chưa có ngày tống đạt.
- Cập nhật `NGHIEP-VU-TOAN-DU-AN.md` mục 5 dòng Tống đạt, hướng dẫn sử dụng, báo cáo N-09 (đếm hồ sơ tống đạt xong, không đổi cách tính).
- Test: sửa `dms-domain-table.test`, `dms-books.itest`, `dms-case-number.itest`, `dms-number-import.itest`, `service-of-documents.itest`, `td-list.itest`, `dms-other-documents.itest`, `books.test`; thêm test đánh số STT = số hồ sơ và danh sách phẳng.

### 3.7 Rủi ro
- Là thay đổi mô hình dữ liệu, cần đúng một migration và chạy hết bộ itest trước khi merge.
- Người dùng đã quen "nhiều giấy tờ trong một hồ sơ" sẽ phải tạo nhiều hồ sơ. Nên có nút "Nhân bản hồ sơ này" (sao chép thuộc tính/hợp đồng, bỏ ngày và scan) như một bước sau nếu anh thấy cần.

### 3.8 Thứ tự làm
1. Migration + itest đánh số/ghi sổ. 2. Backend books/ledgers/numbers. 3. Web danh sách + chi tiết. 4. Tài liệu + seed dev. Một PR, em tự merge khi CI xanh (theo quyền anh đã cho).

## 4. Đề xuất bộ lọc NGHIỆP VỤ cho 4 nghiệp vụ (cập nhật 13/11 theo yêu cầu của anh)

Ý anh: bộ lọc phải giúp làm việc hằng ngày ("đang có việc gì cần xử lý", "việc nào của ai", "kết quả ra sao"), không phải lọc ngày tháng. Vì vậy thiết kế lại: bỏ ô Thời gian khỏi hàng chính (chỉ còn năm sổ và một mục "Ghi sổ trong khoảng" nhỏ trong Bộ lọc khác), thay bằng một HÀNG CHIP TRẠNG THÁI có đếm số và vài ô chọn theo nghiệp vụ.

### 4.1 Khung chung cho cả 4
1. **Hàng chip "Việc cần làm"** (bấm một lần, có số đếm, loại trừ nhau): Tất cả · Cần xử lý · Chờ kết quả · Đã xong · Thiếu scan. Mỗi nghiệp vụ định nghĩa "Cần xử lý/Chờ kết quả/Đã xong" bằng chính cột sổ của nó (bảng 4.2), nên không phải nhập thêm gì.
2. **Người phụ trách**: Thừa hành viên (chọn nhiều) kèm lối tắt "Việc của tôi"; thêm "Người tạo".
3. **Kết quả / loại việc**: một ô chọn theo từng nghiệp vụ (bảng 4.2).
4. **Đã trả kết quả cho khách**: Chưa trả / Đã trả (mở cho cả 4; cột "Đã trả KQ" đã có sẵn ở cả 4).
5. **Quá hạn / sắp đến hạn**: dùng các hạn đã có (`deadlines.ts`, `statutory-deadlines`) làm chip "Quá hạn" cho nghiệp vụ nào có hạn; đây là lọc theo hạn xử lý chứ không theo ngày tạo.
6. **Chi nhánh**, **Tình trạng scan** trong "Bộ lọc khác". Ô tìm chữ giữ nguyên (số hợp đồng, tên khách, số quyết định…).
7. Bộ lọc đang bật hiện chip có × như hiện nay; bộ lọc đã lưu dùng lại cơ chế hiện có.

### 4.2 Theo từng nghiệp vụ
| Nghiệp vụ | Chip việc cần làm | Ô chọn nghiệp vụ | Ghi chú |
|---|---|---|---|
| Tống đạt (S-01) | Chưa tống đạt (chưa có ngày tống đạt) · Đã tống đạt · Quá hạn tống đạt | Hình thức tống đạt (trực tiếp, niêm yết, ...) · Cơ quan giao (Tòa án / THADS / Kiểm sát) · Loại văn bản | Theo Cách A: mỗi hồ sơ một văn bản nên chip đếm được trực tiếp |
| Vi bằng (S-02) | Chưa trả khách · Đã trả · Thiếu scan | Địa bàn lập (phường/xã, tỉnh) · Loại nội dung yêu cầu | Vi bằng không có "việc còn dở" nên chip dựa vào trạng thái trả kết quả và scan |
| Xác minh THA (S-04) | Chưa có kết quả · Đã có kết quả · Quá hạn xác minh | Kết quả xác minh (xác minh được / không được / chưa rõ) · Đã có quyết định xác minh hay chưa | Người yêu cầu/người phải THA tìm qua ô tìm |
| Tổ chức THA (S-05) | Đang thi hành (chưa có N-08) · Đã có biên bản N-08 · Quá hạn | Kết quả thi hành (xong / chưa xong / đình chỉ...) · Có quyết định sửa đổi/thu hồi | Hợp đồng và bên phải THA tìm qua ô tìm |

Các giá trị "Kết quả", "Hình thức" hiện là chữ nhập tay. Để lọc được cần chuẩn hóa thành danh sách chọn (có thêm "Khác" kèm ghi chú) trong form; dữ liệu cũ nhập tay vẫn hiện, gom vào "Khác". Em sẽ chỉ ra danh sách giá trị cụ thể để anh duyệt trong bản Figma.

### 4.3 Xuất Excel theo kết quả lọc
- Nút "Xuất Excel" cạnh bộ lọc, xuất ĐÚNG tập hồ sơ đang lọc (cùng chuỗi tham số trên thanh địa chỉ, cùng quyền xem của người bấm), kể cả bấm chip, tìm chữ, sắp xếp.
- Cột xuất = các cột của sổ S-0x theo đúng thứ tự mẫu (STT, ...) cộng Mã hồ sơ, SĐT khách, Đã trả KQ, Số tệp scan, Ngày ghi sổ, Người tạo. Dòng đầu ghi tên bộ lọc đã áp dụng và ngày giờ xuất.
- Hiện đã có xuất sổ theo năm (CSV và PDF mẫu) và bộ dựng xlsx (`xlsx-export.ts`); em dùng lại bộ dựng này, thêm đầu mối API `GET /dms/case-search/export` nhận y hệt tham số lọc, giới hạn số dòng (đề xuất 10.000, quá thì báo thu hẹp lọc) và ghi nhật ký hoạt động. Quyền: dùng quyền xuất sổ hiện có.
- Xuất danh sách lọc là bản làm việc, không thay "Xuất sổ" pháp định đóng quyển (in theo mẫu).

### 4.4 Cách làm kỹ thuật
- Thêm vài cột chỉ mục vào `dms_case_index` (`work_state` suy ra theo luật từng nghiệp vụ, `facet_a`, `facet_b` lấy từ thuộc tính hồ sơ, hạn xử lý) và nhóm đếm trong `case-facet-counts` để chip có số. Dựng lại chỉ mục cho hồ sơ cũ trong migration (đã có mẫu ở 0119). Luật "Cần xử lý/Chờ kết quả" dùng chung một hàm DB với thẻ số `dms_domain_pending_counts` để thẻ số và chip luôn khớp.
- Web: sửa `DmsFilterBar` (hàng chip, ô chọn theo nghiệp vụ, nút Xuất Excel); ô Thời gian chuyển vào "Bộ lọc khác".
- Mock Figma: sau khi anh duyệt, em vẽ lại hàng lọc mới cho 4 nghiệp vụ trong file DMS v2 (đã có frame cũ 511:450, 512:469, 512:759 để thay thế) trước khi code. Làm thành PR riêng sau PR S-01.

## 5. Cần anh quyết
1. Chọn Cách A hay B (mục 2).
2. Cột 3 S-01: bỏ tự gắn số văn phòng (em đề xuất bỏ) hay giữ như cũ.
3. Xác nhận server thật chưa có hồ sơ Tống đạt thật (để dev reset dữ liệu giả).
4. Bộ lọc mục 4: đồng ý bộ chip và danh sách theo nghiệp vụ; đồng ý chuẩn hóa "Kết quả/Hình thức" thành danh sách chọn; làm PR riêng sau PR S-01.
