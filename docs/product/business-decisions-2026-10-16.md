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

## C. Cổng chặn không phải việc code

- **Lưu trữ ngoài trụ sở** cần văn bản đồng ý của Sở Tư pháp (NĐ 151 Điều 50.1). Chưa có: không dùng dữ liệu thật trên cloud; bản Northflank chỉ dùng dữ liệu giả.
- Chấp nhận của khách/pháp lý đối với bản in chính thức vẫn là trạng thái riêng.
