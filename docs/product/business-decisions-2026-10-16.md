# Quyết định nghiệp vụ suy ra từ văn bản pháp luật — 16/10/2026

> Tệp này **không thay** `nghiệp vụ.md` hay Issue #1. Nó ghi các điểm "cần đối chiếu nguồn" (nghiệp vụ.md §XIII) đã được đối chiếu với NĐ 151/2026 và TT 08/2026, kèm căn cứ. Điểm nào chưa có căn cứ được ghi **CHƯA CHỐT** và không được code thành quy tắc cứng.

## A. Đã đối chiếu được (làm ngay)

| # | Điểm | Kết luận | Căn cứ |
|---|---|---|---|
| 5 | Các trường hợp không được lập vi bằng | Danh sách đóng 8 khoản. Từ chối yêu cầu phải ghi **mã khoản Điều 28** (1 người thân; 2 an ninh/bí mật nhà nước; 3 đời tư, trái đạo đức; 4 thuộc phạm vi công chứng/chứng thực/dịch/sao y; 5 chuyển quyền đất/tài sản không giấy tờ; 6 giao dịch trái pháp luật; 7 công vụ quân đội/công an; 8 khác, bắt buộc nhập căn cứ) + lý do + người ghi. Mặc định: Thừa hành viên phụ trách hoặc Admin/Trưởng VP ghi từ chối; không tự đóng hồ sơ đã có số vi bằng. | NĐ 151 Điều 28; Điều 29–30 |
| 6 | Cấp bản sao vi bằng | Hai trường hợp: (a) cơ quan có thẩm quyền yêu cầu bằng văn bản; (b) người yêu cầu/người tham gia lập vi bằng. Chỉ văn phòng đang lưu bản gốc cấp. Lưu: người yêu cầu, loại (a/b), căn cứ + văn bản, vi bằng gốc, số bản, ngày cấp, người nhận. Chi phí (b) thuộc MISA, không có sổ tiền trong hệ thống. | Điều 32; Điều 50 khoản 2; nghiệp vụ.md §20 |
| 4 | Ngày làm việc | Văn bản không định nghĩa. Triển khai **lịch làm việc cấu hình theo văn phòng** (ngày làm việc trong tuần + danh sách ngày nghỉ/lễ do Admin quản lý); hạn hiển thị là **hạn dự kiến để nhắc**, không tự chặn hay đổi trạng thái. Hạn: 3 ngày cập nhật CSDL sau khi kết thúc lập vi bằng (Điều 30.5); 2 ngày cập nhật CSDL sau văn bản sửa lỗi N-11 (Điều 31.3); 2 ngày báo kết quả tống đạt (Điều 25.2); 3 ngày ra quyết định xác minh từ ngày ký hợp đồng (Điều 35); 2 ngày thu hồi quyết định THA sau chấm dứt (Điều 46.1). Ngoại lệ "các bên có thỏa thuận khác" cho phép ghi đè hạn kèm lý do. Thứ Bảy/Chủ nhật không tính (owner đã chốt, mục B1). | NĐ 151 các Điều nêu trên |
| 2 | Ai ký pháp lý | Quyết định xác minh (N-06): Trưởng Văn phòng. Văn bản sửa lỗi kỹ thuật (N-11): Thừa hành viên đã lập vi bằng; Trưởng VP nếu người đó không còn hành nghề tại văn phòng. Vi bằng: THV ký + dấu văn phòng. Quyết định thu hồi quyết định THA: Trưởng VP. Quyền quản trị Admin không kéo theo quyền ký. | Điều 30.3; 31.1; 35; 46.1; nghiệp vụ.md §4.1–4.2 |
| 1 | Bảng quyền từng vai | Căn cứ nghiệp vụ.md §4.1–4.6 là nguồn; `authz/policy.ts` phải được đối chiếu từng dòng, chỗ nào chưa có trong §4 giữ fail-closed và ghi vào bảng chưa chốt. | nghiệp vụ.md §4–5 |
| 3 | Nguồn mẫu N-01…N-11 | Bộ `bieu-mau-nghiep-vu-thua-hanh-vien.docx` mang dòng "Ban hành kèm theo Thông tư số 08/2026/TT-BTP" ở từng mẫu, nên là nguồn mẫu chính thức; phải đối chiếu lại với `08_2026_TT-BTP (co phu luc).pdf`. N-09, N-10 vẫn cần Excel gốc: đến khi có thì chỉ xuất báo cáo thường, không gọi là mẫu chính thức. Bản in ghi rõ phiên bản mẫu. | Đầu trang từng mẫu N-xx; nghiệp vụ.md §XIII.2–3 |
| 8 | Hồ sơ chủ thể | Tối thiểu: họ tên, số định danh cá nhân, địa chỉ, điện thoại (cá nhân); tên, mã số thuế/đăng ký, người đại diện, địa chỉ (tổ chức). Vi bằng cần họ tên, địa chỉ, số định danh của người yêu cầu và người tham gia. Một danh bạ chủ thể dùng chung bốn nghiệp vụ. Đây là suy luận kỹ thuật cho phần tổ chức, chưa phải quy tắc pháp lý. | Điều 30.2 c, d |
| 10 | Tên pháp lý | Hiển thị tạm: "Văn phòng Thi hành án dân sự Doanh nghiệp tư nhân Hai Bà Trưng" (báo giá BG_VP HAIBATRUNG_NETVIET_011026). Là trường cấu hình của tenant; **chờ đối chiếu giấy đăng ký** trước khi in mẫu chính thức. | Báo giá; nghiệp vụ.md §3 |
| 11 | Thông báo | Chỉ nhắc trong ứng dụng; việc nhắc không đổi trạng thái hay tự phê duyệt; không tự gửi SMS/Zalo/email cho khách. | nghiệp vụ.md §52 |
| 9 | Số cuối sổ giấy | Là **dữ liệu** khách phải cung cấp, không phải quyết định phần mềm. Cơ chế nhập số cuối đã có (#45); thiếu số thì không cấp số thật. | nghiệp vụ.md §XIII.9 |

## B. Owner đã quyết định

1. **Thứ Bảy có tính ngày làm việc không?** Đã chốt (16/10/2026): **không**. Lịch làm việc vẫn cấu hình được theo văn phòng; đổi sau không mất dữ liệu.
2. **Admin đăng nhập có xác thực email** (chốt 18/10/2026). Admin nhập email + mật khẩu; hệ thống tự gửi email chứa link; phải bấm link mới sinh mã 6 số; nhập mã vào màn đăng nhập mới có phiên. Email Admin mặc định `phungtienviet14@gmail.com` (đặt bằng `set-password.cli.js`, không ghi cứng trong mã). Tham số kỹ thuật đề xuất, chờ chủ dự án xác nhận: giữ mật khẩu làm lớp đầu; link dùng một lần, hết hạn 15 phút; mã hết hạn 10 phút, sai 5 lần thì huỷ; tối đa 3 lần gửi mỗi 15 phút; chỉ bắt buộc khi tenant đã lưu SMTP; lối thoát bằng lệnh CLI. Chi tiết: `docs/architecture/auth-password.md`.
3. **Hạn pháp định (chốt theo đề xuất 21/10/2026, chủ dự án cho phép tự chọn, sẽ chỉnh sau).** Bốn hạn tính theo ngày làm việc của văn phòng (lịch + ngày nghỉ, thứ Bảy không tính), hạn kết thúc 23:59:59 giờ VN của ngày làm việc cuối; chỉ nhắc, không khoá nghiệp vụ.
   - Điều 25.2 Tống đạt: báo kết quả trong 2 ngày làm việc kể từ khi hoàn thành tống đạt (mốc = lần tống đạt cuối).
   - Điều 31.3 Vi bằng: cập nhật CSDL và gửi N-11 trong 2 ngày làm việc kể từ khi lập N-11.
   - Điều 35.1 Xác minh: Trưởng VP ra quyết định trong 3 ngày làm việc kể từ ngày ký hợp đồng; ngày ký do người xử lý nhập.
   - Điều 46.1 THA: quyết định thu hồi trong 2 ngày làm việc kể từ khi chấm dứt/thanh lý. Chấm dứt vụ việc (ADMIN/Trưởng VP) cần lý do mã, căn cứ và tệp chứng cứ; điểm Luật THADS Điều 31.5 do người dùng ghi trong căn cứ, hệ thống không suy ra.
   - "Trừ khi các bên có thoả thuận khác": Admin/Trưởng VP ghi hạn thoả thuận kèm lý do.
   - Đóng hạn Xác minh/THA cần Trưởng VP có quyền ký (`legal_signer`). Cài đặt: migration 0050, `POST /office/deadlines/:id/{done,agree}`, `PUT /verification/cases/:id/contract-date`, `POST /enforcement/cases/:id/termination`.
4. **Bảng quyền, `legal_signer`, Admin lệch §4.1 (chốt theo đề xuất 21/10/2026, sẽ chỉnh sau).**
   - Nguồn thật của phân quyền là các hàm SQL (`td_authorize`, `of_can_read`, bảo vệ trigger `*_guard`), mỗi thao tác tự kiểm vai, chi nhánh được cấp (`branch_grants`) và người phụ trách. `apps/api/src/authz/policy.ts` chỉ là bảng mô phỏng cho cơ chế fail-closed, không phải nguồn nghiệp vụ.
   - Giữ nguyên hành vi hiện có, không mở rộng thêm quyền: Admin quản trị, duyệt nội bộ (sửa hồ sơ, thu hồi MISA, chuyển hồ sơ), không tự ký văn bản pháp lý; THV chỉ ghi khi được giao; Thư ký/Văn thư/Kế toán theo chi nhánh được cấp.
   - `legal_signer` do Admin cấp cho Trưởng VP hoặc THV theo quyết định bổ nhiệm; mọi bước ký/ban hành (quyết định xác minh, quyết định thu hồi THA) kiểm quyền này, thiếu thì `SIGNING_AUTHORITY_NOT_GRANTED`.
   - Phần Admin đang làm khác §4.1 (nếu có) giữ nguyên để không phá luồng đã chạy; chủ dự án chỉnh sau khi rà bảng quyền thực tế.
5. **Hợp đồng: tệp đính kèm và người tham gia (21/10/2026, theo đề xuất).** Bản scan hợp đồng (PDF/JPEG/PNG) lưu như chứng cứ có hash; người tham gia là khách khác liên kết vào hợp đồng với vai trò (đại diện, thụ hưởng, làm chứng, khác). Chỉ vai tiếp nhận (Admin, Trưởng VP, Thư ký, Văn thư, THV) thao tác và đọc, giống danh bạ. Không lưu số tiền (MISA là sổ duy nhất). Cài đặt: migration 0051, `/vibang/contracts/:id/{attachment-files,attachments,parties}`.

## C. Cổng chặn không phải việc code

- **Lưu trữ ngoài trụ sở** cần văn bản đồng ý của Sở Tư pháp (NĐ 151 Điều 50.1). Chưa có: không dùng dữ liệu thật trên cloud; bản Northflank chỉ dùng dữ liệu giả.
- Chấp nhận của khách/pháp lý đối với bản in chính thức vẫn là trạng thái riêng.

## Thừa hành viên xem hồ sơ Vi bằng (chốt 16/10/2026)

Chủ dự án chốt "Cho xem mọi hồ sơ": vai THV xem được mọi hồ sơ Vi bằng của văn phòng (khớp Business Contract #1). Chỉ thao tác khi được giao; các hàm ghi tự kiểm tra người phụ trách. Cài đặt: migration 0028 (`vb_list_cases`). Phạm vi này cũng áp cho đề nghị thay đổi và tiến độ hồ sơ vì chúng dùng chung `vb_list_cases`.
