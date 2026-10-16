// Sinh tự động từ Phụ lục III, Thông tư 08/2026/TT-BTP bởi
// scripts/forms/extract-pl3-templates.py. Sửa văn bản mẫu: chạy lại script, không sửa tay.
import { blank, c, cell, cols, itemsTable, j, type FormTemplate } from '../form-template';

export const N01_TEMPLATE: FormTemplate = {
  code: 'N-01',
  ref: 'TP-THV-N-01',
  title: 'Hợp đồng dịch vụ tống đạt',
  blocks: [
    c('**CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**'),
    c('**Độc lập - Tự do - Hạnh phúc**'),
    c('_______________________'),
    blank(),
    c('**HỢP ĐỒNG DỊCH VỤ**'),
    c('**Về việc tống đạt giấy tờ, hồ sơ, tài liệu**'),
    c('Số: {{contractSeq=......}}/{{contractYear=(năm)}}/HĐDV-TĐ'),
    blank(),
    j('Căn cứ Bộ luật Dân sự số ...............................................................;'),
    j(
      'Căn cứ .............................................(1) .....................................................................;',
    ),
    j(
      'Căn cứ Nghị định số 151/2026/NĐ-CP ngày 13/5/2026 của Chính phủ quy định về tổ chức và hoạt động của văn phòng thi hành án dân sự, Thừa hành viên;',
    ),
    j(
      'Căn cứ Thông tư số 08/2026/TT-BTP ngày 16/5/2026 của Bộ trưởng Bộ Tư pháp hướng dẫn thi hành Nghị định số 151/2026/NĐ-CP ngày 13/5/2026 của Chính phủ quy định về tổ chức và hoạt động của văn phòng thi hành án dân sự, Thừa hành viên;',
    ),
    j('Căn cứ nhu cầu, khả năng của các bên,'),
    j(
      'Hôm nay, ngày {{signDate.d=.....}} tháng {{signDate.m=....}} năm {{signDate.y=.......}}, tại: {{signPlace=...................................................................}}',
    ),
    j('Chúng tôi gồm:'),
    j(
      '**1. Văn phòng thi hành án dân sự** {{office.name=.................................................}}:',
    ),
    j(
      'Địa chỉ: {{office.address=...........................................................................................................................}}',
    ),
    j(
      'Đại diện: ông (bà) {{office.representative=..................................}}, chức vụ: Trưởng văn phòng',
    ),
    j(
      'Giấy chứng nhận đăng ký doanh nghiệp số {{office.businessRegNo=..............}} do Cơ quan đăng ký kinh doanh cấp ngày {{office.businessRegDate.d=......}} tháng {{office.businessRegDate.m=......}} năm {{office.businessRegDate.y=........}}',
    ),
    j(
      'Số tài khoản: {{office.bankAccount=.....................................}} mở tại ngân hàng: {{office.bankName=...............................................}}',
    ),
    j(
      'Mã số thuế: {{office.taxCode=.....................................................................................................................}}',
    ),
    j('%%(Dưới đây gọi là Bên A)%%'),
    j('**2. Bên yêu cầu thực hiện tống đạt:**'),
    j(
      'Tòa án nhân dân {{requester.courtName=...................}}/Viện kiểm sát nhân dân {{requester.procuracyName=.................}}/Cơ quan thi hành án dân sự {{requester.agencyName=...........................................}}',
    ),
    j('Trụ sở: {{requester.address=………………………………………………………………………………………}}'),
    j(
      'Đại diện: ông (bà) {{requester.representative=......}}, chức vụ: {{requester.representativeTitle=......}}',
    ),
    j('Số tài khoản: {{requester.bankAccount=......}} tại Kho bạc Nhà nước'),
    j('Mã số thuế: {{requester.taxCode=......}}'),
    j('%%(Dưới đây gọi là Bên B)%%'),
    j(
      'Hai bên thỏa thuận ký kết Hợp đồng dịch vụ để thực hiện việc tống đạt giấy tờ, hồ sơ, tài liệu với các điều khoản như sau:',
    ),
    j('**Điều 1. Nội dung công việc tống đạt**'),
    j(
      '1. Các giấy tờ, hồ sơ, tài liệu Bên B giao cho Bên A thực hiện việc tống đạt được liệt kê tại Phụ lục (Bảng kê giấy tờ, hồ sơ, tài liệu tống đạt) của Hợp đồng này.',
    ),
    j(
      '2. Bên A có trách nhiệm thực hiện việc tống đạt các giấy tờ, hồ sơ, tài liệu đến đúng người được nhận giấy tờ, hồ sơ, tài liệu và theo thời hạn quy định tại Điều 2 của Hợp đồng này.',
    ),
    j('**Điều 2. Thời hạn thực hiện việc tống đạt**'),
    j(
      'Thời hạn thực hiện việc tống đạt đối với từng giấy tờ, hồ sơ, tài liệu tuân thủ theo thời hạn được quy định tại Phụ lục (Bảng kê giấy tờ, hồ sơ, tài liệu tống đạt) của Hợp đồng này và pháp luật có liên quan.',
    ),
    j('**Điều 3. Thủ tục thực hiện việc tống đạt**'),
    j(
      '1. Khi tống đạt các giấy tờ, hồ sơ, tài liệu của cơ quan thi hành án dân sự, Bên A phải tuân thủ thời hạn, thủ tục theo quy định của pháp luật tố tụng, pháp luật thi hành án dân sự và Hợp đồng này để thực hiện việc tống đạt.',
    ),
    j(
      '2. Khi tống đạt các giấy tờ, hồ sơ, tài liệu của Tòa án/Viện kiểm sát nhân dân, Bên A phải tuân thủ thời hạn, thủ tục theo quy định của pháp luật tố tụng và Hợp đồng này để thực hiện việc tống đạt.',
    ),
    j(
      '3. Trong trường hợp không thể thực hiện việc tống đạt trực tiếp giấy tờ, hồ sơ, tài liệu cho người được nhận giấy tờ, hồ sơ, tài liệu, Bên A có trách nhiệm thực hiện việc niêm yết công khai giấy tờ, hồ sơ, tài liệu cần tống đạt theo quy định của pháp luật có liên quan.',
    ),
    j('4. Các thỏa thuận khác (nếu có)(2)'),
    j('**Điều 4. Chi phí tống đạt**'),
    j(
      '1. Chi phí tống đạt đối với từng loại giấy tờ, hồ sơ, tài liệu liệt kê tại Phụ lục (Bảng kê giấy tờ, hồ sơ, tài liệu tống đạt) của Hợp đồng này.',
    ),
    j(
      '2. Ngoài mức chi phí tống đạt nêu tại khoản 1 Điều này, Bên A có quyền đề nghị Bên B thanh toán thêm các khoản chi phí khác (nếu có) như sau:(3)',
    ),
    j('a) ……………………………………………………………………………………...…………..;'),
    j('b) ……………………………………………………………………………………...…………...'),
    j(
      '3. Việc thanh toán chi phí tống đạt được thực hiện hàng tháng và thực hiện theo quy định tại Điều 53 của Nghị định số 151/2026/NĐ-CP ngày 13 tháng 5 năm 2026 của Chính phủ về tổ chức và hoạt động của văn phòng thi hành án dân sự, Thừa hành viên.',
    ),
    j('**Điều 5. Thời hạn và phương thức thanh toán chi phí tống đạt**'),
    j(
      '1. Trong thời hạn {{payment.days=.........}} ngày, kể từ ngày {{payment.from=.........................}}, Bên B có trách nhiệm thanh toán đầy đủ cho Bên A.',
    ),
    j('2. Việc thanh toán giữa Hai bên được thực hiện dưới hình thức chuyển khoản.'),
    j('**Điều 6. Quyền, nghĩa vụ của các bên**'),
    j(
      '1. Quyền và nghĩa vụ của Bên A: ......................................................................................',
    ),
    j(
      '2. Quyền và nghĩa vụ của Bên B: ......................................................................................',
    ),
    j('(quy định cụ thể quyền và nghĩa vụ của các bên)'),
    j('**Điều 7. Tạm dừng hoặc chấm dứt hợp đồng**'),
    j('1. Tạm dừng thực hiện Hợp đồng này trong các trường hợp sau:'),
    j(
      '.......................................................................... (4)...............................................................',
    ),
    j('2. Hợp đồng này bị chấm dứt trong các trường hợp sau:'),
    j(
      'a) Bên A có quyền đơn phương chấm dứt Hợp đồng do Bên B vi phạm nghĩa vụ thanh toán nêu tại Điều 5 hoặc vi phạm nghiêm trọng các nghĩa vụ khác theo Hợp đồng này;',
    ),
    j(
      'b) Bên B có quyền đơn phương chấm dứt Hợp đồng trong các trường hợp Bên A vi phạm nghĩa vụ nêu tại các Điều 2 và 3 của Hợp đồng này hoặc vi phạm nghiêm trọng các nghĩa vụ khác theo Hợp đồng này;',
    ),
    j('c) Hết thời hạn ghi trong Hợp đồng này mà các bên không gia hạn Hợp đồng;'),
    j('d) Theo thỏa thuận của các bên.'),
    j('**Điều 8. Xử lý hậu quả của việc chấm dứt hợp đồng**'),
    j(
      'Việc xử lý hậu quả phát sinh từ việc chấm dứt Hợp đồng này được thực hiện như sau: ..........................................................................(5)....................................................................',
    ),
    j('**Điều 9. Điều khoản chung**'),
    j('1. Bên A cam kết:'),
    j('………………………………………………………………………………………...…………..'),
    j('2. Bên B cam kết:'),
    j('………………………………………………………………………………………...…………..'),
    j('3. Tranh chấp hợp đồng và xử lý tranh chấp:'),
    j('………………………………………………………………………………………...…………..'),
    j('4. Tình trạng khẩn cấp, trở ngại khách quan, sự kiện bất khả kháng:'),
    j('………………………………………………………………………………………...…………..'),
    j('5. Phạt vi phạm hợp đồng và bồi thường thiệt hại do vi phạm hợp đồng:'),
    j('………………………………………………………………………………………...…………..'),
    j('6. (Các thỏa thuận khác nếu có)'),
    j('**Điều 10. Hiệu lực của hợp đồng**'),
    j(
      '1. Hợp đồng này có hiệu lực kể từ ngày {{effectiveDate.d=......}} tháng {{effectiveDate.m=.......}} năm {{effectiveDate.y=.........}}',
    ),
    j(
      '2. Hợp đồng này được lập thành 03 bản, có giá trị như nhau, mỗi bên giữ 01 bản, gửi Kho bạc nhà nước ....... 01 bản để kiểm soát việc thanh toán chi phí tống đạt.',
    ),
    j('3. Hợp đồng này đã được các bên đọc, hiểu rõ và nhất trí ký tên dưới đây.'),
    blank(),
    cols(
      cell(['**BÊN A**', '%%(Ký, ghi rõ họ tên, đóng dấu)%%'], 'center'),
      cell(['**BÊN B**', '%%(Ký, ghi rõ họ tên, đóng dấu)%%'], 'center'),
    ),
    blank(),
    j('**%%Ghi chú:%%**'),
    j('(1) Bổ sung căn cứ pháp lý khác cho phù hợp;'),
    j('(2) Bổ sung các thỏa thuận khác nếu cần thiết;'),
    j('(3) Ghi rõ các khoản chi phí khác (nếu có);'),
    j('(4) Quy định cụ thể các trường hợp tạm dừng thực hiện hợp đồng;'),
    j('(5) Quy định cụ thể về cách thức xử lý các hậu quả phát sinh.'),
    c('**Phụ lục**'),
    c('**BẢNG KÊ GIẤY TỜ, HỒ SƠ, TÀI LIỆU TỐNG ĐẠT**'),
    c(
      '%%(Kèm theo Hợp đồng dịch vụ tống đạt số: {{contractSeq=.....}}/{{contractYear=(năm)}}/HĐDV-TĐ ngày {{signDate.d=...}} tháng {{signDate.m=...}} năm {{signDate.y=....}})%%',
    ),
    blank(),
    itemsTable(),
    blank(),
    cols(
      cell(['', '**CƠ QUAN GIAO VĂN BẢN**', '%%(Ký, ghi rõ họ tên, đóng dấu)%%'], 'center'),
      cell(
        [
          '%%Ngày {{signDate.d=...}} tháng {{signDate.m=...}} năm {{signDate.y=.....}}%%',
          '**VĂN PHÒNG THI HÀNH ÁN DÂN SỰ {{office.name=...........}}**',
          '%%(Ký, ghi rõ họ tên, đóng dấu)%%',
        ],
        'center',
      ),
    ),
  ],
};
