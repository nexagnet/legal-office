# Legal Office: hướng dẫn sử dụng cho Văn phòng thừa hành viên

Phiên bản 27/10/2026 (giao diện theo Figma N13). Ảnh chụp từ bản chạy thử, toàn bộ dữ liệu trong ảnh là dữ liệu giả.
Nguồn tái dựng PDF: tệp này + thư mục `screenshots/` + danh sách ảnh ở `screenshots.md`.

## Ba nguyên tắc của phần mềm

- **Phần mềm ghi nhận, nhắc và chặn bước sai; người có thẩm quyền mới ký và ban hành.** "Duyệt" trong phần mềm không phải chữ ký pháp lý.
- **Không làm kế toán.** MISA là sổ kế toán duy nhất. Phần mềm chỉ ghi "đã" hoặc "chưa" xác nhận thanh toán đủ, không lưu số tiền, công nợ hay bút toán.
- **Không xoá, không sửa âm thầm hồ sơ đã có giá trị pháp lý.** Mọi thay đổi quan trọng đều lưu người làm, thời điểm và lý do.

## 1. Bắt đầu

### 1.1 Đăng nhập

1. Mở địa chỉ hệ thống do Văn phòng cung cấp.
2. Nhập Email và Mật khẩu rồi bấm Đăng nhập.
3. Sai quá 5 lần, tài khoản bị khoá 15 phút. Liên hệ Admin để được hỗ trợ.
4. Admin có thêm lựa chọn "Admin: đăng nhập bằng email": nhận email chứa một liên kết, bấm vào liên kết là vào được.

![Hình 1. Màn hình đăng nhập](screenshots/01-dang-nhap.png)

### 1.2 Giao diện chung

- **Thanh bên trái** chia theo nhóm: Công việc, Nghiệp vụ, Văn phòng, Quản trị. Mỗi người chỉ thấy mục thuộc vai của mình. Mục Hộp duyệt có số đỏ khi có đề xuất đang chờ.
- **Nút Thu gọn** ở cuối thanh bên: thu thanh bên thành một cột biểu tượng để màn làm việc rộng hơn, bấm lại để mở. Máy nhớ lựa chọn của bạn.
- **Ô Tìm kiếm** phía trên (bấm Ctrl K ở bất kỳ màn nào). Chuông thông báo và thẻ tài khoản ở góc phải.
- Hai mục quản trị ở cuối thanh bên là **Người dùng** (nhân sự, chi nhánh, phân quyền, thẻ THV, email, lịch) và **Cấu hình hệ thống** (thông tin pháp lý của văn phòng).
- Trang Tổng quan hiện thẻ số liệu của bốn nghiệp vụ và việc chung toàn Văn phòng.

![Hình 2. Trang Tổng quan và thanh bên (vai Admin)](screenshots/02-tong-quan-admin.png)
![Hình 3. Thanh bên đã thu gọn](screenshots/03-thanh-ben-thu-gon.png)

### 1.3 Sáu vai và việc được làm

| Vai | Được làm | Không được |
|---|---|---|
| Admin | Quản lý tài khoản và địa điểm; phân công Thừa hành viên (THV); duyệt hoặc từ chối đề nghị sửa sau 48 giờ; duyệt đề nghị thu hồi xác nhận MISA; xem báo cáo. | Không đương nhiên được ký hay ban hành văn bản pháp lý. |
| Trưởng Văn phòng | Theo dõi nghiệp vụ; duyệt chuyển hồ sơ; duyệt cấp quyền; quyết định kết luận xác minh; ký các văn bản thuộc thẩm quyền. | Không nhầm "duyệt nội bộ" với "ký pháp lý". |
| Thừa hành viên | Xem mọi hồ sơ Vi bằng; thao tác pháp lý trên hồ sơ được giao; xác nhận đã ký; ghi tống đạt; tải chứng cứ; ghi bàn giao. | Không làm bước pháp lý trên hồ sơ không được giao. |
| Thư ký | Tạo hồ sơ, nhập thông tin, soạn hợp đồng, bổ sung chứng cứ, liên hệ khách, đề nghị sửa sau 48 giờ. | Không làm hành vi pháp lý chỉ dành cho THV. |
| Văn thư | Tạo hồ sơ; cấp số Vi bằng; xác nhận đã đóng dấu; tải bản scan cuối; vào sổ công văn; theo dõi cập nhật Sở Tư pháp. | Không cấp số khi chưa có xác nhận thanh toán. |
| Kế toán | Đối chiếu MISA và xác nhận thanh toán đủ; đề nghị thu hồi xác nhận nhầm. | Chỉ thấy Vi bằng; không tự duyệt đề nghị do mình gửi. |

### 1.4 Cách thao tác trong một hồ sơ (áp dụng cho cả bốn nghiệp vụ)

- Trang hồ sơ có **banner** ở đầu (mã hồ sơ, trạng thái, nút **Thêm thao tác**) và **các tab** ngay dưới banner. Chỉ nội dung của tab đang chọn hiện ra.
- **Thêm thao tác** gom mọi việc có thể làm với hồ sơ. Việc chưa tới bước vẫn hiện nhưng mờ, kèm lý do ngắn (ví dụ "Chưa cấp số").
- Việc ngắn mở thành **hộp thoại** giữa màn hình; việc theo giai đoạn mở thành **ngăn kéo** bên phải. Đóng bằng nút ×, phím Esc hoặc bấm ra ngoài; thao tác thành công thì tự đóng.
- Thao tác bị từ chối thì lý do hiện bằng chữ đỏ ngay dưới nút.

## 2. Lập Vi bằng

Một hồ sơ Vi bằng đi qua nhiều vai.

| Bước | Vai thực hiện | Làm ở đâu |
|---|---|---|
| 1. Tiếp nhận hồ sơ | Thư ký, Văn thư, THV, Admin | Vi bằng, Tạo hồ sơ |
| 2. Giao THV phụ trách | Admin | Thêm thao tác, Phân công |
| 3. Xác nhận thanh toán đủ (MISA) | Kế toán | Thêm thao tác, Cấp số |
| 4. Cấp số Vi bằng | Văn thư | Thêm thao tác, Cấp số |
| 5. Xác nhận đã ký | THV phụ trách | Thêm thao tác, Ký và đóng dấu |
| 6. Xác nhận đã đóng dấu | Văn thư | Thêm thao tác, Ký và đóng dấu |
| 7. Tải bản scan cuối | Văn thư | Thêm thao tác, Ký và đóng dấu |
| 8. Liên hệ khách và trả kết quả | THV | Thêm thao tác, Trả kết quả |
| 9. Theo dõi cập nhật Sở Tư pháp | Văn thư, THV | Thêm thao tác, Cập nhật số |

### Các tab của hồ sơ Vi bằng

| Tab | Dùng để |
|---|---|
| Tiến độ | Thanh các bước của hồ sơ, bước nào đã xong, bước kế tiếp. |
| Thông tin | Thông tin hồ sơ và người phụ trách; sửa trực tiếp trong 48 giờ đầu. |
| Tài liệu | Kho chứng cứ và bản scan có phiên bản và mã kiểm tra; lọc theo loại; thấy tệp đã ký, đã đóng dấu, đã scan. |
| Pháp lý | Người yêu cầu, địa điểm, sự kiện chứng kiến, người tham gia (dữ liệu cho văn bản N-04). |
| Lịch sử | Nhật ký ai làm gì, lúc nào, theo thời gian. Chỉ ghi thêm, không sửa. |
| Đề nghị thay đổi | Đề nghị sửa sau 48 giờ và trạng thái duyệt; bấm Tạo đề nghị để gửi đề nghị mới. |

![Hình 4. Hồ sơ Vi bằng: banner, tab Tiến độ](screenshots/04-vibang-tien-do.png)
![Hình 5. Tab Tài liệu](screenshots/05-vibang-tai-lieu.png)
![Hình 6. Tab Lịch sử](screenshots/06-vibang-lich-su.png)

### Menu Thêm thao tác của hồ sơ Vi bằng

Bốn nhóm:

- **Hồ sơ**: sửa trong 48 giờ hoặc đề nghị thay đổi; phân công thừa phát lại (Admin); duyệt đề nghị sửa (Admin, chỉ hiện khi có đề nghị chờ).
- **Phát hành**: Cấp số MISA; Ký và đóng dấu; Trả kết quả; Kiểm tra bàn giao.
- **Sau phát hành**: Thu hồi xác nhận MISA; Sửa lỗi kỹ thuật N-11; Cấp bản sao; Cập nhật số (Sở Tư pháp).
- **Nguy hiểm**: Từ chối yêu cầu; Huỷ hồ sơ (cả hai bắt buộc ghi lý do).

![Hình 7. Menu Thêm thao tác](screenshots/07-vibang-menu-thao-tac.png)

### Bước 1. Tiếp nhận hồ sơ (Thư ký)

1. Vào Vi bằng, bấm + Tạo hồ sơ Vi bằng.
2. Chọn loại khách (cá nhân hoặc tổ chức) và địa điểm tiếp nhận.
3. Nhập Mã tham chiếu khách hàng, tên, số điện thoại, Tiêu đề hồ sơ và nội dung yêu cầu.
4. Bấm Tạo hồ sơ. Thấy thông báo "Đã tiếp nhận hồ sơ".

*Quy tắc:* chỉ cần thông tin tối thiểu khi tiếp nhận; thông tin pháp lý bắt buộc được bổ sung trước bước hoàn tất văn bản N-04. Ô "Thừa hành viên phụ trách" luôn để trống vì chỉ Admin được phân công. Hồ sơ có số tiếp nhận dạng 1/2026/TN.

![Hình 8. Form tiếp nhận](screenshots/08-vibang-tiep-nhan.png)

### Bước 2. Phân công THV (Admin)

1. Mở hồ sơ, bấm Thêm thao tác, chọn Phân công thừa phát lại.
2. Chọn Thừa hành viên trong hộp thoại, bấm Xác nhận phân công. Khi đổi người sau này phải nhập lý do.

*Quy tắc:* mỗi hồ sơ có đúng một THV phụ trách. Mọi lần đổi người đều lưu lịch sử.

![Hình 9. Hộp thoại Phân công](screenshots/09-vibang-phan-cong.png)

### Bước 3 và 4. Xác nhận thanh toán và cấp số

1. **Kế toán**: Thêm thao tác, Cấp số MISA. Đối chiếu trên MISA, nhập Mã tham chiếu MISA, bấm Xác nhận đã thu đủ trên MISA.
2. **Văn thư**: cùng màn, bấm Cấp số. Hệ thống ra số dạng 1/2026/VB-THV.

*Quy tắc:* phần mềm không có ô nhập số tiền. Số chạy một dãy chung cho toàn Văn phòng, tăng dần trong năm, sang năm bắt đầu lại, không dùng lại số của hồ sơ huỷ. Chưa có xác nhận thanh toán thì không cấp số. Xác nhận nhầm: Kế toán gửi đề nghị Thu hồi xác nhận MISA, Admin quyết định (người gửi không tự duyệt được).

![Hình 10. Ngăn kéo Cấp số MISA](screenshots/10-vibang-cap-so.png)
![Hình 11. Hộp thoại Thu hồi xác nhận MISA](screenshots/11-vibang-thu-hoi-misa.png)

### Bước 5 đến 7. Ký, đóng dấu, bản scan cuối

1. **THV phụ trách**: Thêm thao tác, Ký và đóng dấu; bấm Xác nhận đã ký sau khi ký thật trên văn bản giấy.
2. **Văn thư**: bấm Xác nhận đã đóng dấu (chỉ mở sau khi THV xác nhận ký).
3. **Văn thư**: chọn tệp PDF (tối đa 25 MB) đã có chữ ký và dấu, bấm Tải bản scan cuối.

Bản gốc giấy lưu tại Văn phòng; bản scan trên hệ thống chỉ phục vụ quản lý, chưa phải chữ ký số pháp lý.

![Hình 12. Ngăn kéo Ký và đóng dấu](screenshots/12-vibang-ky-dong-dau.png)

### Bước 8. Liên hệ khách và trả kết quả (THV)

1. Thêm thao tác, Trả kết quả. Khi đủ điều kiện, màn hiện "ĐỦ ĐIỀU KIỆN TRẢ KẾT QUẢ".
2. Ghi từng lần liên hệ: loại (nhắc nhận, báo kết quả) và kết quả liên hệ.
3. Nhập Người nhận kết quả, Ngày bàn giao, bấm Lưu người nhận.
4. Bấm Xác nhận đã trả kết quả.

*Quy tắc:* để được "Đã trả" phải đủ 5 thứ: thanh toán còn hợp lệ, THV đã ký, Văn thư đã đóng dấu, bản scan cuối đã tải, và việc bàn giao thực tế đã xảy ra. Liên hệ khách không đồng nghĩa với đã trả. Menu có thêm mục Kiểm tra bàn giao để xem còn thiếu gì.

![Hình 13. Ngăn kéo Trả kết quả](screenshots/13-vibang-tra-ket-qua.png)

### Bước 9. Theo dõi cập nhật Sở Tư pháp

Việc cập nhật cơ sở dữ liệu hoặc gửi Sở Tư pháp là việc riêng, hạn 3 ngày làm việc, không chặn việc trả khách. Chọn Thêm thao tác, Cập nhật số để ghi tình trạng: Đang cập nhật, Đã gửi Sở, Đã cập nhật hoặc Có sự cố.

### Từ chối yêu cầu, huỷ hồ sơ, sửa sau 48 giờ, bản sao, sửa lỗi N-11

- **Từ chối yêu cầu** (Điều 28): 8 khoản theo Nghị định 151, bắt buộc ghi lý do; khoản 8 (trường hợp khác) phải có căn cứ. Hồ sơ đã cấp số không đóng được bằng cách này.
- **Huỷ hồ sơ**: bắt buộc ghi lý do. Cả hai nằm ở nhóm Nguy hiểm của menu.
- **Sửa sau 48 giờ**: trong 48 giờ đầu bạn sửa trực tiếp ở tab Thông tin; sau đó vào tab Đề nghị thay đổi, bấm Tạo đề nghị. Admin duyệt hoặc từ chối ở mục Duyệt đề nghị sửa.
- **Cấp bản sao**: ghi cấp bản sao hoặc từ chối cấp bản sao.
- **Sửa lỗi kỹ thuật N-11**: chỉ sửa lỗi kỹ thuật; ghi nội dung trước và sau, lý do, người sửa. Hạn cập nhật 2 ngày làm việc.

## 3. Tống đạt

Dùng để lập yêu cầu tống đạt văn bản, giao người xử lý, ghi từng lần tống đạt và kết quả.

Danh sách chỉ tóm tắt (mã yêu cầu, người nhận, hạn, trạng thái, số lần). Bấm mã yêu cầu hoặc "Mở" để vào **trang chi tiết**; mọi thao tác nằm trong trang đó.

1. **Tạo yêu cầu** (Thư ký, THV, Văn thư, Admin): ở danh sách bấm nút tạo, nhập chi nhánh, mã yêu cầu, người nhận, địa chỉ, hạn tống đạt, bấm Tạo yêu cầu.
2. **Giao người xử lý** (Admin): ở trang chi tiết, mục Phân công, chọn người, bấm Lưu. Trạng thái chuyển từ "Chưa giao người xử lý" sang "Đang xử lý".
3. **Ghi nhận lần tống đạt**: chọn kết quả (người nhận từ chối, vắng mặt, không có người nhận, sai địa chỉ, lý do khác), bấm Ghi nhận lần tống đạt. Số lần tăng.
4. **Ghi nhận đã tống đạt**: tải bằng chứng (PDF, JPEG, PNG, tối đa 25 MB), bấm Ghi nhận đã tống đạt.
5. **Không tống đạt được**: chọn lý do và bấm Đánh dấu không tống đạt được.

*Quy tắc:* chưa giao người xử lý thì không ghi được lần tống đạt; hệ thống báo "Hồ sơ cần được giao THV phụ trách trước".

![Hình 14. Danh sách Tống đạt](screenshots/14-tong-dat-danh-sach.png)
![Hình 15. Trang chi tiết Tống đạt](screenshots/15-tong-dat-chi-tiet.png)

## 4. Xác minh điều kiện thi hành án

Danh sách chỉ tóm tắt. Bấm mã hồ sơ để vào trang chi tiết, gồm banner (mã hồ sơ, trạng thái, nút Thêm thao tác) và bốn tab:

| Tab | Nội dung |
|---|---|
| Tổng quan | Mã hồ sơ, trạng thái, THV phụ trách, số lượt xác minh, kết luận. |
| Các lượt xác minh | Bảng các lượt: bên được xác minh, trạng thái (Đang xác minh, Đã có kết quả), kết quả. Nút Thêm lượt xác minh ở đầu bảng; nút Ghi kết quả ở mỗi lượt đang xác minh. |
| Kết luận | Kết luận đã đề xuất; đề xuất kết luận (THV) hoặc quyết định kết luận (Trưởng Văn phòng). |
| Lịch sử | Các mốc dựng từ lượt và kết luận đã ghi. |

Thêm thao tác gồm: Thêm lượt xác minh, Đề xuất kết luận, Quyết định kết luận, Phân công Thừa hành viên (Admin), Ngày ký hợp đồng.

Các bước:

1. **Mở hồ sơ** ở danh sách: nhập chi nhánh, mã hồ sơ, bấm Mở hồ sơ.
2. **Giao THV phụ trách** (Admin): Thêm thao tác, Phân công Thừa hành viên.
3. **Ghi ngày ký hợp đồng dịch vụ xác minh**: hệ thống dùng ngày này để tính hạn ra quyết định.
4. **Thêm lượt xác minh**: nhập tên bên được xác minh.
5. **Ghi kết quả cho lượt**: ở dòng của lượt bấm Ghi kết quả; thêm chứng cứ (loại, mức bảo mật, mục đích, tệp) rồi ghi kết quả của lượt.
6. **Đề xuất kết luận** khi mọi lượt đã có kết quả. Trạng thái chuyển thành "Chờ quyết định kết luận".
7. **Trưởng Văn phòng** chọn Chấp nhận kết luận hoặc Trả về để xác minh tiếp.

*Quy tắc:* chưa có kết quả ở mọi lượt thì không gửi được đề xuất kết luận. Duyệt kết luận trong phần mềm khác với ký quyết định pháp lý.

![Hình 16. Xác minh chi tiết: các lượt xác minh](screenshots/16-xac-minh-luot.png)
![Hình 17. Menu Thêm thao tác của hồ sơ xác minh](screenshots/17-xac-minh-menu.png)
![Hình 18. Hộp thoại Ghi kết quả](screenshots/18-xac-minh-ghi-ket-qua.png)
![Hình 19. Tab Kết luận khi chờ quyết định](screenshots/19-xac-minh-ket-luan.png)

## 5. Tổ chức thi hành án

Danh sách chỉ tóm tắt; bấm mã hồ sơ để vào trang chi tiết (đương sự, nghĩa vụ, thao tác, phân công).

1. **Mở hồ sơ**: nhập chi nhánh, mã hồ sơ, tham chiếu hợp đồng dịch vụ, tham chiếu quyết định hoặc bản án.
2. **Giao THV phụ trách** (Admin).
3. **Thêm đương sự**: tên, loại (cá nhân hoặc tổ chức), vai trò (người được thi hành, người phải thi hành, người có quyền lợi nghĩa vụ liên quan, người đại diện).
4. **Thêm nghĩa vụ**: mô tả bằng chữ, không ghi số tiền.
5. **Ghi kết quả cho từng nghĩa vụ** (một phần hoặc hoàn tất) kèm ghi chú và tệp chứng cứ.
6. **Hoàn tất hồ sơ** kèm tệp chứng cứ hoàn tất; hoặc **Chấm dứt hồ sơ** khi có lý do.

*Quy tắc:* còn nghĩa vụ chưa hoàn tất thì chưa hoàn tất hồ sơ được. Thanh toán do Kế toán xác nhận trên MISA, phần mềm không ghi số tiền.

![Hình 20. Trang chi tiết hồ sơ THA](screenshots/20-tha-chi-tiet.png)

## 6. Khách hàng và hợp đồng

Danh bạ khách (cá nhân hoặc tổ chức), hợp đồng dịch vụ và các tệp đi kèm. Một khách có nhiều hợp đồng; một hợp đồng có thể gắn nhiều hồ sơ Vi bằng. Dành cho vai tiếp nhận (Admin, Trưởng VP, Thư ký); THV, Văn thư và Kế toán không mở được màn này.

1. Vào Khách hàng & hợp đồng. Dùng ô tìm để tìm khách; bấm Xem và sửa để mở khách.
2. Cập nhật Thông tin cá nhân (tên, giấy tờ, địa chỉ, điện thoại), bấm Lưu thông tin.
3. Nhập Mã hợp đồng mới và bấm Thêm hợp đồng.
4. Mở hợp đồng: chọn Dịch vụ (Vi bằng, Tống đạt, Xác minh, Tổ chức THA), Trạng thái, ngày ký, hiệu lực, ghi chú; bấm Lưu hợp đồng.
5. Mở Tệp hợp đồng và người tham gia để tải bản scan hợp đồng (PDF, JPEG, PNG) và liên kết người tham gia với vai: đại diện, thụ hưởng, làm chứng, khác.
6. Dùng Soạn hợp đồng N-03 để sinh bản nháp Word từ mẫu.

**Phụ lục hợp đồng:** bấm Thêm phụ lục hợp đồng. Mỗi phụ lục có loại (gia hạn hoặc điều chỉnh thời hạn, bổ sung phạm vi, đổi bên tham gia, khác), ngày hiệu lực, nội dung (tối đa 2.000 ký tự) và bản scan đã ký bắt buộc (tối đa 25 MB). Phụ lục chỉ ghi thêm, không sửa, không xoá; nếu sai thì thêm phụ lục mới. Không đổi trạng thái hợp đồng và không có số tiền.

![Hình 21. Danh bạ khách hàng](screenshots/21-khach-hang.png)
![Hình 22. Hợp đồng và phụ lục](screenshots/22-hop-dong.png)

## 7. Hộp duyệt và Việc của tôi

- **Việc của tôi**: hồ sơ đang giao cho bạn ở cả bốn nghiệp vụ, hạn gần nhất lên trước. Bấm vào dòng để mở hồ sơ. Chưa được giao việc thì trang hiện "Không có việc được giao".
- **Hộp duyệt**: nơi Admin và Trưởng Văn phòng duyệt đề nghị nội bộ (sửa hồ sơ sau 48 giờ, thu hồi xác nhận MISA, chuyển hồ sơ, uỷ quyền). Mỗi đề nghị có ba lựa chọn: duyệt, trả lại (chặn hoàn tất cho đến khi nộp lại) hoặc từ chối (chấm dứt đề nghị). Người đề nghị không tự duyệt đề nghị của mình.

![Hình 23. Việc của tôi (vai THV)](screenshots/23-viec-cua-toi.png)
![Hình 24. Hộp duyệt](screenshots/24-hop-duyet.png)

## 8. Sổ sách, biểu mẫu, công văn, vật tư, báo cáo

- **Sổ sách**: chọn sổ (S-01 Tống đạt, S-02 Vi bằng, S-04 Xác minh, S-05 Thi hành án) và năm, bấm Xem. Xuất Excel, Xuất PDF, Tải CSV. Mục Theo dõi cập nhật Sở liệt kê hồ sơ chờ cập nhật theo hạn 3 ngày làm việc.
- **Thư viện biểu mẫu**: đăng ký và tải các phụ lục của Thông tư 06 (Phụ lục I đến IX), tìm biểu mẫu, Soạn nội dung Vi bằng N-04 để xuất bản nháp Word.
- **Công văn đi và đến**: bấm + Tạo văn bản, chọn Công văn đến, nhập loại văn bản, nơi gửi, trích yếu, số ký hiệu, ngày nhận, bấm Vào sổ. Ghi kết quả xử lý và nơi lưu ở cột Thao tác.
- **Vật tư**: tab Tồn kho (lọc Tất cả, Còn tồn, Sắp hết, Hết tồn; tìm theo tên) và tab Lô và kiểm kê. Nút **Nhập / xuất** để nhập kho hoặc xuất kho theo chi nhánh (xuất theo nguyên tắc lô nhập trước xuất trước, lưu người thao tác). Dấu **…** cạnh nút chứa **Thêm vật tư** (tên, đơn vị tính).
- **Ngưỡng Sắp hết**: Admin hoặc Trưởng Văn phòng bấm vào cột Ngưỡng của vật tư để đặt số lượng cảnh báo; khi tồn lớn hơn 0 và không vượt ngưỡng, dòng hiện nhãn "Sắp hết" và vào bộ lọc Sắp hết. Để trống ngưỡng thì không cảnh báo. Chỉ ghi số lượng, không có giá.
- **Báo cáo hoạt động**: số liệu theo ngày tạo, đếm riêng từng nghiệp vụ, không cộng chéo, không có số tiền. Xuất Excel, PDF hoặc CSV.

![Hình 25. Sổ theo dõi Vi bằng (S-02)](screenshots/25-so-sach.png)
![Hình 26. Thư viện biểu mẫu](screenshots/26-bieu-mau.png)
![Hình 27. Vào sổ công văn đến](screenshots/27-cong-van.png)
![Hình 28. Vật tư: tồn kho, ngưỡng, chip Sắp hết](screenshots/28-vat-tu.png)
![Hình 29. Báo cáo hoạt động](screenshots/29-bao-cao.png)

## 9. Người dùng và Cấu hình hệ thống

Chỉ Admin và Trưởng Văn phòng thấy mục **Người dùng** ở thanh bên; trang chia sáu mục: Nhân sự, Chi nhánh, Phân quyền, Thẻ THV, Email gửi thư, Lịch làm việc.

- **Nhân sự**: danh bạ thành viên (vai trò, địa điểm được cấp, quyền ký pháp lý, trạng thái). Tìm theo tên hoặc email (không cần dấu), lọc theo vai trò. Người vừa thêm nhưng chưa duyệt có trạng thái Chờ duyệt. Chỉ Admin xem được danh bạ.
- **Thêm thành viên** (Admin): + Thêm thành viên, nhập họ tên, email, vai trò (Văn thư, Kế toán chọn thêm địa điểm); chọn cách đăng nhập (gửi link qua email, khuyến nghị, hoặc mật khẩu tạm); nhập lý do, bấm Thêm và gửi đề xuất. Tài khoản chưa có vai nên chưa vào được cho đến khi được duyệt.
- **Nguyên tắc hai người**: Admin đề xuất, Trưởng Văn phòng duyệt; người duyệt phải khác người đề xuất. Mọi bước đều ghi nhật ký.
- **Phân quyền**: Trưởng Văn phòng duyệt hoặc từ chối đề xuất của Admin (thêm thành viên, đổi vai, cấp địa điểm, cấp hoặc thu hồi quyền ký). Từ chối bắt buộc ghi chú. Admin có thể Rút đề xuất của mình. Tab Đã xử lý lưu đề xuất cũ.
- **Chi nhánh**: danh sách địa điểm kèm số thành viên. Admin thêm địa điểm (không trùng tên) hoặc đổi tên; địa điểm đã có hồ sơ không xoá được.
- **Thẻ THV, Email gửi thư, Lịch làm việc**: mỗi mục một trang riêng. Email gửi thư cần để gửi link đăng nhập.
- **Cấu hình hệ thống**: tên đơn vị pháp lý, tên hiển thị trên văn bản, quy tắc số Vi bằng, người xác nhận hồ sơ, địa điểm hoạt động. Văn phòng là một pháp nhân, các địa điểm dùng chung một dãy số Vi bằng.

![Hình 30. Nhân sự](screenshots/30-nhan-su.png)
![Hình 31. Phân quyền và đề xuất](screenshots/31-phan-quyen.png)
![Hình 32. Cấu hình hệ thống](screenshots/32-cau-hinh.png)

## 10. Những điều cần nhớ

- Thao tác nào bị từ chối, hệ thống hiện lý do bằng chữ đỏ ngay dưới nút. Đọc kỹ lý do trước khi thử lại.
- Nếu một trạng thái chưa đổi sau khi bấm, tải lại trang (F5) và kiểm tra trước khi bấm lần nữa.
- Không nhập số tiền, công nợ hay thông tin thanh toán vào bất kỳ ô nào. Mọi việc tiền bạc làm trên MISA.
- Không dùng dữ liệu khách thật trên môi trường chạy thử.
- Mỗi người chỉ làm trên hồ sơ trong phạm vi vai và địa điểm được cấp. Thấy "không có quyền" nghĩa là thao tác đó không thuộc vai của bạn.

### Gặp sự cố thì làm gì

| Hiện tượng | Cách xử lý |
|---|---|
| Đăng nhập báo sai nhiều lần | Đợi 15 phút hoặc nhờ Admin đặt lại mật khẩu. |
| Không thấy menu cần dùng | Menu theo vai. Nhờ Admin kiểm tra vai và địa điểm được cấp. |
| Không cấp được số | Kiểm tra Kế toán đã xác nhận thanh toán đủ chưa. |
| Không bấm được "Đã trả kết quả" | Kiểm tra đủ 5 điều kiện ở bước 8 của mục Vi bằng. |
| Mục trong "Thêm thao tác" bị mờ | Đưa mắt đọc dòng lý do bên cạnh; làm bước trước rồi quay lại. |
| Màn báo lỗi chung | Tải lại trang; nếu vẫn lỗi, chụp màn hình gửi Admin. |
