# Hướng dẫn sử dụng Legal Office (bản chữ, giao diện từ 13/11/2026)

Dành cho nhân viên văn phòng: Thừa hành viên, Thư ký, Văn thư, Kế toán, Trưởng văn phòng và Admin. Mô tả giao diện hiện tại bằng chữ, không có ảnh chụp. Mọi ví dụ trong tài liệu là hư cấu.

> Tài liệu này thay phần mô tả cũ về danh sách, bộ lọc, tab Tài liệu và tìm kiếm trong `huong-dan-su-dung.md` (bản có ảnh, dựng trước 13/11). Phần còn lại của bản cũ (Quản trị, Văn thư, Kế toán...) vẫn dùng được; bản có ảnh sẽ dựng lại sau khi giao diện được duyệt.

## 0. Ba nguyên tắc cần nhớ

1. Phần mềm **ghi nhận, nhắc và chặn bước sai**. Người có thẩm quyền mới là người ký và ban hành. "Duyệt" trong phần mềm là xác nhận nội bộ, không phải chữ ký pháp lý.
2. Phần mềm **không làm kế toán**. MISA là sổ kế toán duy nhất, phần mềm không lưu số tiền.
3. Hồ sơ đã lưu chính thức **không xóa, không ghi đè, không sửa trực tiếp**. Muốn đổi nội dung phải qua Admin (xem mục 8). Chỉ được **thêm** tài liệu mới.

## 1. Đăng nhập

- Vào địa chỉ của văn phòng, nhập **email hoặc số CCCD** và mật khẩu.
- Lần đầu (hoặc sau khi Admin đặt lại mật khẩu), phần mềm bắt **đổi mật khẩu**: tối thiểu 12 ký tự, khác mật khẩu cũ.
- Quên mật khẩu: bấm "Quên mật khẩu", nhập email, mở liên kết trong thư để đặt lại. Nếu văn phòng chưa cấu hình email gửi thư, nhờ Admin đặt lại mật khẩu.
- Bạn chỉ thấy những gì nhóm quyền và chi nhánh của bạn cho phép. Không thấy một mục nghĩa là bạn không có quyền, không phải lỗi.

## 2. Làm quen với màn hình

**Thanh bên (trái)** chia nhóm:

| Nhóm | Mục |
|---|---|
| Công việc | **Tổng quan**, **Hồ sơ** (hồ sơ bạn đã tạo, kể cả nháp), **Trình / Duyệt** (có huy hiệu đỏ khi có bản chờ duyệt) |
| Nghiệp vụ | **Vi bằng**, **Tống đạt**, **Xác minh điều kiện THA**, **Tổ chức thi hành án** |
| Văn phòng | Tài liệu cũ, Thư viện biểu mẫu, Vật tư văn phòng, Văn thư, Xuất sổ nghiệp vụ, Báo cáo tổng hợp |
| Quản trị | Quản trị (chỉ Admin) |

Nút **Thu gọn** ở cuối thanh bên co thanh về biểu tượng.

**Đầu trang:** ô **Tìm kiếm** (mục 3), chuông **thông báo** (nhắc hạn, bản trình), tên và vai của bạn; bấm vào để đổi mật khẩu hoặc đăng xuất.

**Trên điện thoại:** thanh bên thu thành nút menu; bảng cuộn ngang; ngăn lọc mở rộng hết chiều ngang màn hình.

## 3. Tìm kiếm (ô trên đầu trang)

Ô tìm ở đầu trang là nơi tìm duy nhất cho mọi thứ. Bấm vào ô hoặc nhấn **Ctrl+K** (Mac: ⌘+K).

- Gõ **số hồ sơ** (ví dụ `038/2026`), tên hồ sơ hoặc tên khách hàng: hiện tối đa 8 hồ sơ bạn được xem, thuộc cả 4 nghiệp vụ và Văn thư. Chọn một dòng để mở thẳng hồ sơ.
- Gõ tên trang (ví dụ "Báo cáo"): đi tới trang đó.
- Gõ nội dung có trong bản scan: hiện vài đoạn trích từ chữ nhận dạng (OCR) của tài liệu; bấm "xem tất cả" để mở trang **Kết quả tìm kiếm** (cũng là mục "Tìm trong nội dung scan" trong menu ⋯ của danh sách).
- Tìm theo nội dung chỉ thấy tệp đã **OCR xong** (xem mục 7).

Danh sách nghiệp vụ không còn ô tìm riêng; muốn thu hẹp danh sách dùng bộ lọc ở mục 4.

## 4. Danh sách hồ sơ và bộ lọc

Bốn nghiệp vụ dùng chung một bố cục. Bấm vào tên nghiệp vụ trên thanh bên để mở danh sách.

### 4.1. Các phần của màn hình

1. **Hàng tiêu đề:** tên nghiệp vụ; bên phải là nút **Xuất sổ S-0x** (mở trang xuất sổ của nghiệp vụ: S-01 Tống đạt, S-02 Vi bằng, S-04 Xác minh, S-05 Tổ chức) và nút **+ Tạo hồ sơ** (chỉ hiện với người có quyền soạn nháp).
2. **Bốn thẻ số** (tổng hợp năm nay: hồ sơ chính thức, tài liệu hiện hành, việc còn dở, thiếu scan...). Thẻ nào có số bấm được thì bấm là lọc luôn.
3. **Thẻ bộ lọc** gồm ba hàng có nhãn (mục 4.2 đến 4.4) và hàng **Đang lọc** (mục 4.5) hiện khi có bộ lọc.
4. **Bảng hồ sơ**, mỗi dòng một hồ sơ, cuối bảng có phân trang.

### 4.2. Hàng "Hồ sơ": chọn loại danh sách

Ba lựa chọn gộp thành một khối:

- **Chính thức**: hồ sơ đã lưu chính thức, đã có số hồ sơ và đã vào sổ.
- **Nháp (n)**: bản nháp chưa ghi sổ, chưa có số. Chỉ thấy nháp của bạn hoặc nháp được cấp quyền xem.
- **Đã hủy (n)**: nháp đã hủy (giữ lịch sử, không khôi phục).

Cùng hàng, bên phải:

- **Bộ lọc đã lưu**: lưu cách lọc đang dùng với một tên để mở lại bằng một cú bấm; mỗi nghiệp vụ lưu tối đa 30 bộ lọc, chỉ riêng bạn thấy, xóa được. Xem mục 4.7.
- **Xuất Excel (đang lọc)**: tải bảng tính đúng danh sách đang lọc (mục 4.8).
- **Nút ⋯**: menu phụ, có **Xuất sổ S-0x** và **Tìm trong nội dung scan**.

### 4.3. Hàng "Việc cần làm": chip bấm một lần

Mỗi chip là một bộ lọc nhanh và có **số hồ sơ** bên cạnh. Chip đang chọn tô xanh; bấm lại **Tất cả** để bỏ. Đổi chip không làm mất các bộ lọc khác. Số đếm đã tính theo các bộ lọc khác đang chọn nên không mâu thuẫn.

| Chip | Nghiệp vụ | Nghĩa |
|---|---|---|
| Tất cả | cả 4 | Không lọc việc |
| Chưa tống đạt / Đã tống đạt | Tống đạt | Chưa hoặc đã có ngày tống đạt |
| Quá hạn báo kết quả | Tống đạt | Đã ghi sổ, chưa tích "Đã trả KQ" và quá 2 ngày làm việc (theo lịch văn phòng) kể từ ngày tống đạt |
| Chưa có kết quả / Đã có kết quả | Xác minh | Theo ô kết quả xác minh |
| Đang thi hành (chưa có N-08) / Đã có biên bản N-08 | Tổ chức THA | Theo ô tích "Đã có N-08" |
| Chưa trả kết quả / Đã trả kết quả | cả 4 | Theo ô tích "Đã trả KQ" trên dòng |
| Thiếu scan | cả 4 | Hồ sơ có tài liệu chưa có tệp scan |
| Việc của tôi | cả 4 | Hồ sơ ghi tên bạn là Thừa hành viên |

Ghi chú: Vi bằng không có chip việc còn dở (chỉ có chip trả kết quả và thiếu scan). Chip "Quá hạn báo kết quả" chỉ có ở Tống đạt.

### 4.4. Hàng "Bộ lọc": các ô lọc thường dùng

Các ô trên hàng này mở ra thành ngăn nhỏ (bấm để mở; **bấm ra ngoài hoặc nhấn Esc để đóng**, lần mở sau nhớ lại điều bạn đã chọn). Chọn xong trong ngăn thì bấm **Áp dụng**.

- **Thời gian**: lọc theo thời điểm ghi sổ (giờ Việt Nam).
  - *Mốc nhanh*: Hôm nay, Tuần này (tính từ thứ Hai), Tháng này... hoặc **Tùy chọn**.
  - *Từ / Đến*: chọn ngày giờ; "Đến" tính hết phút đã chọn.
  - *Năm*: mặc định là năm hiện tại. Khi chọn mốc nhanh hoặc Từ/Đến thì ô Năm không áp dụng.
  - Nếu "Từ" muộn hơn "Đến" thì không có hồ sơ nào; phần mềm báo để bạn sửa lại.
- **Thừa hành viên**: chọn **một hoặc nhiều** người (có số hồ sơ của từng người). Chỉ hiện khi văn phòng có Thừa hành viên.
- **Hai ô riêng của từng nghiệp vụ** (chọn là lọc ngay, không cần bấm Áp dụng), mỗi lựa chọn có số hồ sơ:

| Nghiệp vụ | Ô thứ nhất | Ô thứ hai |
|---|---|---|
| Tống đạt | Hình thức tống đạt | Cơ quan giao văn bản |
| Vi bằng | Tỉnh/thành nơi lập vi bằng | (không có) |
| Xác minh | Kết quả xác minh | (không có) |
| Tổ chức THA | Kết quả thi hành án | (không có) |

- **Thêm bộ lọc (n)**: các bộ lọc ít dùng hơn, số trong ngoặc là số bộ lọc đang bật trong ngăn này:
  - *Tình trạng scan*: Tất cả, Thiếu scan, Đủ scan.
  - *Đã trả kết quả*: Tất cả, Đã trả, Chưa trả.
  - *Việc còn dở* (Tống đạt, Xác minh, Tổ chức): Tất cả, còn dở, Đã xong.
  - *Đơn vị* (chi nhánh): chỉ liệt kê chi nhánh bạn được xem.
  - *Người tạo*.
- Nút **Áp dụng** cuối hàng áp các lựa chọn trong ngăn.

### 4.5. Hàng "Đang lọc": thấy rõ mình đang lọc gì

Khi có ít nhất một bộ lọc, dưới thẻ hiện hàng chip, ví dụ: `Ghi sổ: Tháng 10/2026` `THV: Nguyễn Minh` `Hình thức tống đạt: Qua bưu điện`.

- Bấm chip (có dấu ×) để **bỏ riêng bộ lọc đó**.
- Bấm **Xóa tất cả** để bỏ mọi bộ lọc (vẫn ở đúng danh sách Chính thức / Nháp / Đã hủy đang xem).
- Bên phải là số **hồ sơ khớp**, ví dụ `128 hồ sơ khớp`; từ 10.000 trở lên hiện `10.000+`. Đây cũng là số dòng của Xuất Excel.
- Nếu bạn đi từ ô tìm ở đầu trang sang danh sách kèm từ khóa, từ khóa hiện thành chip `Từ khóa: ...`.

### 4.6. Lọc theo cột (phễu trên tiêu đề bảng)

Muốn lọc theo nội dung một cột (ví dụ chỉ hồ sơ có "Người yêu cầu" chứa chữ "Nguyễn"):

1. Rê chuột lên tiêu đề cột: góc trên bên phải tiêu đề hiện **biểu tượng phễu**. Cột đang lọc thì phễu luôn hiện và đổi màu.
2. Bấm phễu, nhập hoặc chọn điều kiện:
   - *Cột chữ*: gõ chữ cần có trong ô ("Chứa chữ...").
   - *Cột ngày*: chọn **từ ngày** và **đến ngày**.
   - *Cột chọn*: có ô "Tìm trong danh sách" và danh sách giá trị kèm số hồ sơ; tích một hoặc nhiều giá trị.
   - *Cột có/không* (Tòa án, Cơ quan THADS, Cơ quan kiểm sát): Tất cả / Có / Không.
3. Bấm **Áp dụng**. Muốn bỏ thì mở lại phễu và bấm **Xóa lọc cột**, hoặc bấm × ở chip trong hàng "Đang lọc".

Các cột lọc được: Mã hồ sơ, SĐT khách hàng và Thừa hành viên (cả 4 nghiệp vụ); Vi bằng (người yêu cầu, nội dung, số/ngày vi bằng, địa chỉ, ghi chú); Tống đạt (loại văn bản, số/ngày văn bản, Tòa án, THADS, kiểm sát, ngày tống đạt, hình thức, ghi chú); Xác minh (người yêu cầu và người phải THA, nội dung, hợp đồng và quyết định xác minh, kết quả); Tổ chức THA (các bên, các khoản, hợp đồng và quyết định THA, kết quả). Cột "Tài liệu · Scan", "Đã trả KQ" và nút thao tác dùng các chip và bộ lọc ở trên.

Lọc cột chỉ áp dụng cho hồ sơ **đã ghi sổ**; chip và Xuất Excel dùng đúng điều kiện đó.

### 4.7. Bộ lọc đã lưu

1. Đặt các bộ lọc như ý (chip, thời gian, thừa hành viên...).
2. Bấm **Bộ lọc đã lưu**, gõ tên vào ô, bấm lưu.
3. Lần sau mở lại **Bộ lọc đã lưu** và bấm tên: danh sách quay lại đúng cách lọc đó.
4. Xóa bằng nút xóa cạnh tên; không cần xác nhận vì đây chỉ là tùy chọn giao diện, không phải hồ sơ nghiệp vụ.

Hộp này đóng khi bấm ra ngoài hoặc nhấn Esc.

### 4.8. Xuất Excel (đang lọc) và Xuất sổ

- **Xuất Excel (đang lọc)**: tải tệp Excel gồm đúng các hồ sơ đã ghi sổ khớp bộ lọc, cùng các cột của bảng, **tối đa 10.000 dòng**. Không có bộ lọc thì xuất cả danh sách chính thức. Chỉ hồ sơ đã ghi sổ được xuất; nháp không có trong tệp.
- **Xuất sổ S-0x**: mở trang xuất **sổ pháp định** theo mẫu (xem mục 10). Đây là sổ để in và đóng quyển, khác với Excel lọc.

### 4.9. Cột hiển thị và Hiển thị gọn

Ngay trên bảng có hai nút:

- **Cột hiển thị**: tích hoặc bỏ tích từng cột để ẩn bớt; **Hiện tất cả** để hiện lại. Lựa chọn lưu theo trình duyệt của bạn, mỗi nghiệp vụ một lựa chọn riêng. Cột **SĐT khách hàng** được **ẩn sẵn**; muốn xem thì tích lại.
- **Hiển thị gọn**: giảm khoảng cách dòng để thấy nhiều hồ sơ hơn.

Hộp "Cột hiển thị" đóng khi bấm ra ngoài hoặc nhấn Esc. Rê chuột lên ô bị cắt chữ sẽ hiện đủ nội dung.

### 4.10. Các cột của bảng

Mỗi dòng gồm: **STT · Mã hồ sơ** (số hồ sơ, ví dụ `006/2026/TĐ-TPL`; bấm để mở), SĐT khách hàng (ẩn sẵn), các cột đúng theo sổ của nghiệp vụ, **Tài liệu · Scan** (số tài liệu, nhãn "Thiếu scan" nếu còn thiếu, số tệp), **Đã trả KQ** (ô tích), **Xem · Tải scan** (xem trước hoặc tải bản scan).

### 4.11. Mẹo và lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Danh sách trống sau khi lọc | Xem hàng "Đang lọc", bấm × từng chip hoặc "Xóa tất cả". Hay gặp nhất: ô Năm hoặc Thời gian chưa khớp năm của hồ sơ. |
| Chip hiện số 0 | Không có hồ sơ nào khớp chip đó với các bộ lọc khác đang chọn. |
| Không thấy bản nháp vừa tạo | Nháp nằm ở **Nháp (n)**, không nằm ở **Chính thức**. |
| Không thấy cột SĐT | Cột này ẩn sẵn: mở **Cột hiển thị** và tích lại. |
| Ngăn lọc không đóng | Bấm ra ngoài ngăn hoặc nhấn Esc. |
| "Xuất Excel" ít dòng hơn mong đợi | Chỉ xuất hồ sơ **đã ghi sổ** khớp bộ lọc; nháp và hủy không được xuất. |
| Không thấy nút Tạo hồ sơ | Tài khoản chưa có quyền soạn nháp ở nghiệp vụ này: nhờ Admin cấp nhóm quyền. |

## 5. Tạo hồ sơ: nháp rồi lưu chính thức

Áp dụng cho cả 4 nghiệp vụ. Hồ sơ mới luôn là **bản nháp**: chưa có số hồ sơ, chưa vào sổ, chưa tính thống kê. Sửa, thêm tài liệu hoặc hủy thoải mái cho đến khi lưu chính thức.

### 5.1. Tạo bản nháp

1. Mở danh sách nghiệp vụ, bấm **+ Tạo hồ sơ**.
2. Điền biểu mẫu gồm ba phần:
   - **A. Thông tin của nghiệp vụ**: đúng các cột của sổ (Cột 2, 3, 4... như sổ S-0x theo mẫu TT 08). Điền đúng chính tả vì đây là nội dung ghi vào sổ.
   - **B. Tài liệu đính kèm**: chọn một hoặc nhiều tệp PDF, JPEG, PNG; tệp tải lên ngay sau khi lưu nháp.
   - **C. Thông tin khác (không vào sổ)**: **Tên hồ sơ**, **SĐT khách hàng** (10 số, bắt đầu bằng 0), Ghi chú.
3. Nếu văn phòng có nhiều chi nhánh, chọn chi nhánh.
4. Bấm **Lưu nháp**. Sai định dạng (ví dụ SĐT) thì phần mềm báo lỗi ngay tại ô và chưa lưu.

Số hồ sơ không nhập tay: phần mềm tự cấp khi lưu chính thức và trùng phần đầu với **STT** của sổ (STT 30 thành `030/2026/VB-THV`). Từ 13/11/2026 **Tống đạt cũng một hồ sơ là một dòng S-01**; giấy tờ chỉ là tệp đính kèm.

### 5.2. Ghi tên Thừa hành viên

Nếu bản nháp ghi tên một Thừa hành viên (ô chọn riêng), người đó phải **tự xác nhận** trong phần mềm (mục **Hồ sơ nháp chờ tôi lưu**: mở bản nháp, đọc kỹ, bấm "Tôi xác nhận nội dung này") trước khi ghi sổ. Nếu người soạn sửa nội dung sau khi bạn xác nhận, bạn phải xác nhận lại. Hồ sơ không ghi tên Thừa hành viên thì không cần bước này.

### 5.3. Hủy bản nháp

Bấm **Hủy nháp**, nhập **lý do** (bắt buộc), xác nhận. Nháp hủy chuyển sang **Đã hủy (n)**, giữ lịch sử và **không khôi phục**.

### 5.4. Lưu chính thức (ghi sổ)

1. Mở bản nháp, kiểm tra kỹ từng cột. Sau bước này hồ sơ không sửa trực tiếp được.
2. Bấm **Xác nhận lưu chính thức**, đọc hộp xác nhận rồi đồng ý.
3. Hồ sơ nhận số hồ sơ, chuyển sang danh sách **Chính thức** và vào sổ.

Phần mềm **chặn ghi sổ** khi bản nháp thiếu cột bắt buộc hoặc có ngày không có thật. Cột bắt buộc:

| Nghiệp vụ | Phải có |
|---|---|
| Vi bằng | Người yêu cầu, nội dung yêu cầu, số/ngày vi bằng (ngày hợp lệ), địa chỉ nơi lập |
| Tống đạt | Loại văn bản, số/ngày văn bản, và ít nhất một cơ quan giao (Tòa án, THADS hoặc kiểm sát) |
| Xác minh | Người yêu cầu THA, người phải THA, nội dung xác minh |
| Tổ chức THA | Quyết định THA, bên phải THA, bên được THA, các khoản phải THA |

Ngày tống đạt của Tống đạt được để trống (việc còn dở) nhưng đã nhập thì phải đúng dạng ngày/tháng/năm. Thừa hành viên không bắt buộc ở cột sổ.

## 6. Chi tiết hồ sơ

Bấm số hồ sơ trong danh sách. Trên cùng có các nhãn tóm tắt (Đã ghi sổ, số tài liệu, số scan, số tài liệu chưa có bản scan) và bốn tab:

- **Thông tin chung**: số hồ sơ, tên hồ sơ, SĐT khách hàng, trạng thái, người tạo, ngày tạo, ngày ghi sổ, rồi khối **Nội dung sổ S-0x** (các cột sổ). Ô chưa có dữ liệu hiện dấu gạch. Admin thấy nút **Sửa hồ sơ (Admin)** (mục 8).
- **Tài liệu (n)**: tệp scan của hồ sơ (mục 7).
- **Sổ liên quan**: các sổ có hồ sơ này.
- **Lịch sử hồ sơ**: ai làm gì, lúc nào (mục 9).

## 7. Tab Tài liệu và bản scan

- Mỗi hồ sơ có một hoặc nhiều **tài liệu** (văn bản, biên bản, giấy tờ kèm theo); mỗi tài liệu có **tệp**, thường là bản scan đã ký và đóng dấu. Tiêu đề nhóm cho biết tên tài liệu, loại tài liệu và trạng thái (ví dụ CHÍNH THỨC).
- Nút **Tải lên** (một nút duy nhất): mở hộp thoại, **kéo thả hoặc chọn nhiều tệp** PDF, JPEG, PNG (không giới hạn số tệp), đặt tên rồi tải. Có thể tải thêm khi hồ sơ đã ghi sổ; không xóa hay sửa tài liệu đã có.
- Mỗi tệp một dòng gọn: tên tệp (tên dài bị cắt ba chấm, rê chuột để xem đủ), dung lượng, phiên bản (v1, v2...), ngày, nhãn **Bản scan chính** hoặc **Bản scan**, và **trạng thái OCR**.
- **OCR** là bước máy đọc chữ trong bản scan để tìm theo nội dung: hiện *Chờ OCR*, phần trăm tiến độ khi đang chạy, rồi hoàn tất. Trong lúc OCR, bạn **vẫn xem và tải tệp bình thường**; chỉ tìm theo nội dung chữ phải đợi OCR xong (thường vài phút). Nếu OCR lỗi, bấm **Thử lại OCR**.
- Chọn một tệp để **xem trước** bên cạnh; nút **Tải về** và **In** nằm dưới khung xem.
- **Menu ⋯** của mỗi tệp: các thao tác như xem phiên bản cũ của tệp (đã gộp từ tab "Phiên bản cũ" trước đây) và xóa scan nếu bạn có quyền xóa scan.
- **Xóa scan:** chỉ người có quyền; xóa mềm, giữ 30 ngày trong mục **Scan đã xóa** (Admin xem và tải, không khôi phục), sau đó phần mềm xóa hẳn.
- Hồ sơ chưa có tệp nào hiện "Chưa có tệp" kèm gợi ý tải lên.

### Đánh dấu "Đã trả kết quả"

Trên mỗi dòng danh sách có ô tích **Đã trả KQ**. Tích khi đã trả kết quả cho khách hoặc cơ quan yêu cầu. Chỉ là dấu hiệu theo dõi, không đổi trạng thái hồ sơ; người có quyền thêm tài liệu của nghiệp vụ đó mới tích được. Chip "Chưa trả kết quả" và "Quá hạn báo kết quả" dùng ô này.

## 8. Sửa hồ sơ đã ghi sổ

Hồ sơ đã lưu chính thức không sửa trực tiếp. Có hai đường:

- **Admin**: mở hồ sơ, bấm **Sửa hồ sơ (Admin)**, sửa các ô cần thiết, **bắt buộc nhập lý do**, bấm Lưu thay đổi. Mỗi lần sửa tạo một **phiên bản mới**, bản gốc khi ghi sổ vẫn được giữ; số hồ sơ không đổi. Người sửa, thời điểm, lý do ghi vào lịch sử.
- **Người khác**: chỉ **tải thêm** tài liệu hoặc scan. Nếu nội dung sai, nhờ Admin sửa (kèm scan văn bản sửa đổi lập ngoài đời nếu có).

## 9. Lịch sử hồ sơ

Tab **Lịch sử hồ sơ** liệt kê, mới nhất trước: thời gian, người làm, việc đã làm (ví dụ "Tạo nháp hồ sơ", "Gán chi nhánh cho hồ sơ", "Thêm tài liệu", "Tải tệp lên", "Tải tệp về", "Xác nhận lưu chính thức (cấp số hồ sơ)") và ghi chú (ví dụ số hồ sơ được cấp). Phía trên có mục **Thay đổi nội dung** cho các bản sửa của Admin (trước và sau). Dòng giống nhau liên tiếp được gộp cho dễ đọc. Lịch sử chỉ xem, không sửa.

## 10. Xuất sổ nghiệp vụ

- Vào **Xuất sổ nghiệp vụ** (thanh bên) hoặc bấm **Xuất sổ S-0x** ở danh sách.
- Chọn sổ, năm; xem trước PDF theo đúng mẫu Phụ lục I (bìa, trang ruột) hoặc tải CSV/Excel.
- Sổ điện tử vẫn **phải in hằng tháng, đóng quyển, giáp lai** theo TT 08/2026 (Điều 37). Mẫu sổ mới bắt buộc từ 01/01/2027.
- Sổ chỉ gồm hồ sơ **đã ghi sổ** trong phạm vi chi nhánh bạn được xem.

## 11. Trình / Duyệt

Bản trình là cách nhân viên (Thừa hành viên, Văn thư) gửi tiêu đề, mô tả và bản scan lên để Admin duyệt hoặc từ chối. Bản trình **không phải hồ sơ nghiệp vụ**, không có số hồ sơ.

- Người gửi chỉ thấy bản của mình; Admin thấy cả văn phòng. Huy hiệu đỏ ở thanh bên cho biết số bản đang chờ.
- Admin mở bản trình, xem scan, nhập ghi chú rồi **Duyệt** hoặc **Từ chối** (từ chối **bắt buộc** nhập ghi chú).
- Bản trình không bao giờ bị xóa.

## 12. Các mục khác ở nhóm Văn phòng

- **Văn thư**: ba sổ riêng, **Văn bản đến**, **Văn bản đi**, **Văn bản nội bộ**, mỗi sổ có danh sách và nút **+ Thêm bản ghi**. Hệ thống tự cấp "Số đến" (văn bản đến) và STT; không tự sinh số/ký hiệu văn bản.
- **Thư viện biểu mẫu**: tải các biểu mẫu nghiệp vụ.
- **Vật tư văn phòng**: danh mục, tồn, nhập, xuất, kiểm kê; điều chỉnh bắt buộc nêu lý do.
- **Tài liệu cũ**: kho tệp nhập từ nơi khác, chỉ xem, tải, tìm; không sửa.
- **Báo cáo tổng hợp**: số liệu tổng hợp theo mẫu N-09/N-10 (không tính tiền; tiền do MISA).
- **Tổng quan**: công việc đang chờ theo vai của bạn.

## 13. Dành cho Admin (tóm tắt)

Vào **Quản trị**:

- **Tài khoản**: tạo thành viên (email, họ tên, mật khẩu ban đầu tối thiểu 12 ký tự, CCCD tùy chọn), xếp nhóm quyền, cấp chi nhánh; tạm khóa tài khoản (bắt buộc nêu lý do).
- **Nhóm quyền**: quyền chỉ đến từ nhóm quyền; nhóm **Admin** của hệ thống không đổi. Sao chép nhóm mẫu rồi chỉnh; đổi quyền có hiệu lực ngay và ghi nhật ký.
- **Chi nhánh**, **Thẻ thừa hành viên**, **Email gửi thư (SMTP)**, **Lịch làm việc và ngày nghỉ** (ảnh hưởng hạn "quá hạn báo kết quả"), **Hồ sơ lao động**, **Cài đặt văn phòng**.
- **Lịch sử hoạt động**, **Scan đã xóa**, **Trình / Duyệt**, sửa hồ sơ đã ghi sổ (mục 8).

## 14. Dùng trên điện thoại

Dùng được các màn chính: thanh bên thu thành nút menu, bảng cuộn ngang, ngăn lọc mở rộng hết chiều ngang. Nên dùng máy tính để tải nhiều tệp và đối chiếu bảng rộng.
