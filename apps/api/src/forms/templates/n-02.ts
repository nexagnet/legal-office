// Sinh tự động từ Phụ lục III, Thông tư 08/2026/TT-BTP bởi
// scripts/forms/extract-pl3-templates.py. Sửa văn bản mẫu: chạy lại script, không sửa tay.
import { blank, c, cell, cols, j, numbered, type FormTemplate } from '../form-template';

export const N02_TEMPLATE: FormTemplate = {
  code: 'N-02',
  ref: 'TP-THV-N-02',
  title: 'Biên bản thực hiện việc tống đạt',
  blocks: [
    cols(
      cell(
        ['**VĂN PHÒNG THI HÀNH ÁN DÂN SỰ**', '{{office.name=................}}', '_____________'],
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
    blank(),
    c('**BIÊN BẢN THỰC HIỆN VIỆC TỐNG ĐẠT**'),
    blank(),
    j(
      'Vào hồi {{startHour=........}} giờ {{startMinute=.........}} ngày {{startDate.d=.........}} tháng {{startDate.m=.........}} năm {{startDate.y=........}}, tại {{place=..........................................}}',
    ),
    j('{{placeDetail=………………………………………………………………………………………...…………..}}'),
    j('Chúng tôi gồm:'),
    j('Ông (bà): {{thv.name=.............................}}, chức vụ: Thừa hành viên'),
    j(
      'Ông (bà): {{recorder.name=.............................}}, chức vụ: {{recorder.title=.................................................................................}}',
    ),
    j('Với sự tham gia của: ……………………………………………………………..………………..'),
    j('Ông (bà): ………………………………………………………………....................……………..'),
    j('Địa chỉ: …………………………………………………………………........................…………..'),
    j('Lập biên bản tống đạt giấy tờ, hồ sơ, tài liệu sau:'),
    numbered('documents', [
      '1)………………………………………………………………………………………...…………..',
      '2)………………………………………………………………………………………...…………..',
    ]),
    j('cho ông (bà): {{recipient.name=……………………………………………………………………………...............}}'),
    j('Địa chỉ: {{recipient.address=……………………………………………………………………………........................}}'),
    j(
      'Ông (bà): {{recipient.name=.......................................}} cam đoan đã kiểm tra và nhận đầy đủ các giấy tờ, hồ sơ, tài liệu nêu trên.',
    ),
    j(
      'Biên bản lập xong hồi {{endHour=............}} giờ {{endMinute=.................}} cùng ngày, đã đọc lại cho mọi người nghe, nhất trí, ký tên.',
    ),
    blank(),
    cols(
      cell(['**THỪA HÀNH VIÊN**', '%%(Ký, ghi rõ họ tên)%%'], 'center'),
      cell(['**NGƯỜI GHI BIÊN BẢN**', '%%(Ký, ghi rõ họ tên)%%'], 'center'),
    ),
    blank(),
    cols(
      cell(['**ĐẠI DIỆN...**', '%%(Ký, ghi rõ họ tên)%%'], 'center'),
      cell(['**NGƯỜI NHẬN**', '%%(Ký, ghi rõ họ tên)%%'], 'center'),
    ),
  ],
};
