# Checklist câu hỏi hỏi khách hàng — Legal Office

Ngày lập: 29/10/2026 (bản 1, cập nhật tại chỗ khi có thêm câu hỏi). Tổng 75 câu: P0 19, P1 42, P2 14.

Mục đích: hỏi khách để chốt nghiệp vụ còn mở. Cột "Giả định hiện tại" là điều hệ thống đang làm, không phải quyết định của khách; khách trả lời khác thì code chỉnh theo.

P0 = chặn vận hành thật hoặc đúng sai pháp lý. P1 = cần chốt trước khi nghiệm thu. P2 = tinh chỉnh, hỏi khi tiện.

Nguồn: `docs/product/business-decisions-2026-10-16.md`, `docs/design/bon-nghiep-vu-code-2026-10-28.md`, `docs/design/figma-gap-van-phong-2026-10-28.md`, `docs/architecture/*`, NĐ 151/2026, TT 08/2026, nghiệp vụ.md.

## A. Pháp lý và cổng chặn vận hành

Những việc không phải code, chặn việc dùng dữ liệu thật.

- [ ] **A1** (P0) Sở Tư pháp đã có văn bản đồng ý cho văn phòng lưu hồ sơ ngoài trụ sở (cloud) chưa? Nếu chưa thì khi nào xin?
  - Vì sao hỏi: NĐ 151 Điều 50.1 yêu cầu chấp thuận. Chưa có thì không được dùng dữ liệu thật trên cloud.
  - Giả định hiện tại: Chưa có. Bản chạy chỉ dùng dữ liệu giả.
  - Khách trả lời: 
- [ ] **A2** (P0) Tên pháp lý chính thức, địa chỉ trụ sở, điện thoại và số giấy đăng ký hoạt động của văn phòng là gì? Xin ảnh giấy đăng ký.
  - Vì sao hỏi: Các thông tin này in lên biểu mẫu và sổ chính thức.
  - Giả định hiện tại: Đang dùng tên tạm "Văn phòng Thi hành án dân sự Doanh nghiệp tư nhân Hai Bà Trưng" (lấy từ báo giá). Địa chỉ, điện thoại, số giấy đăng ký chưa có.
  - Khách trả lời: 
- [ ] **A3** (P0) Số cuối của từng sổ giấy đang dùng là bao nhiêu (số vi bằng, công văn đi, các sổ S-01, S-02, S-04, S-05)? Năm nay đã dùng đến số mấy?
  - Vì sao hỏi: Hệ thống phải nối tiếp số, không được cấp trùng. Thiếu số cuối thì không cấp số thật.
  - Giả định hiện tại: Admin nhập số cuối một lần, chỉ được tăng. Chưa có số thật.
  - Khách trả lời: 
- [ ] **A4** (P1) Cho phép chuyển dữ liệu từ sổ giấy cũ sang hệ thống không, hay chỉ bắt đầu từ ngày bật phần mềm? Ai nhập và ai kiểm?
  - Vì sao hỏi: Quyết định khối lượng nhập liệu và rủi ro lệch số.
  - Giả định hiện tại: Chỉ nhập số cuối, không nhập hồ sơ cũ.
  - Khách trả lời: 
- [ ] **A5** (P1) Mẫu chính thức là bộ N-01 đến N-11 đính kèm TT 08/2026 đúng không? Văn phòng có dùng bản sửa riêng nào không?
  - Vì sao hỏi: Bản in ghi phiên bản mẫu. Dùng sai mẫu là sai pháp lý.
  - Giả định hiện tại: Lấy bộ docx có dòng "Ban hành kèm theo TT 08/2026/TT-BTP" làm nguồn.
  - Khách trả lời: 
- [ ] **A6** (P1) Xin file Excel gốc của mẫu N-09 và N-10.
  - Vì sao hỏi: Chưa có file gốc nên chưa làm được hai báo cáo này đúng bố cục.
  - Giả định hiện tại: Chỉ xuất báo cáo thường, không gọi là mẫu chính thức.
  - Khách trả lời: 
- [ ] **A7** (P1) Số vi bằng có bắt buộc liền mạch không (kể cả khi hồ sơ bị hủy)? Số đổi năm vào 0h ngày 01/01 giờ Việt Nam đúng không?
  - Vì sao hỏi: Luật chưa nói rõ. Ảnh hưởng cách xử lý số của hồ sơ hủy.
  - Giả định hiện tại: Số một dãy toàn văn phòng, đổi năm theo giờ VN, số đã cấp không dùng lại.
  - Khách trả lời: 
- [ ] **A8** (P1) Ký hiệu trong số có đúng không: vi bằng "VB-THV", công văn đi "CV-THV", số tiếp nhận "TN"? Công văn đến có đánh số riêng không?
  - Vì sao hỏi: Ký hiệu là hằng số chung, chưa chỉnh được theo văn phòng.
  - Giả định hiện tại: Dạng <số>/<năm>/VB-THV, <số>/<năm>/CV-THV, <số>/<năm>/TN.
  - Khách trả lời: 
- [ ] **A9** (P1) Văn phòng ký văn bản bằng chữ ký tay rồi scan hay có dùng chữ ký số?
  - Vì sao hỏi: Quyết định hệ thống chỉ lưu bản scan hay phải tích hợp ký số.
  - Giả định hiện tại: Chữ ký tay và dấu, hệ thống lưu bản scan đã ký.
  - Khách trả lời: 
- [ ] **A10** (P2) Hồ sơ lưu bao lâu, sau đó hủy hay chuyển lưu trữ? Ai được xóa?
  - Vì sao hỏi: Ảnh hưởng chính sách lưu tệp và dung lượng.
  - Giả định hiện tại: Không xóa, hệ thống chỉ ghi thêm.
  - Khách trả lời: 

## B. Tài khoản và phân quyền

Bảng quyền hiện tại do hệ thống tự chọn theo nghiệp vụ.md §4, cần khách xác nhận.

- [ ] **B1** (P0) Mỗi vai làm được gì? Cụ thể: Văn thư có tạo hoặc sửa hồ sơ không; Kế toán xem được gì ngoài bước xác nhận MISA; Thư ký làm được gì trong Tống đạt, Xác minh, THA?
  - Vì sao hỏi: Quyền thật nằm trong cơ sở dữ liệu, sai bảng quyền là lộ hoặc chặn việc.
  - Giả định hiện tại: Giữ hành vi hiện có. Chỗ nghiệp vụ chưa nêu thì từ chối mặc định.
  - Khách trả lời: 
- [ ] **B2** (P0) Với từng loại văn bản dưới đây, ai là người được đứng tên ký: Trưởng văn phòng, Thừa hành viên, hay người khác? (1) quyết định xác minh N-06; (2) văn bản sửa lỗi vi bằng N-11; (3) quyết định thu hồi quyết định THA; (4) công văn đi; (5) quyết định vào sổ quyết định.
  - Vì sao hỏi: "Ký pháp lý" là người có thẩm quyền đứng tên ký để văn bản có giá trị. Trong hệ thống, chỉ người được Admin cấp "quyền ký" mới bấm ghi nhận được bước ký/ban hành. Ký sai người thì văn bản có thể vô hiệu.
  - Giả định hiện tại: (1) N-06: Trưởng VP. (2) N-11: THV đã lập vi bằng; nếu người đó đã rời văn phòng thì Trưởng VP. (3) Thu hồi quyết định THA: Trưởng VP. (4) và (5) Công văn đi, sổ quyết định: người được Admin cấp quyền ký, hiện chỉ Admin hoặc Trưởng VP có thể có quyền này. Admin không đương nhiên được ký chỉ vì quản trị phần mềm.
  - Khách trả lời: 
- [ ] **B3** (P0) Admin hiện làm một số việc lệch với nghiệp vụ.md §4.1. Văn phòng muốn Admin được làm đến đâu?
  - Vì sao hỏi: Admin quản trị nhưng không nên tự ký hay tự duyệt việc của mình.
  - Giả định hiện tại: Giữ nguyên hành vi đang chạy, chưa chỉnh.
  - Khách trả lời: 
- [ ] **B4** (P0) Người dùng đăng nhập thế nào: mọi người đều có email riêng không? Nhân viên không có email thì sao?
  - Vì sao hỏi: Đăng nhập hiện bằng mật khẩu hoặc link gửi qua email. Quên mật khẩu chỉ dùng link email, không có OTP.
  - Giả định hiện tại: Mọi tài khoản có email riêng. Link dùng một lần, hết hạn 15 phút, mã 6 số hết hạn 10 phút.
  - Khách trả lời: 
- [ ] **B5** (P2) Có cần giới hạn đăng nhập theo thiết bị, địa chỉ mạng hoặc giờ làm việc không?
  - Vì sao hỏi: Chưa có, có thể là yêu cầu bảo mật của Sở.
  - Giả định hiện tại: Không giới hạn, chỉ khóa 15 phút sau 5 lần sai.
  - Khách trả lời: 
- [ ] **B6** (P1) Cấp hoặc đổi vai: Admin đề xuất, Trưởng VP duyệt, hai người khác nhau. Văn phòng nhỏ chỉ có một người kiêm cả hai thì làm sao?
  - Vì sao hỏi: Cơ chế hai người có thể làm kẹt khi chỉ có một người.
  - Giả định hiện tại: Bắt buộc hai người khác nhau, đề xuất không tự hết hạn.
  - Khách trả lời: 
- [ ] **B7** (P1) Trưởng VP có được phân công Thừa hành viên (THV) cho hồ sơ vi bằng không, hay chỉ Admin?
  - Vì sao hỏi: Nghiệp vụ chỉ nêu Admin.
  - Giả định hiện tại: Chỉ Admin phân công.
  - Khách trả lời: 
- [ ] **B8** (P2) THV có được xem mọi hồ sơ vi bằng của văn phòng không, và tạo hồ sơ ở mọi chi nhánh không?
  - Vì sao hỏi: Chủ dự án đã chốt "xem mọi hồ sơ", cần khách xác nhận.
  - Giả định hiện tại: THV xem mọi hồ sơ, chỉ ghi khi được giao. THV tạo hồ sơ ở mọi chi nhánh.
  - Khách trả lời: 
- [ ] **B9** (P2) Thư ký trong Hộp duyệt chỉ được xem hay được quyết định?
  - Vì sao hỏi: Chưa rõ trong nghiệp vụ.
  - Giả định hiện tại: Chỉ xem.
  - Khách trả lời: 
- [ ] **B10** (P0) Danh sách nhân sự thật: họ tên, email, vai, chi nhánh được cấp, số Thẻ THV của từng người.
  - Vì sao hỏi: Cần để tạo tài khoản thật và điền cột Thừa hành viên trong các sổ.
  - Giả định hiện tại: Chưa có. Đang có 5 tài khoản thử với dữ liệu giả.
  - Khách trả lời: 

## C. Khách hàng, hợp đồng và đương sự

- [ ] **C1** (P1) Cần lưu thông tin gì của khách? Cá nhân: họ tên, số định danh, địa chỉ, điện thoại. Tổ chức: tên, mã số thuế hoặc đăng ký, người đại diện, địa chỉ. Còn gì nữa?
  - Vì sao hỏi: Vi bằng cần họ tên, địa chỉ, số định danh người yêu cầu và người tham gia (NĐ 151 Điều 30.2).
  - Giả định hiện tại: Danh bạ chủ thể dùng chung bốn nghiệp vụ. Phần tổ chức là suy luận kỹ thuật, chưa phải quy định.
  - Khách trả lời: 
- [ ] **C2** (P1) Phụ lục hợp đồng dịch vụ: có cần loại "chấm dứt sớm hoặc thanh lý" riêng không? Có cần Trưởng VP duyệt trước khi hiệu lực? Ngày hiệu lực có được ở quá khứ không?
  - Vì sao hỏi: Nghiệp vụ.md chưa định nghĩa phụ lục.
  - Giả định hiện tại: Bốn loại: gia hạn, bổ sung phạm vi, đổi bên, khác. Bản scan bắt buộc, không duyệt, được lùi ngày, chỉ ghi thêm, không có số tiền.
  - Khách trả lời: 
- [ ] **C3** (P2) Người tham gia hợp đồng có những vai nào (đại diện, thụ hưởng, làm chứng, khác)? Còn vai nào?
  - Vì sao hỏi: Danh sách vai ảnh hưởng dữ liệu và in ấn.
  - Giả định hiện tại: Bốn vai như trên.
  - Khách trả lời: 
- [ ] **C4** (P0) Hợp đồng dịch vụ có cần lưu số tiền, thời hạn thanh toán không, hay luôn để MISA lo?
  - Vì sao hỏi: Hệ thống tuyệt đối không giữ số tiền để khỏi lệch với kế toán.
  - Giả định hiện tại: Không số tiền, MISA là sổ duy nhất.
  - Khách trả lời: 
- [ ] **C5** (P1) Vai của đương sự trong thi hành án đủ chưa: người được thi hành, người phải thi hành, người liên quan, người đại diện?
  - Vì sao hỏi: Mẫu đương sự do hệ thống tự chọn.
  - Giả định hiện tại: Bốn vai như trên.
  - Khách trả lời: 
- [ ] **C6** (P1) Nghĩa vụ thi hành án có cần ghi giá trị bằng tiền để báo cáo không, hay chỉ mô tả và trạng thái?
  - Vì sao hỏi: Báo cáo và sổ S-05 có thể cần số liệu.
  - Giả định hiện tại: Không số tiền, chỉ trạng thái mở, một phần, hoàn thành.
  - Khách trả lời: 

## D. Vi bằng

- [ ] **D1** (P1) Thông tin lúc tiếp nhận có cần thêm người tham gia, địa điểm, thời gian dự kiến, ghi chú nội bộ không? Bắt buộc hay tùy chọn?
  - Vì sao hỏi: Figma có các trường này nhưng hệ thống chưa có chỗ lưu.
  - Giả định hiện tại: Chưa lưu. Chỉ có tiêu đề, mô tả, ghi chú liên hệ, tên và liên hệ khách.
  - Khách trả lời: 
- [ ] **D2** (P1) Danh sách 8 trường hợp từ chối theo Điều 28 có đủ không? Ai được ghi từ chối? Hồ sơ đã có số vi bằng thì có được từ chối không?
  - Vì sao hỏi: Từ chối sai hoặc thiếu căn cứ là rủi ro pháp lý.
  - Giả định hiện tại: Ghi mã khoản + lý do + người ghi. THV phụ trách hoặc Admin/Trưởng VP ghi. Không từ chối hồ sơ đã có số.
  - Khách trả lời: 
- [ ] **D3** (P1) Quy tắc sửa hồ sơ: 48 giờ đầu sửa tự do, sau đó phải đề nghị và Admin duyệt. Có đúng quy định nội bộ không?
  - Vì sao hỏi: 48 giờ lấy từ nghiệp vụ.md.
  - Giả định hiện tại: Như mô tả.
  - Khách trả lời: 
- [ ] **D4** (P1) Cấp bản sao vi bằng: ai được yêu cầu, cần giấy tờ gì, ghi số bản và người nhận thế nào? Chi phí thu qua MISA đúng không?
  - Vì sao hỏi: Điều 32 và 50.2. Hệ thống không có sổ tiền.
  - Giả định hiện tại: Hai trường hợp: cơ quan có thẩm quyền yêu cầu văn bản, hoặc người yêu cầu/người tham gia.
  - Khách trả lời: 
- [ ] **D5** (P0) Thanh toán: chỉ cho cấp số khi MISA xác nhận thanh toán đủ? Có trường hợp đặt cọc, trả sau, miễn phí không?
  - Vì sao hỏi: Cổng cấp số đang buộc "đã thanh toán đủ".
  - Giả định hiện tại: Chỉ cấp số khi Kế toán ghi CONFIRMED_FULL. Không thanh toán từng phần.
  - Khách trả lời: 
- [ ] **D6** (P2) Ai được thu hồi xác nhận MISA, trong trường hợp nào? Sau khi thu hồi thì số đã cấp xử lý ra sao?
  - Vì sao hỏi: Hiện thu hồi chỉ chặn việc trả, không đổi số đã cấp.
  - Giả định hiện tại: Kế toán đề nghị, Admin quyết, người đề nghị không tự duyệt.
  - Khách trả lời: 
- [ ] **D7** (P1) Việc cập nhật cơ sở dữ liệu của Sở: nhập tay vào hệ thống Sở hay có cổng hoặc API? Hạn 3 ngày làm việc tính từ khi nào? Sự cố sau khi trả hồ sơ ghi thế nào?
  - Vì sao hỏi: Điều 30.5. Có cổng thì mới tích hợp được.
  - Giả định hiện tại: Nhập tay, chỉ nhắc hạn, không chặn việc trả hồ sơ.
  - Khách trả lời: 
- [ ] **D8** (P1) Văn bản sửa lỗi N-11: ai lập, ai ký, sau bao lâu phải cập nhật CSDL?
  - Vì sao hỏi: Điều 31.
  - Giả định hiện tại: THV đã lập vi bằng ký, hạn 2 ngày làm việc kể từ khi lập N-11.
  - Khách trả lời: 
- [ ] **D11** (P0) Hệ thống sinh bản NHÁP (N-03, N-04, N-11 và các mẫu khác) rồi văn phòng in, ký, đóng dấu ngoài đời, sau đó scan và tải lên. Cách làm này đúng ý văn phòng chưa, hay muốn ký ngay trong hệ thống?
  - Vì sao hỏi: Nghiệp vụ.md §16 chỉ yêu cầu phân biệt bản dự thảo, bản đã ký, bản đã đóng dấu, bản scan cuối. Hệ thống không ký số và không coi bản scan là văn bản gốc điện tử.
  - Giả định hiện tại: THV chỉ bấm "xác nhận đã ký", Văn thư bấm "xác nhận đã đóng dấu", rồi tải bản scan PDF cuối. Hệ thống lưu vết, người xác nhận, thời điểm và tệp; không ký thay, không sinh chữ ký.
  - Khách trả lời: 
- [ ] **D12** (P0) N-11 là văn bản sửa lỗi kỹ thuật của một vi bằng đã ký, tách riêng, không phải bản scan vi bằng. Cách lưu N-11 sau khi ký (scan, gắn vào vi bằng gốc, gửi người yêu cầu) có đúng thực tế không?
  - Vì sao hỏi: Nghiệp vụ.md §19 và Điều 31: ghi nội dung trước và sau khi sửa, lý do, người sửa, chữ ký và dấu, ngày gửi, cập nhật CSDL; không được mở lại vi bằng để thay nội dung đã ký.
  - Giả định hiện tại: Hồ sơ sửa lỗi N-11 gắn vào vi bằng gốc, có bản nháp sinh từ hệ thống, bản đã ký tải lên, ngày gửi và hạn 2 ngày làm việc. Vi bằng gốc giữ nguyên.
  - Khách trả lời: 
- [ ] **D13** (P1) Bản gốc giấy của vi bằng cất ở đâu và ai giữ? Bản scan trong hệ thống chỉ để quản lý và tra cứu đúng không?
  - Vì sao hỏi: Nghiệp vụ.md §20 và §61: bản scan không tự có giá trị như bản gốc điện tử.
  - Giả định hiện tại: Bản scan chỉ là bản quản lý. Nơi cất bản gốc giấy chưa được ghi trong hệ thống.
  - Khách trả lời: 
- [ ] **D9** (P2) Bản scan cuối chỉ nhận PDF, tối đa 25 MB. Có cần nhận định dạng khác hoặc file lớn hơn không?
  - Vì sao hỏi: Giới hạn kỹ thuật tự chọn.
  - Giả định hiện tại: PDF ≤ 25 MB.
  - Khách trả lời: 
- [ ] **D10** (P2) Vi bằng lập ở nhiều địa điểm: "nơi lập" lấy theo chi nhánh hay nhập tay theo từng vụ việc?
  - Vì sao hỏi: S-02 cột 5 cần nơi lập.
  - Giả định hiện tại: Nhập tay trong hồ sơ, địa chỉ nơi lập lưu riêng.
  - Khách trả lời: 

## E. Tống đạt

- [ ] **E1** (P1) Báo kết quả tống đạt cho cơ quan yêu cầu: dùng mẫu văn bản nào, gửi bằng cách nào, có đính kèm tệp không?
  - Vì sao hỏi: Điều 25.2 yêu cầu báo trong 2 ngày làm việc.
  - Giả định hiện tại: Chỉ ghi cơ quan, nội dung, người, thời điểm. Chưa đính tệp vì chờ mẫu.
  - Khách trả lời: 
- [ ] **E2** (P1) Hạn 2 ngày làm việc tính từ lần tống đạt cuối cùng hay từ khi tất cả văn bản có kết quả?
  - Vì sao hỏi: Quy định chưa nêu mốc.
  - Giả định hiện tại: Mốc là lần tống đạt cuối của yêu cầu.
  - Khách trả lời: 
- [ ] **E3** (P1) Khi "không gặp người nhận", cần thử mấy lần, cách nhau bao lâu, rồi xử lý ra sao (niêm yết, nhờ UBND)?
  - Vì sao hỏi: Hệ thống không tự đánh dấu thành công khi không gặp người.
  - Giả định hiện tại: Ghi từng lần, kết quả riêng, không tự kết thúc.
  - Khách trả lời: 
- [ ] **E4** (P1) Bằng chứng tống đạt (N-02) gồm những loại nào: ảnh, biên bản, video, ghi âm?
  - Vì sao hỏi: Hiện chỉ nhận PDF, JPEG, PNG.
  - Giả định hiện tại: PDF, JPEG, PNG ≤ 25 MB.
  - Khách trả lời: 
- [ ] **E5** (P1) Mỗi văn bản tống đạt cần cột "tên văn bản" riêng không? Một yêu cầu gồm nhiều văn bản, nhiều người nhận, hạn riêng từng cái có đúng thực tế không?
  - Vì sao hỏi: Cột tên văn bản chưa có trong sổ S-01.
  - Giả định hiện tại: Một yêu cầu nhiều văn bản, mỗi văn bản có người nhận, hạn, người xử lý riêng.
  - Khách trả lời: 

## F. Xác minh điều kiện thi hành án

- [ ] **F1** (P1) Quyết định xác minh N-06 do Trưởng VP ký đúng không? Mỗi hồ sơ chỉ một quyết định?
  - Vì sao hỏi: Điều 35.1.
  - Giả định hiện tại: Một quyết định bất biến, chỉ người có quyền ký ghi được.
  - Khách trả lời: 
- [ ] **F2** (P1) Hạn 3 ngày làm việc tính từ ngày ký hợp đồng đúng không? Ngày ký do ai nhập?
  - Vì sao hỏi: Điều 35.1.
  - Giả định hiện tại: Ngày ký do người xử lý nhập.
  - Khách trả lời: 
- [ ] **F3** (P1) Nguồn xác minh có mức bảo mật nào? Ai được xem từng mức? Có cần ghi nhật ký mỗi lần mở nguồn?
  - Vì sao hỏi: Nguồn có thể chứa thông tin nhạy cảm.
  - Giả định hiện tại: Có mức bảo mật và nhật ký mở nguồn. Hiện "mở nguồn" chỉ ghi nhật ký.
  - Khách trả lời: 
- [ ] **F4** (P1) Ủy quyền thực hiện xác minh: năm điều kiện hiện tại có đúng không và ai duyệt?
  - Vì sao hỏi: Điều kiện do hệ thống dựng theo nghiệp vụ.md §58.
  - Giả định hiện tại: Đồng ý bằng văn bản, rồi Admin hoặc Trưởng VP duyệt, rồi mới thực hiện.
  - Khách trả lời: 
- [ ] **F5** (P1) Kết luận xác minh khi thiếu căn cứ: có cho phép kết luận "chưa đủ điều kiện" không?
  - Vì sao hỏi: Nghiệp vụ nêu thiếu căn cứ thì không kết luận.
  - Giả định hiện tại: Không kết luận khi thiếu căn cứ.
  - Khách trả lời: 

## G. Tổ chức thi hành án

- [ ] **G1** (P0) Chấm dứt vụ việc theo Điều 46: các lý do chấm dứt có những loại nào, ai quyết định, cần giấy tờ gì? Điều 31.5 Luật THADS áp dụng trường hợp nào?
  - Vì sao hỏi: Báo cáo xác nhận phần này chưa đủ.
  - Giả định hiện tại: Chấm dứt do Admin hoặc Trưởng VP, cần lý do mã, căn cứ và tệp chứng cứ. Điều 31.5 người dùng tự ghi.
  - Khách trả lời: 
- [ ] **G2** (P1) Quyết định thu hồi sau khi chấm dứt: ai ký, hạn 2 ngày làm việc tính từ chấm dứt hay từ thanh lý?
  - Vì sao hỏi: Điều 46.1.
  - Giả định hiện tại: Trưởng VP có quyền ký, hạn 2 ngày làm việc.
  - Khách trả lời: 
- [ ] **G3** (P1) Tài sản nhạy cảm là loại nào? Ai được xem nhãn tài sản và với mục đích gì?
  - Vì sao hỏi: Danh sách tài sản có thể lộ thông tin.
  - Giả định hiện tại: Không trả nhãn tài sản nhạy cảm. Muốn xem phải nêu mục đích và có audit.
  - Khách trả lời: 
- [ ] **G4** (P1) Biện pháp bảo đảm theo bốn bước (đề xuất, quyết định cơ quan, áp dụng, kết quả) có đúng thực tế? Văn phòng có được tự quyết biện pháp nào?
  - Vì sao hỏi: Hệ thống phân biệt đề nghị với quyết định của cơ quan có thẩm quyền.
  - Giả định hiện tại: Bốn bước như trên.
  - Khách trả lời: 
- [ ] **G5** (P1) Chuyển hồ sơ THA: các bước thật gồm gì (đề nghị, duyệt nội bộ, văn bản, bàn giao, hoàn tất)? Ai là người nhận bàn giao?
  - Vì sao hỏi: Hệ thống đã dựng ba bước kèm tệp.
  - Giả định hiện tại: Đề nghị, duyệt nội bộ, văn bản, bàn giao thực tế, hoàn tất.
  - Khách trả lời: 
- [ ] **G6** (P1) Hoàn tất hồ sơ cần "bằng chứng hoàn tất" loại văn bản nào?
  - Vì sao hỏi: Chưa chốt loại văn bản.
  - Giả định hiện tại: Một tệp có hash, chỉ Admin hoặc Trưởng VP hoàn tất.
  - Khách trả lời: 
- [ ] **G7** (P1) Hoàn thành một nghĩa vụ có làm xong cả hồ sơ không?
  - Vì sao hỏi: Nhiều nghĩa vụ trong một hồ sơ.
  - Giả định hiện tại: Không. Hồ sơ xong khi mọi nghĩa vụ xong và có bằng chứng hoàn tất.
  - Khách trả lời: 

## H. Văn phòng: công văn, sổ, vật tư, nhân sự, báo cáo

- [ ] **H1** (P1) Số công văn đi hiện có dạng <số>/<năm>/CV-THV. Mẫu số thật của văn phòng ra sao?
  - Vì sao hỏi: Đối chiếu với thực tế để khỏi lệch sổ giấy.
  - Giả định hiện tại: Tự cấp khi ban hành.
  - Khách trả lời: 
- [ ] **H2** (P1) Công văn đi có bắt buộc Trưởng VP duyệt nội bộ trước khi ký ban hành không?
  - Vì sao hỏi: Hiện có bước duyệt nội bộ riêng và ký riêng.
  - Giả định hiện tại: Soạn, trình, duyệt, ký ban hành, ghi phương thức và bằng chứng gửi.
  - Khách trả lời: 
- [ ] **H3** (P2) Danh mục loại văn bản trong sổ quyết định là những loại nào? Có loại nào chỉ dành cho cơ quan nhà nước không được tạo?
  - Vì sao hỏi: Hiện loại văn bản nhập tự do.
  - Giả định hiện tại: Chặn khi trùng mã hoặc tên biểu mẫu TT06 đã đăng ký.
  - Khách trả lời: 
- [ ] **H4** (P0) Đóng quyển sổ theo tháng: lưu trạng thái đã in và đã đóng quyển trong hệ thống, hay chỉ in giấy? Ai đóng dấu giáp lai?
  - Vì sao hỏi: Mở sổ 01/01, khóa 31/12, in hàng tháng.
  - Giả định hiện tại: Chưa có trạng thái đóng quyển. Sổ điện tử chỉ hỗ trợ, chưa phải biểu mẫu chính thức.
  - Khách trả lời: 
- [ ] **H5** (P0) Sổ S-06 (sử dụng lao động): ai nhập hồ sơ lao động, ở đâu? Phần bảo hiểm chỉ ghi tình trạng và ghi chú có đủ không? Cần mẫu in chính thức.
  - Vì sao hỏi: S-06 đọc từ bảng nhân sự, chưa có xuất in.
  - Giả định hiện tại: Chỉ Admin hoặc Trưởng VP đọc. Không lưu số tiền bảo hiểm.
  - Khách trả lời: 
- [ ] **H6** (P1) Vật tư: có cần quản lý hạn dùng, đơn giá không? Kiểm kê theo phiên, Trưởng VP duyệt mới điều chỉnh có phù hợp không? Kiểm kê bao lâu một lần?
  - Vì sao hỏi: FIFO theo lô, chỉ số lượng.
  - Giả định hiện tại: Không hạn dùng, không đơn giá, xuất vượt tồn bị chặn.
  - Khách trả lời: 
- [ ] **H7** (P2) Thư viện biểu mẫu TT06: ai được tải, nguồn bản trắng, có cần Word thay vì PDF không?
  - Vì sao hỏi: Chỉ tải, không tự ban hành.
  - Giả định hiện tại: Admin/Trưởng VP đăng ký, mọi thành viên tải, PDF/JPEG/PNG.
  - Khách trả lời: 
- [ ] **H8** (P1) Báo cáo cần chỉ tiêu nào, tính kỳ theo ngày tạo hay ngày hoàn tất? Có cần so với kỳ trước không?
  - Vì sao hỏi: Mỗi đơn vị đếm riêng, không cộng chéo.
  - Giả định hiện tại: Kỳ theo ngày tạo, số vi bằng theo ngày cấp, chưa có so kỳ trước.
  - Khách trả lời: 
- [ ] **H9** (P0) Ngày làm việc: thứ Bảy có tính không? Danh sách ngày nghỉ, lễ của văn phòng năm 2026 và 2027?
  - Vì sao hỏi: Quyết định hạn pháp định và nhắc hạn.
  - Giả định hiện tại: Thứ Bảy và Chủ nhật không tính (chủ dự án chốt). Admin tự nhập ngày lễ.
  - Khách trả lời: 
- [ ] **H10** (P1) Nhắc hạn: ngoài trong ứng dụng, có gửi email cho nhân viên không? Có dùng Zalo? Có gửi nhắc cho khách không?
  - Vì sao hỏi: Nghiệp vụ.md nói giai đoạn đầu không tự gửi cho khách.
  - Giả định hiện tại: Nhắc trong ứng dụng và email nhân viên 7:30 sáng. Không gửi khách. Zalo làm sau.
  - Khách trả lời: 
- [ ] **H11** (P2) Tìm kiếm toàn cục (Ctrl K) được tìm những gì, người nào thấy kết quả nào?
  - Vì sao hỏi: Tìm có thể lộ hồ sơ ngoài phạm vi.
  - Giả định hiện tại: Theo phạm vi xem của vai.
  - Khách trả lời: 
- [ ] **H12** (P2) Hiện trường: nhân viên đi lập vi bằng, tống đạt cần ghi gì trên điện thoại (ảnh, vị trí, giờ)? Có dùng điện thoại cá nhân không?
  - Vì sao hỏi: Bản mobile mới là co giãn giao diện.
  - Giả định hiện tại: Dùng chung việc được giao, chưa có nhật ký hiện trường riêng.
  - Khách trả lời: 

## I. Hạ tầng và vận hành

Cần khách hoặc chủ dự án quyết.

- [ ] **I1** (P0) Gửi email bằng dịch vụ nào (Gmail, Zoho, tên miền riêng)? Địa chỉ gửi là gì? Ai giữ mật khẩu SMTP?
  - Vì sao hỏi: Chưa cấu hình SMTP thì không gửi được link đăng nhập và nhắc hạn.
  - Giả định hiện tại: Chưa có. Admin nhập trong Quản trị, mật khẩu mã hóa.
  - Khách trả lời: 
- [ ] **I2** (P0) Tệp lưu ở đâu: cloud (Cloudflare R2) hay máy chủ đặt tại trụ sở? Có quét mã độc không? Dung lượng dự kiến?
  - Vì sao hỏi: Liên quan Điều 50 và an toàn hồ sơ.
  - Giả định hiện tại: Bản chạy thử dùng ổ đĩa 6 GB. R2 là hướng đã chọn, chưa bật thật.
  - Khách trả lời: 
- [ ] **I3** (P1) Địa chỉ web chính thức: www.nexagnet.com hay tên miền riêng của văn phòng?
  - Vì sao hỏi: Tên miền gốc chưa có https.
  - Giả định hiện tại: www.nexagnet.com.
  - Khách trả lời: 
- [ ] **I4** (P1) Sao lưu và khôi phục: ai chịu trách nhiệm, chu kỳ, lưu mấy bản? Ai là đầu mối kỹ thuật?
  - Vì sao hỏi: Khách chưa có IT nội bộ.
  - Giả định hiện tại: Chưa có quy trình sao lưu riêng.
  - Khách trả lời: 
- [ ] **I5** (P2) MISA: chỉ ghi xác nhận thủ công đúng không, hay muốn tích hợp sau?
  - Vì sao hỏi: Hệ thống không gọi MISA.
  - Giả định hiện tại: Thủ công.
  - Khách trả lời: 
- [ ] **I6** (P0) Khi nào chuyển từ dữ liệu giả sang dữ liệu thật? Ai chạy kiểm thử chấp nhận (UAT) và ký xác nhận?
  - Vì sao hỏi: Chấp nhận của khách là trạng thái riêng, chưa có.
  - Giả định hiện tại: Chưa có người chấp nhận.
  - Khách trả lời: 
- [ ] **I7** (P2) Khách muốn đào tạo người dùng hình thức nào và cần tài liệu hướng dẫn nào?
  - Vì sao hỏi: Đã có hướng dẫn PDF cho bản thử.
  - Giả định hiện tại: Chưa có lịch đào tạo.
  - Khách trả lời: 
