// Sinh tự động từ Phụ lục III, Thông tư 08/2026/TT-BTP bởi
// scripts/forms/extract-pl3-templates.py. Sửa văn bản mẫu: chạy lại script, không sửa tay.
import {
  blank,
  c,
  cell,
  cols,
  correctionsTable,
  j,
  l,
  lines,
  type FormTemplate,
} from '../form-template';

export const N11_TEMPLATE: FormTemplate = {
  code: 'N-11',
  ref: 'TP-THV-N-11',
  title: 'Văn bản sửa lỗi kỹ thuật vi bằng',
  blocks: [
    cols(
      cell(
        [
          '**VĂN PHÒNG THI HÀNH ÁN DÂN SỰ**',
          '{{office.name=............................}}',
          '____________',
        ],
        'center',
      ),
      cell(
        [
          '**CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM**',
          '**Độc lập - Tự do - Hạnh phúc**',
          '_______________________',
          '%%{{signPlace=.....(1).......}}, ngày {{signDate.d=....}} tháng {{signDate.m=....}} năm {{signDate.y=......}}%%',
        ],
        'center',
      ),
    ),
    blank(),
    c('**VĂN BẢN SỬA LỖI KỸ THUẬT VI BẰNG**'),
    blank(),
    j(
      'Căn cứ Nghị định số 151/2026/NĐ-CP ngày 13/5/2026 của Chính phủ quy định về tổ chức và hoạt động của văn phòng thi hành án dân sự, Thừa hành viên;',
    ),
    j(
      'Căn cứ vi bằng số: ........../........... lập ngày {{vibang.date.d=.........}} tháng {{vibang.date.m=.......}} năm {{vibang.date.y=.........}};',
    ),
    j(
      'Nay, văn phòng thi hành án dân sự (2) {{office.name=.................................................}} thực hiện việc sửa lỗi kỹ thuật đối với vi bằng nêu trên, cụ thể như sau:',
    ),
    j('**1. Thông tin về vi bằng cần sửa lỗi kỹ thuật:**'),
    j(
      'Số vi bằng: {{vibang.number=..........................................................................................................................}}',
    ),
    j(
      'Ngày, tháng, năm lập vi bằng: {{vibang.date=............................................................................................}}',
    ),
    j(
      'Thừa hành viên lập vi bằng: {{thv.name=......................................................}} số Thẻ: {{thv.cardNo=.................................}}',
    ),
    j(
      'Người yêu cầu lập vi bằng: {{requester.name=..................................................................................................}}',
    ),
    j(
      '**2. Nội dung sửa lỗi kỹ thuật:** %%(việc sửa lỗi kỹ thuật dưới đây không làm ảnh hưởng đến tính xác thực của sự kiện, hành vi được lập vi bằng)%%',
    ),
    correctionsTable(),
    j(
      '**3. Lý do sửa lỗi kỹ thuật:** %%(Ghi rõ lỗi do sai sót trong khi ghi chép, đánh máy, in ấn)%%',
    ),
    lines('reason', [
      '………………………………………………………………………………………...…………..',
      '………………………………………………………………………………………...…………..',
    ]),
    j(
      'Văn bản này được lập thành {{copies=.......}} bản chính có giá trị pháp lý như nhau, là một bộ phận không thể tách rời của vi bằng số: ......../....... ngày {{vibang.date.d=.....}} tháng {{vibang.date.m=.....}} năm {{vibang.date.y=.......}}, mỗi bên giữ bản, lưu hồ sơ bản.',
    ),
    blank(),
    cols(
      cell([], 'center'),
      cell(
        [
          '**{{signerTitle=THỪA HÀNH VIÊN/TRƯỞNG VĂN PHÒNG}} (3)**',
          '%%(Ký, đóng dấu của văn phòng thi hành án dân sự và ghi rõ họ tên)%%',
        ],
        'center',
      ),
    ),
    blank(),
    l(
      '**%%<In ở mặt sau>%%**(4) Văn bản này đã được giao trực tiếp cho người yêu cầu lập vi bằng 01 bản vào ngày {{handedDate.d=.....}} tháng {{handedDate.m=.....}} năm {{handedDate.y=…..}}',
    ),
    blank(),
    cols(
      cell([], 'center'),
      cell(['**NGƯỜI YÊU CẦU LẬP VI BẰNG**', '%%(Ký, ghi rõ họ tên)%%'], 'center'),
    ),
    blank(),
    j('**%%Ghi chú:%%**'),
    j('(1) Địa danh nơi lập văn bản sửa lỗi (Ví dụ: %%Hà Nội, ngày... tháng... năm...).%%'),
    j('(2) Ghi tên văn phòng thi hành án dân sự nơi lập vi bằng.'),
    j('(3) Về thẩm quyền ký:'),
    j(
      '- Trường hợp Thừa hành viên đã lập vi bằng trực tiếp ký, ghi rõ chức danh “Thừa hành viên” và đóng dấu của văn phòng thi hành án dân sự.',
    ),
    j(
      '- Trường hợp Thừa hành viên đã lập vi bằng không còn hành nghề tại văn phòng thi hành án dân sự đó, Trưởng văn phòng thi hành án dân sự trực tiếp ký, ghi rõ chức danh “Trưởng văn phòng” và đóng dấu của văn phòng thi hành án dân sự.',
    ),
    j(
      '(4) Áp dụng đối với trường hợp văn bản sửa lỗi kỹ thuật vi bằng được giao trực tiếp cho người yêu cầu lập vi bằng.',
    ),
  ],
};
