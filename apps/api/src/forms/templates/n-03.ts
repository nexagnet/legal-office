// Sinh tự động từ Phụ lục III, Thông tư 08/2026/TT-BTP bởi
// scripts/forms/extract-pl3-templates.py. Sửa văn bản mẫu: chạy lại script, không sửa tay.
import { blank, c, cell, cols, j, lines, type FormTemplate } from '../form-template';

export const N03_TEMPLATE: FormTemplate = {
  code: 'N-03',
  ref: 'TP-THV-N-03',
  title: 'Hợp đồng dịch vụ lập vi bằng',
  blocks: [
    c('**CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**'),
    c('**Độc lập – Tự do – Hạnh phúc**'),
    c('_______________________'),
    blank(),
    c('**HỢP ĐỒNG DỊCH VỤ**'),
    c('**Về việc lập vi bằng**'),
    c('Số: {{contractSeq=.............}}/{{contractYear=(năm)}}/HĐDV-VB'),
    blank(),
    j('Căn cứ Bộ luật Dân sự số .......................................................;'),
    j(
      'Căn cứ ....................................................(1)...............................................................;',
    ),
    j(
      'Căn cứ Nghị định số 151/2026/NĐ-CP ngày 13/5/2026 của Chính phủ quy định về tổ chức và hoạt động của văn phòng thi hành án dân sự, Thừa hành viên;',
    ),
    j(
      'Căn cứ Thông tư số 08/2026/TT-BTP ngày 16/5/2026 của Bộ trưởng Bộ Tư pháp hướng dẫn thi hành Nghị định số 151/2026/NĐ-CP ngày 13/5/2026 của Chính phủ quy định về tổ chức và hoạt động của văn phòng thi hành án dân sự, Thừa hành viên;',
    ),
    j('Căn cứ nhu cầu, khả năng của các bên,'),
    j(
      'Hôm nay, ngày {{signDate.d=......}} tháng {{signDate.m=.........}} năm {{signDate.y=.............}}, tại: {{signPlace=.........................................................}}',
    ),
    j('Chúng tôi gồm:'),
    j('**1. Văn phòng thi hành án dân sự**: {{office.name=}}'),
    j('Địa chỉ: {{office.address=………………………………………………………………………………………........}}'),
    j(
      'Giấy chứng nhận đăng ký doanh nghiệp số {{office.businessRegNo=.....................}} do Cơ quan đăng ký kinh doanh cấp ngày {{office.businessRegDate.d=........}} tháng {{office.businessRegDate.m=.........}} năm {{office.businessRegDate.y=...........}}',
    ),
    j(
      'Số tài khoản: {{office.bankAccount=...........................................}} mở tại ngân hàng: {{office.bankName=...........................................}}',
    ),
    j('Mã số thuế: {{office.taxCode=……………………………………………………………………………………....}}'),
    j(
      'Đại diện: Ông (bà) {{office.representative=....................................}}, chức vụ: Trưởng văn phòng',
    ),
    j('%%(Dưới đây gọi là Bên A)%%'),
    j('2. Bên yêu cầu lập vi bằng:'),
    j('Cơ quan/tổ chức: {{requester.organization.name=………………………………………………………………………………...}}'),
    j(
      'Địa chỉ: {{requester.organization.address=………………………………………………………………………………...................}}',
    ),
    j(
      'Đại diện: Ông (bà) {{requester.organization.representative=..................................}}, chức vụ: {{requester.organization.representativeTitle=...........................................................}}',
    ),
    j(
      'Số tài khoản: {{requester.organization.bankAccount=..........................................}} tại {{requester.organization.bankName=.....................................................................}}',
    ),
    j('Mã số thuế: {{requester.organization.taxCode=………………………………………………………………………………............}}'),
    j('(hoặc)'),
    j('Ông (bà): {{requester.person.fullName=………………………………………………………………………………................}}'),
    j('Địa chỉ: {{requester.person.address=………………………………………………………………………………...................}}'),
    j(
      'Số Thẻ Căn cước công dân/Số Thẻ Căn cước/Số định danh cá nhân: {{requester.person.idNumber=.............................}}',
    ),
    j(
      'Ngày, tháng, năm cấp: {{requester.person.idIssueDate.d=.........}}/{{requester.person.idIssueDate.m=........}}/{{requester.person.idIssueDate.y=.............}} Nơi cấp: {{requester.person.idIssuePlace=........................................................}}',
    ),
    j('%%(đối với Thẻ Căn cước công dân/Thẻ Căn cước)%%'),
    j('%%(Dưới đây gọi là Bên B)%%'),
    j(
      'Hai bên thỏa thuận ký kết Hợp đồng này để thực hiện việc lập vi bằng với các điều khoản như sau:',
    ),
    j('**Điều 1. Nội dung và thời hạn lập vi bằng**'),
    j('1. Bên A có trách nhiệm lập vi bằng đối với sự kiện, hành vi sau đây:'),
    lines('subjectMatter', [
      '………………………………………………………………………………………...…………..',
      '………………………………………………………………………………………...…………..',
    ]),
    j('2. Vi bằng phải được Bên A lập theo đúng quy định của pháp luật và Hợp đồng này.'),
    j(
      '3. Việc lập vi bằng được Bên A thực hiện trong thời hạn {{deadlineDays=...........}} ngày kể từ ngày {{deadlineFrom.d=...}}/{{deadlineFrom.m=...}}/{{deadlineFrom.y=...}}',
    ),
    j('**Điều 2. Chi phí lập vi bằng**'),
    j(
      '1. Mức chi phí lập vi bằng đối với các sự kiện, hành vi nêu tại Điều 1 của Hợp đồng này là: {{fee.amount=………………………………………………………………………………………...…}}',
    ),
    j(
      '2. Ngoài mức chi phí nêu tại khoản 1 Điều này, Bên A có quyền đề nghị Bên B thanh toán thêm các khoản chi phí khác (nếu có) như sau:',
    ),
    j('a) ………………………………………………………………………………………...…………..'),
    j('b) ………………………………………………………………………………………...…………..'),
    j(
      '3. Tổng chi phí lập vi bằng mà Bên B phải thanh toán cho Bên A là: {{fee.total=...............................}}',
    ),
    j('Bằng chữ: {{fee.totalWords=………………………………………………………………………….....................}}'),
    j('**Điều 3. Thời hạn và phương thức thanh toán**'),
    j(
      '1. Trong thời hạn {{payment.days=........}} ngày kể từ ngày {{payment.from.d=...}}/{{payment.from.m=...}}/{{payment.from.y=...}}, Bên B có trách nhiệm thanh toán đầy đủ số tiền nêu tại khoản 3 Điều 2 của Hợp đồng này cho Bên A.',
    ),
    j('2. Việc thanh toán giữa Hai bên được thực hiện thông qua hình thức:'),
    j(
      '- Thanh toán trực tiếp: ....................................................................................................;',
    ),
    j(
      '- Chuyển khoản: .............................................................................................................;',
    ),
    j('**Điều 4. Quyền, nghĩa vụ của các bên**'),
    j(
      '1. Quyền và nghĩa vụ của Bên A: ...................................................................................',
    ),
    j(
      '2. Quyền và nghĩa vụ của Bên B: ...................................................................................',
    ),
    j('(quy định cụ thể quyền và nghĩa vụ của các bên)'),
    j('**Điều 5. Tạm dừng hoặc chấm dứt hợp đồng**'),
    j('1. Tạm dừng thực hiện Hợp đồng này trong các trường hợp sau:'),
    j(
      '.................................................................(2)...................................................................',
    ),
    j('2. Hợp đồng này bị chấm dứt trong các trường hợp sau:'),
    j(
      'a) Bên A có quyền đơn phương chấm dứt Hợp đồng này do Bên B vi phạm nghĩa vụ thanh toán nêu tại Điều 3 hoặc vi phạm nghiêm trọng các nghĩa vụ khác theo Hợp đồng này;',
    ),
    j(
      'b) Bên B có quyền đơn phương chấm dứt Hợp đồng này trong các trường hợp Bên A vi phạm nghĩa vụ nêu tại Điều 1 hoặc vi phạm nghiêm trọng các nghĩa vụ khác theo Hợp đồng này;',
    ),
    j('c) Theo thỏa thuận của các bên.'),
    j('**Điều 6. Xử lý hậu quả của việc chấm dứt hợp đồng**'),
    j(
      'Việc xử lý hậu quả phát sinh từ việc chấm dứt Hợp đồng này được thực hiện như sau: ..........................................................(3).................................................................',
    ),
    j('**Điều 7. Điều khoản chung**'),
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
    j('6. (Các thỏa thuận khác nếu có)(4)'),
    j('**Điều 8. Hiệu lực của hợp đồng**'),
    j(
      '1. Hợp đồng này có hiệu lực kể từ ngày {{effectiveDate.d=.......}} tháng {{effectiveDate.m=......}} năm {{effectiveDate.y=........}}',
    ),
    j('2. Hợp đồng này được lập thành 02 bản, có giá trị như nhau, mỗi bên giữ 01 bản.'),
    j('3. Hợp đồng này đã được các bên đọc, hiểu rõ và nhất trí ký tên dưới đây.'),
    blank(),
    cols(
      cell(['**BÊN A**', '%%(Ký, ghi rõ họ tên, đóng dấu)%%'], 'center'),
      cell(
        [
          '**BÊN B**',
          '%%(Ký, ghi rõ họ tên, đóng dấu nếu là cơ quan, tổ%%',
          '%%chức/Ký, ghi rõ họ tên hoặc điểm chỉ nếu là cá nhân)%%',
        ],
        'center',
      ),
    ),
    blank(),
    j('**%%Ghi chú:%%**'),
    j('(1) Bổ sung căn cứ pháp lý khác cho phù hợp;'),
    j('(2) Quy định cụ thể các trường hợp tạm dừng thực hiện hợp đồng;'),
    j('(3) Quy định cụ thể về cách thức xử lý các hậu quả phát sinh;'),
    j('(4) Bổ sung các thỏa thuận khác nếu cần thiết.'),
  ],
};
