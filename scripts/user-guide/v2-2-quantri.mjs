import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
// Hướng dẫn bản mới (v2), phần 2: duyệt, tra cứu, sổ, báo cáo và quản trị. Chụp bằng vai Admin.
const b = await browser();
const g = new Guide('quan-tri', 'Duyệt, tra cứu và quản trị');
const A = await asRole(b, 'ADMIN'); const page = A.page;
const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(800); };
const tall = (h) => page.setViewportSize({ width: 1440, height: h });
const norm = () => page.setViewportSize({ width: 1440, height: 900 });
const btn = (n, o = {}) => page.getByRole('button', { name: n, ...o }).or(page.getByRole('link', { name: n, ...o })).first();

g.section('Trình / Duyệt', 'Nhân viên gửi bản trình (giấy tờ cần người có thẩm quyền xem), Admin hoặc người được giao duyệt hoặc từ chối. "Duyệt" trong phần mềm chỉ là xác nhận nội bộ, không phải chữ ký pháp lý.', [
  'Người gửi không tự duyệt bản trình của mình.', 'Bản trình đã duyệt hoặc từ chối được giữ lại, không xóa.'], [['Không thấy nút Duyệt', 'Bản trình do chính bạn gửi, hoặc bạn chưa được cấp quyền duyệt. Nhờ người khác duyệt hoặc nhờ Admin cấp quyền.']]);
await go('/dms/trinh-duyet');
await g.shot(page, { title: 'Danh sách bản trình', note: 'Lọc theo Chờ duyệt, Đã duyệt, Từ chối. Bấm tiêu đề một bản trình để xem chi tiết và quyết định.', marks: [
  { loc: btn('Chờ duyệt', { exact: true }), text: 'Lọc các bản trình đang chờ duyệt' },
  { loc: btn('+ Trình mới'), text: 'Gửi bản trình mới' },
  { loc: page.getByRole('link', { name: 'Giấy xác nhận địa chỉ nhận văn bản' }).first(), text: 'Bấm tiêu đề để mở bản trình' }] });
await page.getByRole('link', { name: 'Giấy xác nhận địa chỉ nhận văn bản' }).first().click(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200); await tall(1100);
await g.shot(page, { title: 'Xem bản trình và quyết định', note: 'Xem nội dung, tệp đính kèm rồi bấm Duyệt hoặc Từ chối. Từ chối cần nêu lý do.', marks: [
  { loc: page.getByRole('button', { name: /^Duyệt/ }).first(), text: 'Duyệt bản trình', optional: true },
  { loc: page.getByRole('button', { name: /^Từ chối/ }).first(), text: 'Từ chối (nêu lý do)', optional: true }] });
await norm();

g.section('Sổ và báo cáo', 'Xuất sổ nghiệp vụ theo mẫu và xem số liệu báo cáo trong phạm vi quyền của bạn.', [
  'Báo cáo N-09, N-10 chỉ là số tham khảo để tự điền mẫu; hệ thống không lập hay gửi báo cáo.'], []);
await go('/dms/van-phong');
await g.shot(page, { title: 'Mọi hồ sơ của văn phòng', note: 'Admin và người có quyền xem toàn văn phòng thấy hồ sơ của cả bốn nghiệp vụ. Bấm mã hồ sơ để mở.', marks: [
  { loc: btn('Cột hiển thị'), text: 'Chọn cột cần xem' },
  { loc: page.getByRole('link', { name: '010/2026/VB-THV' }).first(), text: 'Bấm mã hồ sơ để mở chi tiết' }] });
await go('/dms/so');
await g.shot(page, { title: 'Xuất sổ nghiệp vụ', note: 'Mỗi nghiệp vụ có một sổ (S-01, S-02, S-04, S-05). Bấm Xem trước và xuất để xem sổ rồi tải về.', marks: [
  { loc: page.getByRole('link', { name: /Xem trước và xuất S-02/ }).or(page.getByRole('button', { name: /Xem trước và xuất S-02/ })).first(), text: 'Xem trước và xuất sổ S-02' }] });
await go('/dms/bao-cao');
await g.shot(page, { title: 'Báo cáo tổng hợp', note: 'Chọn năm, xem số liệu mẫu N-09 và N-10 để tự điền báo cáo; bấm Sao chép để lấy từng số.', marks: [
  { loc: btn(/^N-10/), text: 'Chuyển sang mẫu N-10' },
  { loc: btn('Sao chép'), text: 'Sao chép số liệu' }] });

g.section('Sửa hồ sơ đã ghi sổ (Admin)', 'Chỉ Admin sửa được nội dung hồ sơ đã ghi sổ. Mỗi lần sửa phải nêu lý do và được lưu thành phiên bản mới; bản gốc vẫn xem được ở tab Phiên bản cũ.', ['Không xóa hồ sơ đã ghi sổ.', 'Mọi thay đổi ghi người làm, thời điểm, lý do trong Lịch sử hoạt động.'], []);
await go('/dms/vi-bang');
await page.getByRole('link', { name: 'Xem', exact: true }).first().click(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200);
await g.shot(page, { title: 'Nút Sửa hồ sơ (Admin)', note: 'Mở hồ sơ đã ghi sổ, bấm Sửa hồ sơ (Admin).', marks: [
  { loc: page.getByRole('button', { name: /Sửa hồ sơ \(Admin\)/ }), text: 'Sửa hồ sơ (Admin)' },
  { loc: page.getByRole('link', { name: /^Phiên bản cũ/ }).first(), text: 'Tab Phiên bản cũ: bản gốc và các bản sửa' }] });
await page.getByRole('button', { name: /Sửa hồ sơ \(Admin\)/ }).click(); await page.waitForTimeout(800);
await g.shot(page, { title: 'Hộp thoại sửa hồ sơ', note: 'Sửa ô cần đổi, nhập lý do rồi lưu. Hệ thống ghi thành phiên bản mới.', marks: [
  { loc: page.getByRole('dialog').first(), text: 'Sửa nội dung và nhập lý do sửa', optional: true }] });
await page.keyboard.press('Escape');

g.section('Lịch sử hoạt động', 'Ghi lại ai làm gì, lúc nào trên hồ sơ, tài liệu, tệp, bản trình và phân quyền. Không sửa hay xóa được.', [], []);
await go('/dms/lich-su');
await g.shot(page, { title: 'Lịch sử hoạt động', note: 'Lọc theo loại hoạt động hoặc tìm theo từ khóa; mới nhất ở trên, giờ Việt Nam.', marks: [
  { loc: btn('Phân quyền', { exact: true }), text: 'Lọc: hoạt động về phân quyền' },
  { loc: page.getByRole('button', { name: 'Tìm', exact: true }), text: 'Tìm hoạt động theo từ khóa' }] });
await go('/dms/scan-da-xoa');
await g.shot(page, { title: 'Scan đã xóa', note: 'Tệp scan bị xóa được giữ 30 ngày ở đây rồi bị xóa hẳn; không khôi phục được.', marks: [{ loc: page.getByRole('heading', { name: /Scan đã xóa/ }), text: 'Danh sách scan đang chờ xóa hẳn' }] });

g.section('Quản trị: tài khoản, quyền, chi nhánh, cài đặt', 'Admin tạo tài khoản, gán nhóm quyền, quản lý địa điểm (chi nhánh) và cấu hình văn phòng. Quyền chỉ đến từ nhóm quyền.', [
  'Tài khoản mới dùng mật khẩu ban đầu do Admin đặt (tối thiểu 12 ký tự) và phải đổi ở lần đăng nhập đầu.',
  'Mỗi người nên thuộc đúng nhóm quyền của vai mình và chỉ được cấp chi nhánh cần dùng.'], [['Người dùng đăng nhập được nhưng không thấy hồ sơ', 'Kiểm tra họ đã được cấp chi nhánh chưa (mục Chi nhánh hoặc Xem quyền hiệu lực).']]);
await go('/quan-tri/nhan-su');
await g.shot(page, { title: 'Tài khoản', note: 'Danh sách thành viên, trạng thái và nhóm quyền. Bấm + Thêm thành viên để tạo tài khoản mới.', marks: [
  { loc: btn('+ Thêm thành viên'), text: 'Thêm thành viên mới' },
  { loc: page.getByRole('link', { name: /Xem quyền hiệu lực/ }).first(), text: 'Xem quyền hiệu lực của người này' },
  { loc: page.getByRole('link', { name: 'Nhóm quyền', exact: true }).first(), text: 'Chuyển sang mục Nhóm quyền' }] });
await go('/quan-tri/nhan-su/them'); await tall(2300);
await g.shot(page, { title: 'Thêm thành viên', note: 'Điền thông tin cơ bản, kéo xuống chọn nhóm quyền và chi nhánh, rồi bấm Tạo tài khoản và áp dụng quyền ở cuối trang.', marks: [
  { loc: page.getByLabel(/Họ và tên/), text: 'Họ và tên' },
  { loc: page.getByLabel(/Email đăng nhập/), text: 'Email đăng nhập' },
  { loc: page.getByLabel(/Mật khẩu ban đầu/), text: 'Mật khẩu ban đầu (tối thiểu 12 ký tự)' },
  { loc: page.getByLabel(/Số CCCD/), text: 'Số CCCD (không bắt buộc)' }] });
await norm();
await go('/quan-tri/phan-quyen');
await g.shot(page, { title: 'Nhóm quyền: người dùng và quyền hiệu lực', note: 'Xem mỗi người thuộc nhóm nào, phạm vi chi nhánh nào. Bấm Gán nhóm quyền để đổi.', marks: [
  { loc: btn('Gán nhóm quyền'), text: 'Gán nhóm quyền cho người dùng' },
  { loc: btn('Nhóm quyền', { exact: true }).last(), text: 'Mục Nhóm quyền: xem và sửa từng nhóm', optional: true },
  { loc: btn('Nhật ký phân quyền'), text: 'Nhật ký mọi thay đổi quyền' }] });
await go('/quan-tri/chi-nhanh');
await g.shot(page, { title: 'Chi nhánh (địa điểm hoạt động)', note: 'Mỗi địa điểm có danh sách người được cấp. Hồ sơ chỉ hiện với người được cấp chi nhánh đó.', marks: [
  { loc: btn('+ Thêm địa điểm'), text: 'Thêm địa điểm mới' },
  { loc: btn('Xem người được cấp ›'), text: 'Xem người được cấp chi nhánh này' }] });
await go('/quan-tri/cai-dat');
await g.shot(page, { title: 'Cài đặt văn phòng', note: 'Thông tin pháp lý, quy tắc đánh số hồ sơ, email gửi thư và lịch làm việc.', marks: [
  { loc: btn('Email gửi thư'), text: 'Cấu hình email gửi thư (đặt lại mật khẩu)' },
  { loc: page.getByLabel('Đơn vị pháp lý'), text: 'Thông tin pháp lý của văn phòng' }] });
g.save(); await b.close(); console.log('done', g.n);
