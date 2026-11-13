# Rà soát giao diện quá tải (trừ trang Quản trị)

Ngày: 2026-10-27. Phạm vi: `apps/web/app/**` và `apps/web/components/**` (nhánh `main` tại d5c0a63). Chỉ đọc, chưa sửa code.

## Giới hạn của lần rà soát này

- **Chỉ đọc code, chưa xem bản deploy theo từng vai.** Việc đăng nhập bằng mật khẩu trên bản deploy bị quy tắc an toàn của công cụ chặn (host không mang nhãn môi trường thử như staging/dev). Vì vậy chưa chụp màn hình desktop/390px theo vai.
- Kết luận về bố cục suy ra từ cấu trúc JSX và CSS. Hệ thống chỉ có một mốc thích ứng chính (`min-width: 900px`, vài chỗ 700/1100px); dưới 900px mọi khối xếp thành một cột dọc.
- Cần xác nhận lại bằng ảnh chụp thật (đề xuất ở cuối).

## Mô hình chung (nguyên nhân gốc)

Hầu hết trang nghiệp vụ có cùng một khuôn: **tiêu đề, dải số liệu, bảng danh sách, rồi form tạo mới nằm ngay dưới bảng trên cùng một trang**. Hệ quả:

1. Thao tác chính (tạo mới) bị chìm dưới bảng dài; có trang chỉ chừa nút neo `#anchor` cuộn xuống.
2. Danh sách và form lẫn lộn, hai thứ dùng chung một cột cuộn.
3. Thiếu điều hướng theo việc: không có tab, bộ lọc trạng thái hay "việc cần làm trước".
4. Trên 390px, bảng ngang phải cuộn (`table-wrap`), chỉ vài bảng có chế độ thẻ (`table-cards`: Tống đạt, THA).

## Bảng tóm tắt theo thứ tự ưu tiên

| # | Trang | Mức độ | Vấn đề chính |
|---|---|---|---|
| 1 | Chi tiết hồ sơ Vi bằng `/vi-bang/[id]` | **Nặng** | Gom 8+ khối và 10+ liên kết hành động rời rạc vào một trang |
| 2 | Công văn `/cong-van` | **Nặng** | Hai sổ, hai form và hai bảng trên một trang |
| 3 | Khách hàng & hợp đồng `/hop-dong` | **Nặng** | Danh bạ, chi tiết, hợp đồng, phụ lục và form tạo trong một trang |
| 4 | Vật tư `/vat-tu` | **Nặng** | Tồn kho, 3 form và kiểm kê lô cùng một trang; kiểm kê là một form cho mỗi lô |
| 5 | Tổng quan `/` | Vừa | 6 khối cùng cấp; thẻ nghiệp vụ lặp lại danh sách "Công việc chung" |
| 6 | Báo cáo `/bao-cao` | Vừa | Bộ lọc nằm sau số liệu; hai bảng cùng loại; biểu đồ cột bị ẩn với trình đọc màn hình |
| 7 | Tống đạt / Xác minh / THA | Vừa | Cùng khuôn: KPI, bảng, form tạo mới nằm dưới cùng |
| 8 | Sổ sách `/so-sach` | Vừa | Bảng rất rộng; chọn sổ bằng ô chọn thay vì tab |
| 9 | Hồ sơ Vi bằng (danh sách) `/vi-bang` | Nhẹ | Đủ gọn, thiếu bộ lọc trạng thái |
| 10 | Hộp duyệt `/hop-duyet` | Nhẹ | Lưu ý cấp quyền nằm trước nội dung chính; thiếu tab theo trạng thái |
| 11 | Việc của tôi | Nhẹ | Gọn, nhưng cần nhóm theo hạn |
| 12 | Cài đặt `/cai-dat` | Nhẹ | Hai khối, nút Lưu ở đầu trang |
| 13 | Đăng nhập, Xác thực | Nhẹ | Ổn |

---

## Chi tiết từng trang

### 1. Chi tiết hồ sơ Vi bằng `/vi-bang/[id]` , Nặng

**Hiện trạng** (`app/vi-bang/[id]/page.tsx`, `CaseSteps`, `CaseActions`, `CaseStagePanels`):
- Một trang xếp theo thứ tự: đầu trang, thanh tab, Tiến độ, Thông tin xử lý, nút phân công, 4-5 liên kết hành động, `CaseActions` (3 form: sửa trong 48 giờ, đề nghị thay đổi, huỷ), form từ chối, rồi bảng "Đề nghị thay đổi".
- Mỗi bước tiến độ lại có panel riêng (xác nhận MISA, cấp số, ký/đóng dấu/scan, trả kết quả).
- Thanh tab chỉ có 5 mục (Tổng quan, Pháp lý, Tài liệu, Lịch sử, Cập nhật Sở) nhưng các hành động nghiệp vụ (Thu hồi MISA, Sửa lỗi N-11, Kiểm tra bàn giao, Cấp bản sao) nằm ngoài tab dưới dạng liên kết văn bản trôi nổi.
- Nút hành động nguy hiểm (Huỷ hồ sơ) cùng cấp với thao tác thường ngày.

**Vấn đề:** người dùng không biết "việc tiếp theo là gì"; hành động chính thay đổi theo giai đoạn nhưng không được làm nổi bật; thao tác hiếm (thu hồi, sửa lỗi, huỷ) chen giữa.

**Đề xuất tách:**
- Đầu trang: tên hồ sơ, trạng thái và **một khối "Việc tiếp theo"** (đúng một nút chính theo giai đoạn và vai).
- Tab: `Tiến độ` (mặc định), `Thông tin`, `Tài liệu`, `Pháp lý`, `Lịch sử`, `Đề nghị thay đổi`.
- Gom thao tác hiếm vào menu "Thêm thao tác" (Thu hồi MISA, Sửa N-11, Cấp bản sao, Huỷ); Huỷ hồ sơ đặt riêng trong vùng "Nguy hiểm" ở cuối tab Thông tin.
- Form sửa, đề nghị thay đổi: mở dạng hộp thoại, không phơi sẵn.
- Mobile: tab cuộn ngang, "Việc tiếp theo" ghim dưới đáy.

### 2. Công văn `/cong-van` , Nặng

**Hiện trạng:** tiêu đề với nút "+ Tạo văn bản" (neo), 3 StatCard, bộ lọc, bảng công văn, form tạo công văn, tiêu đề "Sổ quyết định", bảng quyết định, form tạo quyết định. Hai nghiệp vụ khác nhau (công văn đi/đến và quyết định) trong một trang dài, hai form khác nhau nằm xen giữa.

**Vấn đề:** nút "Tạo văn bản" cuộn tới form nằm giữa trang; người dùng tạo quyết định phải cuộn qua mọi thứ; số liệu chỉ phản ánh "danh sách đang xem" nên dễ hiểu nhầm.

**Đề xuất:**
- Tab `Công văn đến`, `Công văn đi`, `Sổ quyết định`.
- Nút "+ Tạo ..." mở ngăn kéo (drawer) hoặc trang `/cong-van/tao-moi`, `/cong-van/quyet-dinh/tao-moi`.
- Dải số liệu rút còn một dòng "Chờ xử lý" gắn vào tab tương ứng.

### 3. Khách hàng & hợp đồng `/hop-dong` , Nặng

**Hiện trạng:** `CustomerDirectory` chứa bảng danh bạ; bấm "Xem và sửa" thì **mở chi tiết ngay bên dưới bảng** (2 panel: hồ sơ khách và hợp đồng, kèm `ContractExtras` có 2 form, phụ lục), rồi tới form tạo khách mới và một khối ghi chú nguyên tắc. Tổng cộng khoảng 8 form trên cùng một cuộn (CustomerForms 4, ContractExtras 2, ContactLog 1...). Nút "Soạn hợp đồng N-03" ở đầu trang.

**Vấn đề:** chi tiết hiện dưới bảng nên người dùng chọn dòng ở đầu rồi phải cuộn xuống mới thấy; chọn dòng khác thì chi tiết nhảy; trên mobile bảng 6 cột bị cắt; tải đồng thời đếm Vi bằng cho tối đa 100 khách (một lần gọi API mỗi khách) làm trang chậm.

**Đề xuất:**
- Dạng danh sách + chi tiết: `/hop-dong` (danh bạ) và `/hop-dong/khach/[id]` (hồ sơ khách với tab `Thông tin`, `Hợp đồng`, `Phụ lục`, `Vi bằng`).
- Tạo khách mới: trang hoặc hộp thoại riêng, không đặt cuối danh sách.
- Mobile: danh bạ dạng thẻ (tên, loại, số hợp đồng).
- Gộp việc đếm Vi bằng vào một endpoint tổng hợp (ghi nhận để đội backend xem xét).

### 4. Vật tư `/vat-tu` , Nặng

**Hiện trạng:** tiêu đề với nút "+ Nhập vật tư" (neo), 3 StatCard, bảng tồn kho (mỗi mặt hàng × chi nhánh một dòng), khối nguyên tắc FIFO, rồi một vùng chứa `NewItemForm` và `StockMovementForm`, tiếp đó "Kiểm kê lô" gồm một thẻ **kèm form riêng cho mỗi lô** (`AdjustBatchForm`).

**Vấn đề:** danh sách lô lớn dần sẽ biến trang thành hàng chục form; hành động nhập/xuất (dùng hằng ngày) và thêm vật tư (hiếm) cùng một chỗ; kiểm kê (hiếm, chỉ Admin/Trưởng VP) chen vào.

**Đề xuất:**
- Tab `Tồn kho`, `Nhập/xuất`, `Lịch sử lô` (có kiểm kê khi đủ quyền).
- Nút "Nhập/xuất" là hành động chính, mở hộp thoại; "Thêm vật tư" chuyển vào menu phụ.
- Kiểm kê: bảng lô với nút "Điều chỉnh" mở hộp thoại, không dựng sẵn form mỗi dòng.

### 5. Tổng quan `/` , Vừa

**Hiện trạng:** 4 thẻ nghiệp vụ, panel "Công việc chung" (6 dòng, trong đó 1 dòng không bấm được), 2 panel (Hồ sơ cần xử lý, Nhắc việc), "Hoạt động theo địa điểm", rồi `DeadlineReminders`.

**Vấn đề:** 6 khối ngang hàng và không có thứ tự theo độ gấp; thông tin cần hành động (nhắc việc, hạn pháp định) nằm cuối trang; thẻ nghiệp vụ nhắc lại các mục menu bên; mô tả "Giai đoạn 1 · đã chốt nghiệp vụ" là chữ nội bộ, không giúp người dùng.

**Đề xuất:**
- Thứ tự: `Cần làm hôm nay` (nhắc việc + hạn pháp định + hồ sơ cần xử lý) lên đầu; thẻ nghiệp vụ thu nhỏ thành hàng lối tắt; "Công việc chung" bỏ vì trùng menu.
- "Hoạt động theo địa điểm" chỉ cho Trưởng VP/Admin, chuyển sang trang Báo cáo hoặc thu gọn.
- Phân theo vai: THV thấy "Việc của tôi"; Trưởng VP thấy "Chờ duyệt"; Kế toán thấy "Chờ xác nhận MISA".

### 6. Báo cáo `/bao-cao` , Vừa

**Hiện trạng:** tiêu đề với nút xuất, 3 StatCard, lưới 2 cột (số liệu: biểu đồ cột và bảng; **bộ lọc ở cột bên phải, xuống dưới cùng trên mobile**), rồi bảng "Công văn, vật tư và nhân sự".

**Vấn đề:** bộ lọc quyết định mọi số liệu mà lại nằm sau số liệu (trên mobile nằm sau cả biểu đồ và bảng); 3 chỉ số đầu chỉ đếm Vi bằng nhưng đặt như tổng quan toàn văn phòng; hai bảng cùng cấu trúc tách rời.

**Đề xuất:**
- Thanh lọc cố định trên cùng (kỳ, chi nhánh, chia theo).
- Tab `Vi bằng`, `Tống đạt/Xác minh/THA`, `Công văn, vật tư, nhân sự`.
- Mobile: bộ lọc thu gọn thành một nút "Bộ lọc (n)".

### 7. Tống đạt / Xác minh / Tổ chức THA , Vừa

**Hiện trạng:** cả ba cùng khuôn: tiêu đề, mô tả, KPI, bảng (Tống đạt và THA đã có `table-cards`), form tạo mới ở cuối (`NewServiceForm`, `NewVerificationForm`, `NewEnforcementForm`). Mỗi dòng có cột "Thao tác" chứa `AssignHandler` (ô chọn) cộng nút hành động riêng.

**Vấn đề:** form tạo mới ở cuối nên người dùng không thấy; KPI không lọc được danh sách; THA nhồi danh sách Đương sự và Nghĩa vụ ngay trong ô bảng nên dòng rất cao; thao tác trên mỗi dòng lẫn ô chọn người xử lý lẫn nút nghiệp vụ.

**Đề xuất:**
- KPI trở thành bộ lọc trạng thái (bấm vào số để lọc).
- Nút "+ Tạo ..." ở đầu trang mở hộp thoại hoặc trang riêng.
- Dòng chỉ hiện tóm tắt; bấm vào mở trang chi tiết (đương sự, nghĩa vụ, thao tác).
- Phân công người xử lý chuyển vào trang chi tiết hoặc thao tác hàng loạt.

Ghi chú: trang Xác minh chưa được đọc kỹ từng dòng; kết luận dựa trên `NewVerificationForm` và cùng khuôn với hai trang kia.

### 8. Sổ sách `/so-sach` , Vừa

**Hiện trạng:** chọn sổ bằng ô chọn, ô nhập năm, nút Xem, bảng cột động (S-01…S-06), ghi chú, liên kết sang "Theo dõi cập nhật CSDL / Sở".

**Vấn đề:** 5-6 sổ khác nhau bị giấu sau ô chọn; bảng nhiều cột, mobile phải cuộn ngang; liên kết sang trang "theo dõi sổ" nằm cuối nên khó thấy.

**Đề xuất:** tab theo sổ (có tên đầy đủ), ghim cột đầu khi cuộn ngang, thêm tab "Theo dõi cập nhật" thay liên kết cuối trang.

### 9-13. Các trang còn lại , Nhẹ

- **Danh sách hồ sơ Vi bằng:** thêm bộ lọc trạng thái và tìm kiếm; nút KPI bấm để lọc.
- **Hộp duyệt:** đặt lưu ý cấp quyền vào đầu danh sách dưới dạng một dòng chip; tab `Chờ duyệt`, `Đã trả lại`, `Đã từ chối`; đoạn giải thích pháp lý thu vào biểu tượng thông tin.
- **Việc của tôi:** nhóm theo hạn (Quá hạn, Hôm nay, Tuần này).
- **Cài đặt:** nút Lưu ghim dưới đáy trên mobile; khối "Địa điểm hoạt động" chỉ đọc nên đặt sau, thêm liên kết sang Quản trị.
- **Đăng nhập, Xác thực:** không có vấn đề quá tải.

Chưa đọc kỹ: `/bieu-mau`, các trang con của hồ sơ Vi bằng (pháp lý, tài liệu, cấp số, ký đóng dấu...) và `/so-sach/theo-doi-so`.

---

## Thứ tự đề xuất triển khai

1. **Chi tiết hồ sơ Vi bằng**: trang dùng nhiều nhất, quá tải nhất, ảnh hưởng mọi vai.
2. **Công văn** và **Vật tư**: tách tab, đưa form tạo ra khỏi trang danh sách (cùng một mẫu, làm chung được).
3. **Khách hàng & hợp đồng**: tách danh bạ và chi tiết.
4. **Tổng quan**: sắp lại theo "Cần làm hôm nay" và theo vai.
5. **Tống đạt, Xác minh, THA**: một mẫu danh sách + hộp thoại tạo + trang chi tiết dùng chung cho cả ba.
6. **Báo cáo, Sổ sách**: bộ lọc lên đầu, tab.
7. Các trang Nhẹ.

Mẫu dùng chung nên làm một lần: thanh tab, hộp thoại/ngăn kéo tạo mới, KPI lọc được, khung "Việc tiếp theo".

## Nên vẽ Figma trước cho trang nào

1. **Chi tiết hồ sơ Vi bằng** (bắt buộc): bố cục tab, khối "Việc tiếp theo", menu thao tác phụ, bản desktop và 390px.
2. **Tổng quan** theo vai (THV, Trưởng VP, Kế toán): quyết định "Cần làm hôm nay" gồm những gì.
3. **Mẫu danh sách + tạo mới + chi tiết** dùng cho Tống đạt/Xác minh/THA/Công văn/Vật tư/Khách hàng: vẽ một lần, áp dụng cho sáu trang.

Các trang Nhẹ và Báo cáo/Sổ sách không cần vẽ trước; làm trực tiếp theo mẫu đã chốt.
