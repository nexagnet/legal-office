import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
// Văn thư: sổ Văn bản đến / đi / nội bộ trong DMS. Chạy với APPEND=1. Mỗi lần tạo một bản nháp giả "[guide] ...".
const b = await browser();
const { page } = await asRole(b, 'VAN_THU');
const g = new Guide('van-thu', 'Hướng dẫn dành cho Văn thư');
const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(900); };
const stamp = new Date().toISOString().slice(5, 16).replace('T', ' ');

g.section('DMS · Văn thư: sổ Văn bản đến, đi và nội bộ', 'Văn thư giữ ba sổ: Văn bản đến, Văn bản đi và Văn bản nội bộ. Mỗi văn bản là một hồ sơ có số thứ tự (STT) riêng theo năm, kèm bản scan.', [
  'Hồ sơ mới là bản nháp: chưa có STT, chưa vào sổ cho tới khi xác nhận lưu chính thức.',
  'Sau khi lưu chính thức không sửa trực tiếp, không xóa; chỉ Admin sửa (có lý do) và nhân viên chỉ tải thêm scan.',
  'Mỗi sổ đánh số riêng và về 01 vào ngày đầu năm mới.',
], [
  ['Không thấy nút "+ Thêm bản ghi"', 'Tài khoản của bạn chưa được cấp quyền tạo hồ sơ cho sổ này. Nhờ Admin kiểm tra phân quyền.'],
  ['Văn bản vừa tạo không thấy ở tab Chính thức', 'Văn bản còn là nháp nên nằm ở tab Nháp. Mở và bấm Xác nhận lưu chính thức để vào sổ.'],
  ['Cần in sổ để lưu giấy', 'Bấm "Xuất PDF để in" hoặc "Xuất Excel" ở đầu danh sách.'],
]);
await go('/dms/van-ban-den');
await g.shot(page, { title: 'Sổ Văn bản đến', note: 'Ba nút chuyển giữa sổ Văn bản đến, Văn bản đi, Văn bản nội bộ nằm ngay dưới tiêu đề. Mỗi dòng của bảng là một văn bản đã vào sổ.',
  detail: ['Chính thức: văn bản đã có STT. Nháp: chưa vào sổ. Đã hủy: nháp đã bỏ.', 'Xuất PDF để in: bản in sổ năm đang chọn. Xuất Excel: tải dữ liệu sổ dạng bảng tính.', 'Ô tìm và các bộ lọc dùng như danh sách hồ sơ nghiệp vụ.'],
  marks: [
    { loc: page.getByRole('link', { name: 'Văn bản đi', exact: true }).first(), text: 'Chuyển sang sổ Văn bản đi hoặc Văn bản nội bộ' },
    { loc: page.getByRole('link', { name: /^Chính thức/ }).first(), text: 'Tab Chính thức, Nháp, Đã hủy' },
    { loc: page.getByRole('link', { name: 'Xuất Excel' }), text: 'Xuất Excel' },
    { loc: page.getByRole('link', { name: /Xuất PDF để in/ }).or(page.getByRole('button', { name: /Xuất PDF để in/ })).first(), text: 'Xuất PDF để in sổ' },
    { loc: page.getByRole('button', { name: '+ Thêm bản ghi' }).or(page.getByRole('link', { name: '+ Thêm bản ghi' })).first(), text: 'Thêm một văn bản mới vào sổ' },
  ] });
await page.getByRole('button', { name: '+ Thêm bản ghi' }).or(page.getByRole('link', { name: '+ Thêm bản ghi' })).first().click(); await page.waitForTimeout(800);
await page.locator('[role=dialog] [name=title]').fill(`[guide] Công văn số 12/UBND về việc phối hợp xác minh ${stamp}`);
await page.locator('[role=dialog] [name=note]').fill('Văn bản mẫu dùng cho tài liệu hướng dẫn.');
await g.shot(page, { title: 'Tạo bản nháp văn bản mới', note: 'Điền tên loại và trích yếu nội dung, ghi chú nếu cần rồi bấm "+ Tạo nháp". Hệ thống mở trang chi tiết của bản nháp.',
  detail: ['Tên loại và trích yếu nội dung (bắt buộc): ghi loại văn bản và nội dung chính, ví dụ "Công văn số 12/UBND về việc phối hợp xác minh".', 'Ghi chú: thông tin thêm nếu có.'],
  marks: [
    { loc: page.locator('[role=dialog] [name=title]'), text: 'Tên loại và trích yếu nội dung (bắt buộc)' },
    { loc: page.locator('[role=dialog] [name=note]'), text: 'Ghi chú (không bắt buộc)' },
    { loc: page.getByRole('button', { name: '+ Tạo nháp' }), text: 'Tạo bản nháp' },
  ] });
await page.getByRole('button', { name: '+ Tạo nháp' }).click(); await page.waitForURL(/\/dms\/van-ban-den\/[0-9a-f-]{36}/, { timeout: 15000 }); await page.waitForTimeout(1500);
await g.shot(page, { title: 'Bản nháp văn bản: thêm tài liệu rồi lưu chính thức', note: 'Cũng như hồ sơ nghiệp vụ, bản nháp cho phép sửa, thêm tài liệu và tải bản scan. Khi đã đúng, bấm Xác nhận lưu chính thức để cấp STT và vào sổ.',
  marks: [
    { loc: page.getByRole('link', { name: '+ Thêm tài liệu' }), text: 'Thêm tài liệu và tải bản scan', optional: true },
    { loc: page.getByRole('button', { name: 'Hủy nháp' }), text: 'Hủy bản nháp (cần nêu lý do)', optional: true },
    { loc: page.getByRole('button', { name: 'Xác nhận lưu chính thức' }), text: 'Lưu chính thức: cấp STT và vào sổ', optional: true },
  ] });
await go('/dms/van-ban-di');
await g.shot(page, { title: 'Sổ Văn bản đi và Văn bản nội bộ', note: 'Hai sổ này dùng đúng cách như Văn bản đến: chuyển bằng nút phía trên, mỗi sổ có STT riêng.',
  marks: [{ loc: page.getByRole('link', { name: 'Văn bản nội bộ', exact: true }).first(), text: 'Chuyển sang sổ Văn bản nội bộ' }] });

g.section('DMS · Văn thư: gửi bản trình', 'Văn thư cũng gửi được bản trình (tiêu đề, mô tả, bản scan) để Admin duyệt. Cách làm giống Thừa hành viên.', [
  'Bạn chỉ thấy bản trình của mình; Admin duyệt hoặc từ chối kèm ghi chú.',
]);
await go('/dms/trinh-duyet');
await g.shot(page, { title: 'Trình / Duyệt của Văn thư', note: 'Bấm "+ Trình mới" để gửi bản trình, xem trạng thái ở danh sách bên dưới. Chi tiết từng ô xem phần Trình / Duyệt trong hướng dẫn dành cho Thừa hành viên.',
  marks: [{ loc: page.getByRole('button', { name: '+ Trình mới' }), text: 'Gửi bản trình mới' }, { loc: page.locator('tbody tr').first(), text: 'Bản trình của bạn và trạng thái duyệt', optional: true }] });
g.save(); await b.close(); console.log('done', g.n);
