# Đề xuất bộ lọc theo cột cho 4 nghiệp vụ (13/11/2026)

Chỉ thiết kế, chưa code. Mockup: `mockup.html` và các ảnh PNG cùng thư mục.

## 1. Cách hiển thị (chung cho cả 4 nghiệp vụ)
- Mỗi tiêu đề cột có một icon phễu nhỏ (mờ). Bấm mở popover đúng loại lọc của cột. Cột đang lọc thì phễu xanh đặc.
- Dưới thanh công cụ có hàng chip "Đang lọc": mỗi chip là một cột + giá trị, có ×; kèm "Xoá tất cả" và số hồ sơ khớp. Chip "Quá hạn báo kết quả" và các chip nghiệp vụ hiện có giữ nguyên chỗ cũ.
- Mọi lọc nằm trên URL (chia sẻ/lưu bộ lọc được), và Xuất Excel dùng đúng bộ lọc đang áp dụng.
- Nút "Cột hiển thị" / "Hiển thị gọn" không đổi. Ẩn một cột không làm mất lọc của cột đó (chip vẫn hiện).
- Mobile 390: bảng đã là thẻ nên không có phễu trên header. Một nút "Lọc theo cột (n)" mở tờ lọc từ dưới lên, mỗi cột là một dòng gập, nút "Xem N hồ sơ".
- Tìm toàn văn vẫn do header lo; lọc cột là AND với tìm kiếm.

## 2. Loại lọc theo kiểu cột
| Kiểu | Control | Áp dụng cho |
|---|---|---|
| Chữ chứa | 1 ô, không phân biệt hoa thường/dấu | người/đương sự, địa chỉ, nội dung, số văn bản, ghi chú, SĐT (chứa số) |
| Khoảng ngày | từ–đến + mốc nhanh + "chưa có ngày" | ngày tống đạt, ngày vi bằng, ngày văn bản/QĐ |
| Chọn nhiều | danh sách có đếm + ô tìm | THV, loại văn bản, hình thức tống đạt, kết quả xác minh/THA, tỉnh/thành |
| Có / không | 3 nút Tất cả / Có / Không | ✓ Tòa án/THADS/Kiểm sát, Đã trả KQ, Tài liệu·Scan (đủ/thiếu) |

## 3. Cột từng sổ (theo `apps/api/src/dms/books.ts`)
**S-02 Vi bằng:** STT·Mã hồ sơ (chứa) · SĐT (chứa) · Người yêu cầu (chứa) · Nội dung (chứa) · Số, ngày vi bằng (chứa số + khoảng ngày) · Địa chỉ (chứa; chọn nhiều tỉnh/thành đã có facet) · THV (chọn nhiều) · Đã trả KQ (có/không) · Tài liệu·Scan (đủ/thiếu) · Ghi chú (chứa).

**S-01 Tống đạt:** STT (chứa/khoảng số) · Loại văn bản (chọn nhiều) · Số, ngày văn bản (chứa) · Tòa án / THADS / Kiểm sát (có/không, hoặc gộp "Cơ quan giao" chọn nhiều như facet_b hiện có) · Ngày tống đạt (khoảng ngày) · Hình thức (chọn nhiều, facet_a) · THV (chọn nhiều) · Ghi chú (chứa).

**S-04 Xác minh:** STT · Hợp đồng DV (chứa) · QĐ thi hành án (chứa) · Bản án/QĐ Tòa (chứa) · QĐ xác minh (chứa) · Người yêu cầu THA (chứa) · Người phải THA (chứa) · Nội dung xác minh (chứa) · Kết quả xác minh (chọn nhiều, facet_a) · THV (chọn nhiều) · Ghi chú.

**S-05 Tổ chức THA:** STT · Hợp đồng DV · QĐ THA (số, ngày) · Sửa đổi/bổ sung (có/không) · Thu hồi (có/không) · Bản án (chứa) · Bên phải THA (chứa) · Bên được THA (chứa) · Các khoản (chứa) · Kết quả THA (chọn nhiều) · THV (chọn nhiều) · Ghi chú.

## 4. Backend hiện tại (đã đọc code)
- `dms_search_cases` đọc bảng chỉ mục `dms_case_index`; lọc có sẵn: trạng thái, năm, khoảng thời gian ghi sổ, chi nhánh, người tạo, loại tài liệu, scan, THV (nhiều), việc còn dở, đã trả, quá hạn, `facet_a`, `facet_b`, tìm toàn văn `search_text` (trigram + OCR), phân trang con trỏ, đếm tối đa 10.001.
- **Chưa có** lọc theo từng thuộc tính sổ (người yêu cầu, địa chỉ, số văn bản, ngày tống đạt...). Chỉ có hai cột gộp facet_a/facet_b, và mỗi nghiệp vụ một nghĩa.
- Xuất Excel theo lọc đã có (#444).

## 5. Cần thêm cho 150k hồ sơ
1. Cột `attrs_norm jsonb` trên `dms_case_index`: giá trị từng cột sổ đã bỏ dấu, hạ chữ thường, điền khi lập chỉ mục (cùng chỗ nạp `search_text`); ngày lưu dạng ISO trong khóa riêng để lọc khoảng.
2. Tham số mới `p_cols jsonb` cho `dms_search_cases`, `dms_case_facet_counts`, xuất Excel: `{key: {op: contains|in|range|bool, v: ...}}`. Khóa cột phải nằm trong danh sách trắng từ `books.ts` (không nhận khóa tuỳ ý, tránh SQL injection vì hàm dựng SQL bằng format).
3. Chạy sau các điều kiện đã có (tenant, văn phòng, nghiệp vụ, trạng thái, năm), tập còn lại thường vài chục nghìn dòng. Giai đoạn 1 chưa tạo index mới; đo thời gian trên 150k dòng giả. Nếu "chứa chữ" chậm, thêm trigram GIN cho 3–4 cột hay dùng (người yêu cầu, địa chỉ, bên phải/được THA). Chưa đo, đây là giả định.
4. Danh sách "chọn nhiều" cho cột chữ tự do (THV, loại, hình thức, kết quả) lấy từ facet có đếm; giới hạn 50 giá trị + ô tìm.
5. Migration: số kế tiếp sau 0126 (kiểm main lúc làm), backfill chỉ mục khi bật; tương thích ngược (không có `p_cols` thì như cũ).
6. Test: unit parse URL, SQL test từng op, một test tích hợp 4 nghiệp vụ, kiểm RLS/phạm vi chi nhánh không bị lọc cột làm lộ dữ liệu.

## 6. Cần anh chốt
1. Popover phễu trên header (đề xuất) hay hàng ô lọc dưới header (như Excel)?
2. Mobile dùng tờ lọc từ dưới lên, một nút "Lọc theo cột" (đề xuất)?
3. Cột SĐT: lọc "chứa" số (khớp một phần) có đủ không? SĐT hiện đang che, lọc có được khớp trên số đầy đủ không (lộ gián tiếp)?
4. S-01: ba cột Tòa án/THADS/Kiểm sát giữ ba nút có/không, hay gộp một bộ lọc "Cơ quan giao"?
5. Có giữ hai bộ lọc cũ trùng chức năng (ví dụ "Bộ lọc khác" cho hình thức/kết quả) hay thay hẳn bằng phễu trên cột?
6. Làm 1 PR cho cả 4 nghiệp vụ hay Vi bằng + Tống đạt trước?
