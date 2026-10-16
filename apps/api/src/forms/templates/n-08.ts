// Sinh tự động từ Phụ lục III, Thông tư 08/2026/TT-BTP bởi
// scripts/forms/extract-pl3-templates.py. Sửa văn bản mẫu: chạy lại script, không sửa tay.
import { blank, c, cell, cols, j, lines, type FormTemplate } from '../form-template';

export const N08_TEMPLATE: FormTemplate = {
  code: 'N-08',
  ref: 'TP-THV-N-08',
  title: 'Biên bản giao nhận hồ sơ, tài liệu',
  blocks: [
    cols(
      cell(
        [
          '**VĂN PHÒNG THI HÀNH ÁN DÂN SỰ**',
          '{{office.name=................................}}',
          '______________',
        ],
        'center',
      ),
      cell(
        [
          '**CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**',
          '**Độc lập - Tự do - Hạnh phúc**',
          '_______________________',
          '',
          '%%{{signPlace=....(1).....}}, ngày {{signDate.d=.....}} tháng {{signDate.m=.....}} năm {{signDate.y=....}}%%',
        ],
        'center',
      ),
    ),
    blank(),
    c('**BIÊN BẢN GIAO, NHẬN HỒ SƠ, TÀI LIỆU**'),
    blank(),
    j(
      'Vào hồi {{startHour=..........}} giờ {{startMinute=..........}} ngày {{startDate.d=.........}} tháng {{startDate.m=.........}} năm {{startDate.y=...........}}, tại {{place=...........(2)...............}}',
    ),
    j('Chúng tôi gồm:'),
    j('**I. BÊN GIAO HỒ SƠ:**'),
    j(
      'Ông (bà): {{giver.name=................................................}}, chức vụ: {{giver.title=Thừa hành viên/Trưởng văn phòng}}',
    ),
    j(
      'Thuộc văn phòng thi hành án dân sự: {{giver.office=............................................................................}}',
    ),
    j('**II. BÊN NHẬN HỒ SƠ** (3):'),
    j(
      'Ông (bà): {{receiver.name=..................................................}}, chức vụ: {{receiver.title=........................................................}}',
    ),
    j(
      'Thuộc cơ quan/tổ chức: {{receiver.organization=...................................................................................................}}',
    ),
    j('**III. ĐẠI DIỆN CỦA SỞ TƯ PHÁP** (4):'),
    j(
      'Ông (bà): {{justiceDept.name=..................................................}}, chức vụ: {{justiceDept.title=..........................................................}}',
    ),
    j(
      'Thuộc Sở Tư pháp tỉnh/thành phố: {{justiceDept.province=......................................................................................}}',
    ),
    j(
      '**IV. NỘI DUNG BÀN GIAO:** Bên giao hồ sơ tiến hành bàn giao cho Bên nhận hồ sơ các hồ sơ, tài liệu và công việc liên quan đến tổ chức và hoạt động của văn phòng thi hành án dân sự với các nội dung chi tiết như sau:',
    ),
    j('1. Thông tin, số lượng và tình trạng hồ sơ:'),
    j(
      'Tổng số lượng hồ sơ bàn giao: {{fileCount=............}} hồ sơ (chi tiết theo Phụ lục đính kèm, nếu có).',
    ),
    j(
      'Tình trạng hồ sơ: {{fileCondition=....................................................................................................................}}',
    ),
    j('2. Tài liệu, chứng từ kèm theo:'),
    j(
      'Tài liệu: {{documents=.....................................................................................................................................}}',
    ),
    j(
      'Chứng từ kế toán, biên lai: {{accountingVouchers=.......................................................................................................}}',
    ),
    j(
      'Khác: {{otherDocuments=........................................................................................................................................}}',
    ),
    j('3. Dữ liệu điện tử:'),
    j(
      'Thiết bị lưu trữ (USB, ổ cứng, đĩa CD...): {{storageDevices=.................................................................................}}',
    ),
    j(
      'Dữ liệu trên hệ thống phần mềm quản lý: {{systemData=.................................................................................}}',
    ),
    j('4. Các hồ sơ, tài liệu khác (nếu có):'),
    lines('otherFiles', [
      '………………………………………………………………………………………...…………..',
      '………………………………………………………………………………………...…………..',
    ]),
    j('**V. Ý KIẾN CỦA CÁC BÊN (NẾU CÓ):**'),
    lines('opinions', [
      '………………………………………………………………………………………...…………..',
      '………………………………………………………………………………………...…………..',
    ]),
    j(
      'Ông (bà): {{receiver.name=............................................}} cam đoan đã kiểm tra và nhận đầy đủ các giấy tờ, hồ sơ, tài liệu nêu trên.',
    ),
    j(
      'Biên bản lập xong hồi {{endHour=.........}} giờ {{endMinute=...........}} cùng ngày, đã đọc lại cho mọi người nghe, nhất trí, ký tên. Bên giao hồ sơ giữ {{copies.giver=.........}} bản, Bên nhận hồ sơ giữ {{copies.receiver=............}} bản, (Sở Tư pháp giữ {{copies.justiceDept=.....}} bản) và lưu hồ sơ {{copies.file=.......}} bản.',
    ),
    blank(),
    cols(
      cell(['**ĐẠI DIỆN BÊN GIAO**', '%%(Ký, ghi rõ họ tên)%%'], 'center'),
      cell(['**ĐẠI DIỆN BÊN NHẬN**', '%%(Ký, ghi rõ họ tên)%%'], 'center'),
    ),
    blank(),
    cols(
      cell(['**NGƯỜI GHI BIÊN BẢN**', '%%(Ký, ghi rõ họ tên)%%'], 'center'),
      cell(['**ĐẠI DIỆN...**', '%%(Ký, ghi rõ họ tên)%%'], 'center'),
    ),
    blank(),
    j('**%%Ghi chú:%%**'),
    j('(1) Ghi địa danh nơi lập biên bản (Ví dụ: %%Hà Nội, ngày... tháng... năm...)%%.'),
    j(
      '(2) Ghi rõ địa điểm tiến hành bàn giao (Ví dụ: %%Trụ sở văn phòng thi hành án dân sự A, số nhà, đường, phường).%%',
    ),
    j(
      '(3) Đại diện văn phòng thi hành án dân sự được Sở Tư pháp chỉ định hoặc cơ quan thi hành án dân sự hoặc Sở Tư pháp trong trường hợp không có văn phòng thi hành án dân sự được chỉ định.',
    ),
    j(
      '(4) Đại diện Sở Tư pháp trong trường hợp giao, nhận hồ sơ giữa 02 văn phòng thi hành án dân sự. %%Lưu ý đối với trường hợp bàn giao số lượng lớn:%% Nếu bàn giao cùng lúc nhiều hồ sơ thi hành án, phần nội dung bàn giao từ Mục 1 đến Mục 4 có thể được lập thành “Phụ lục danh mục hồ sơ bàn giao” đính kèm theo Biên bản này. Trong Biên bản chỉ cần ghi nhận tổng quát số lượng và dẫn chiếu đến Phụ lục.',
    ),
  ],
};
