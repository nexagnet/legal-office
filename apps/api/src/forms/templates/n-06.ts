// Sinh tự động từ Phụ lục III, Thông tư 08/2026/TT-BTP bởi
// scripts/forms/extract-pl3-templates.py. Sửa văn bản mẫu: chạy lại script, không sửa tay.
import { blank, c, cell, cols, j, lines, type FormTemplate } from '../form-template';

export const N06_TEMPLATE: FormTemplate = {
  code: 'N-06',
  ref: 'TP-THV-N-06',
  title: 'Quyết định xác minh điều kiện thi hành án',
  blocks: [
    cols(
      cell(
        [
          '**VĂN PHÒNG THI HÀNH ÁN DÂN SỰ**',
          '{{office.name=........................}}',
          '___________',
          'Số: {{decisionSeq=.......}}/QĐ-VPTHADS',
        ],
        'center',
      ),
      cell(
        [
          '**CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**',
          '**Độc lập - Tự do - Hạnh phúc**',
          '_______________________',
          '%%{{signPlace=.............}}, ngày {{signDate.d=.....}} tháng {{signDate.m=......}} năm {{signDate.y=....}}%%',
        ],
        'center',
      ),
    ),
    c('**QUYẾT ĐỊNH**'),
    c('**Về việc xác minh điều kiện thi hành án**'),
    c('_______________'),
    c('**TRƯỞNG VĂN PHÒNG THI HÀNH ÁN DÂN SỰ**'),
    blank(),
    j('%%Căn cứ Luật Thi hành án dân sự số 106/2025/QH15;%%'),
    j(
      '%%Căn cứ Nghị định số 151/2026/NĐ-CP ngày 13/5/2026 của Chính phủ quy định về tổ chức và hoạt động của văn phòng thi hành án dân sự, Thừa hành viên;%%',
    ),
    j(
      '%%Căn cứ Nghị định số 152/2026/NĐ-CP ngày 13/5/2026 của Chính phủ quy định chi tiết một số điều và biện pháp thi hành Luật Thi hành án dân sự;%%',
    ),
    j(
      '%%Căn cứ Bản án (Quyết định) số {{judgment.no=............}} ngày {{judgment.date.d=......}} tháng {{judgment.date.m=........}} năm {{judgment.date.y=.......}} của Tòa án nhân dân {{judgment.court=.............................}};%%',
    ),
    j(
      '%%Căn cứ Quyết định thi hành án số {{enforcementDecision.no=.........}} ngày {{enforcementDecision.date.d=........}} tháng {{enforcementDecision.date.m=........}} năm {{enforcementDecision.date.y=..........}} của Trưởng (văn phòng) thi hành án dân sự {{enforcementDecision.office=............................}};%%',
    ),
    j(
      '%%Căn cứ Hợp đồng dịch vụ xác minh điều kiện thi hành án số {{contract.no=............}} ngày {{contract.date.d=........}} tháng {{contract.date.m=.........}} năm {{contract.date.y=........}} được ký với {{contract.signedWith=.............................}}, địa chỉ: {{contract.signedWithAddress=................................}}%%',
    ),
    blank(),
    c('**QUYẾT ĐỊNH:**'),
    blank(),
    j(
      '**Điều 1.** Xác minh điều kiện thi hành án của: {{subject.name=.....................................................................}}, địa chỉ: {{subject.address=………………………………………………………………………………………...…………..}}',
    ),
    j('Hình thức xác minh: (văn bản yêu cầu cung cấp thông tin hoặc trực tiếp xác minh)'),
    lines('verificationMethod', [
      '………………………………………………………………………………………...…………..',
      '………………………………………………………………………………………...…………..',
    ]),
    j(
      '**Điều 2.** Thừa hành viên {{assignedThv.name=.......................}} được phân công tổ chức thi hành án có trách nhiệm tổ chức thi hành Quyết định này.',
    ),
    j('**Điều 3. Quyết định này có hiệu lực kể từ ngày ký.**'),
    j(
      '**Điều 4.** Người phải thi hành án; người được thi hành án; người có quyền lợi, nghĩa vụ liên quan; cá nhân, tổ chức khác có liên quan có trách nhiệm thi hành Quyết định này./.',
    ),
    cols(
      cell(
        [
          '**%%Nơi nhận:%%**',
          '- Như Điều 2, 4;',
          '- VKSND...................;',
          '- THADS..............;',
          '- Lưu: VT, HS.',
        ],
        'left',
      ),
      cell(['**TRƯỞNG VĂN PHÒNG**', '%%(Ký, ghi rõ họ tên, đóng dấu)%%'], 'center'),
    ),
  ],
};
