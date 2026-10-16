// Sinh tự động từ Phụ lục III, Thông tư 08/2026/TT-BTP bởi
// scripts/forms/extract-pl3-templates.py. Sửa văn bản mẫu: chạy lại script, không sửa tay.
import { blank, c, cell, cols, j, lines, numbered, type FormTemplate } from '../form-template';

export const N04_TEMPLATE: FormTemplate = {
  code: 'N-04',
  ref: 'TP-THV-N-04',
  title: 'Vi bằng',
  blocks: [
    cols(
      cell(
        [
          '**VĂN PHÒNG THI HÀNH ÁN DÂN SỰ**',
          '{{office.name=...........................}}',
          '_____________',
          '',
          'Số: {{vibangSeq=.....}}/{{vibangYear=(năm)}}/VB-THV',
        ],
        'center',
      ),
      cell(
        [
          '**CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**',
          '**Độc lập - Tự do - Hạnh phúc**',
          '_______________________',
        ],
        'center',
      ),
    ),
    c('**VI BẰNG**'),
    j(
      'Vào hồi {{startHour=...........}} giờ {{startMinute=........}} ngày {{startDate.d=...........}} tháng {{startDate.m=.........}} năm {{startDate.y=............}}, tại {{place=................................}}',
    ),
    j('{{placeDetail=………………………………………………………………………………………...…………..}}'),
    j('Chúng tôi gồm: (1)'),
    j(
      'Ông (bà): {{thv.name=...............................................}}, chức vụ: Thừa hành viên',
    ),
    j(
      'Số Thẻ Thừa hành viên {{thv.cardNo=..........................................}} ngày cấp {{thv.cardIssueDate.d=............}}/{{thv.cardIssueDate.m=.............}}/{{thv.cardIssueDate.y=...............}}',
    ),
    j('2. Người yêu cầu lập vi bằng:'),
    j(
      'Ông (bà)/cơ quan/tổ chức: {{requester.name=................................................................................................}}',
    ),
    j(
      'Địa chỉ: {{requester.address=...............................................................................................................................}}',
    ),
    j(
      'Số Thẻ Căn cước công dân/Số Thẻ Căn cước/Số định danh cá nhân: {{requester.idNumber=............................}}',
    ),
    j(
      'Ngày, tháng, năm cấp: {{requester.idIssueDate.d=..........}}/{{requester.idIssueDate.m=.........}}/{{requester.idIssueDate.y=..........}} Nơi cấp: {{requester.idIssuePlace=........................................................}}',
    ),
    j('%%(đối với Thẻ Căn cước công dân/Thẻ Căn cước)%%'),
    j('3. Người tham gia lập vi bằng (nếu có):'),
    j(
      'Ông (bà)/cơ quan/tổ chức: {{participant.name=..................................................................................................}}',
    ),
    j(
      'Địa chỉ: {{participant.address=................................................................................................................................}}',
    ),
    j(
      'Số Thẻ Căn cước công dân/Số Thẻ Căn cước/Số định danh cá nhân: {{participant.idNumber=............................}}',
    ),
    j(
      'Ngày, tháng, năm cấp: {{participant.idIssueDate.d=..........}}/{{participant.idIssueDate.m=.........}}/{{participant.idIssueDate.y=..........}} Nơi cấp: {{participant.idIssuePlace=.........................................................}}',
    ),
    j('%%(đối với Thẻ Căn cước công dân/Thẻ Căn cước)%%'),
    j(
      'Tiến hành lập vi bằng ghi nhận sự kiện, hành vi sau đây: (nêu tên sự kiện, hành vi lập vi bằng)',
    ),
    lines('eventTitle', [
      '………………………………………………………………………………………...…………..',
      '………………………………………………………………………………………...…………..',
    ]),
    j(
      'Nội dung của sự kiện, hành vi lập vi bằng: (mô tả trung thực, khách quan nội dung sự kiện, hành vi xảy ra)',
    ),
    lines('eventContent', [
      '………………………………………………………………………………………...…………..',
      '………………………………………………………………………………………...…………..',
    ]),
    j(
      'Sự kiện, hành vi lập vi bằng kết thúc vào lúc {{eventEnd.hour=...}} giờ {{eventEnd.minute=...}} phút, ngày {{eventEnd.date.d=...}} tháng {{eventEnd.date.m=...}} năm {{eventEnd.date.y=...}}',
    ),
    j(
      'Thừa hành viên cam kết ghi nhận trung thực, khách quan sự kiện, hành vi nêu trên trong vi bằng này.',
    ),
    j('Kèm theo vi bằng này là các tài liệu, giấy tờ sau (nếu có):'),
    numbered('attachments', [
      '1)………………………………………………………………………………………...…………..',
      '2)………………………………………………………………………………………...…………..',
    ]),
    j('………………………………………………………………………………………...………….....'),
    j(
      'Thừa hành viên đã giải thích rõ cho người yêu cầu lập vi bằng và những người tham gia (nếu có) về giá trị pháp lý của vi bằng này. Vi bằng này không thay thế văn bản công chứng, chứng thực, văn bản hành chính khác.',
    ),
    j(
      'Vi bằng này được lập thành {{copies=....}} bản, có giá trị như nhau; lập xong vào lúc {{doneHour=.......}} giờ {{doneMinute=........}} phút, ngày {{doneDate.d=...}} tháng {{doneDate.m=...}} năm {{doneDate.y=....}}, đã đọc lại cho mọi người nghe và nhất trí, cùng ký tên.',
    ),
    blank(),
    cols(
      cell(['**NGƯỜI YÊU CẦU LẬP VI**', '**BẰNG**', '%%(Ký, ghi rõ họ tên)%%'], 'center'),
      cell(['**THỪA HÀNH VIÊN**', '%%(Ký, ghi rõ họ tên, đóng dấu)%%'], 'center'),
    ),
    blank(),
    cols(
      cell(['**NGƯỜI THAM GIA**', '%%(nếu có)%%', '%%(Ký, ghi rõ họ tên)%%'], 'center'),
      cell(['**THƯ KÝ NGHIỆP VỤ**', '%%(nếu có)%%', '%%(Ký, ghi rõ họ tên)%%'], 'center'),
    ),
    blank(),
    j('**%%Ghi chú:%%**'),
    j(
      '(1) Tùy từng trường hợp cụ thể, Thừa hành viên có thể bổ sung thành phần tham gia vào vi bằng, bổ sung nội dung ghi nhận phù hợp với thực tế và quy định của pháp luật.',
    ),
  ],
};
