import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
// Trưởng văn phòng, Thư ký, Kế toán trong DMS: chỉ xem màn và mở hộp thoại, KHÔNG lưu gì. Chạy với APPEND=1.
const b = await browser();
const go = async (page, p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(900); };
const link = (page, name, o = {}) => page.getByRole('link', { name, ...o }).first();

// ---------- Trưởng văn phòng ----------
{
  const { page } = await asRole(b, 'TRUONG_VP');
  const g = new Guide('truong-van-phong', 'Hướng dẫn dành cho Trưởng văn phòng');
  g.section('DMS · Trưởng văn phòng: những màn bạn dùng', 'Trưởng văn phòng theo dõi nghiệp vụ và xem báo cáo trong phạm vi quyền của nhóm quyền được cấp. Việc phân quyền do Admin làm trực tiếp, không còn bước đề xuất và duyệt.', [
    '"Duyệt" trong phần mềm là xác nhận nội bộ, không phải chữ ký pháp lý. Văn bản pháp lý vẫn do người có thẩm quyền ký và đóng dấu ngoài đời.',
    'Quyền của bạn nằm ở nhóm quyền Admin xếp bạn vào; muốn thêm hoặc bớt quyền, nhờ Admin (mọi thay đổi có ghi nhật ký).',
  ], [
    ['Danh sách hồ sơ trống', 'Hồ sơ hiện theo chi nhánh bạn được cấp. Nhờ Admin kiểm tra phạm vi chi nhánh của tài khoản.'],
    ['Không thấy nút tạo hồ sơ', 'Đúng thiết kế: Trưởng văn phòng theo dõi và duyệt, việc tạo hồ sơ do Thừa hành viên, Thư ký làm.'],
  ]);
  await go(page, '/');
  await g.shot(page, { title: 'Tổng quan của Trưởng văn phòng', note: 'Thanh bên hiện các mục theo nhóm quyền của bạn, ví dụ Báo cáo tổng hợp. Các thẻ số liệu cho biết tình hình toàn văn phòng trong năm.',
    marks: [
      { loc: link(page, /Báo cáo tổng hợp/), text: 'Báo cáo tổng hợp N-09, N-10' },
      { loc: link(page, /Hồ sơ do tôi tạo/), text: 'Hồ sơ do tôi tạo', optional: true },
      { loc: link(page, /Trình \/ Duyệt/), text: 'Trình / Duyệt', optional: true },
    ] });
  await go(page, '/dms/bao-cao');
  await g.shot(page, { title: 'Báo cáo tổng hợp N-09, N-10', note: 'Chuyển giữa hai mẫu bằng thẻ phía trên. Nút Sao chép ở từng chỉ tiêu giúp chép con số sang văn bản báo cáo.',
    marks: [{ loc: page.getByRole('button', { name: /N-10/ }).or(link(page, /N-10/)).first(), text: 'Chuyển sang mẫu N-10' }, { loc: page.getByRole('button', { name: /Sao chép/ }).first(), text: 'Sao chép số liệu', optional: true }] });
  g.save();
}

// ---------- Thư ký ----------
{
  const { page } = await asRole(b, 'THU_KY');
  const g = new Guide('thu-ky', 'Hướng dẫn dành cho Thư ký');
  g.section('DMS · Thư ký: tạo hồ sơ và hỗ trợ nghiệp vụ', 'Thư ký tạo bản nháp hồ sơ cho bốn nghiệp vụ, thêm tài liệu và tải bản scan, hỗ trợ Thừa hành viên. Cách tạo và lưu chính thức giống phần Vi bằng của Thừa hành viên.', [
    'Hồ sơ mới là bản nháp: chưa có số hồ sơ, chưa vào sổ cho tới khi xác nhận lưu chính thức.',
    'Sau khi lưu chính thức không sửa trực tiếp, không xóa. Chỉ Admin sửa (có lý do); bạn chỉ tải thêm scan.',
  ], [
    ['Không thấy nút "+ Tạo hồ sơ" ở một nghiệp vụ', 'Tài khoản chưa được cấp quyền tạo hồ sơ nghiệp vụ đó. Nhờ Admin kiểm tra phân quyền.'],
  ]);
  await go(page, '/dms/vi-bang');
  await g.shot(page, { title: 'Danh sách hồ sơ của Thư ký', note: 'Bạn có nút "+ Tạo hồ sơ" ở các nghiệp vụ được cấp quyền. Cách điền biểu mẫu xem phần Vi bằng trong hướng dẫn Thừa hành viên.',
    marks: [{ loc: page.getByRole('link', { name: '+ Tạo hồ sơ' }).first(), text: 'Tạo hồ sơ mới (bản nháp)' }, { loc: link(page, /^Nháp/), text: 'Bản nháp của bạn nằm ở tab Nháp' }] });
  await go(page, '/');
  await g.shot(page, { title: 'Tổng quan của Thư ký', note: 'Thanh bên của Thư ký gồm Chờ tôi xác nhận, Trình / Duyệt, các nghiệp vụ, Văn thư, Xuất sổ và Báo cáo tổng hợp.',
    marks: [{ loc: link(page, /Chờ tôi xác nhận/), text: 'Hồ sơ nháp đang chờ xác nhận' }, { loc: link(page, /Báo cáo tổng hợp/), text: 'Báo cáo tổng hợp' }, { loc: link(page, /Xuất sổ nghiệp vụ/), text: 'Xuất sổ nghiệp vụ' }] });
  g.save();
}

// ---------- Kế toán ----------
{
  const { page } = await asRole(b, 'KE_TOAN');
  const g = new Guide('ke-toan', 'Hướng dẫn dành cho Kế toán');
  g.section('DMS · Kế toán: Tổng quan và Vật tư văn phòng', 'Trong phần hồ sơ DMS, Kế toán chỉ có Tổng quan và Vật tư văn phòng. Phần mềm KHÔNG làm kế toán: MISA là sổ kế toán duy nhất, phần mềm không lưu số tiền.', [
    'Không nhập số tiền, công nợ hay bút toán vào phần mềm.',
    'Xuất kho vượt số tồn bị chặn. Điều chỉnh sau kiểm kê cần Trưởng văn phòng duyệt.',
  ], [
    ['Không thấy mục hồ sơ nghiệp vụ', 'Đúng thiết kế: Kế toán không thao tác hồ sơ nghiệp vụ trong DMS.'],
  ]);
  await go(page, '/');
  await g.shot(page, { title: 'Tổng quan của Kế toán', note: 'Thanh bên chỉ có hai mục: Tổng quan và Vật tư văn phòng.',
    marks: [{ loc: link(page, /Vật tư văn phòng/), text: 'Vật tư văn phòng' }] });
  await go(page, '/vat-tu');
  await g.shot(page, { title: 'Vật tư: tồn kho, nhập và xuất', note: 'Thẻ Tồn kho cho thấy số lượng hiện có. "Nhập / xuất" để ghi nhập hoặc xuất kho; "Đặt ngưỡng" để hệ thống báo Sắp hết.',
    marks: [
      { loc: page.getByRole('button', { name: 'Nhập / xuất' }).or(link(page, 'Nhập / xuất')).first(), text: 'Ghi nhập hoặc xuất kho', optional: true },
      { loc: page.getByPlaceholder(/Tìm theo tên vật tư/), text: 'Tìm theo tên vật tư' },
      { loc: page.getByRole('button', { name: 'Đặt ngưỡng' }).first(), text: 'Đặt ngưỡng cảnh báo sắp hết', optional: true },
    ] });
  g.save();
}
await b.close(); console.log('done');
