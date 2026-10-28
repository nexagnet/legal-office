import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
const C1 = '64ce003a-1556-49f6-a8e1-29294dc4c77b', C2 = '19f2f142-e7c2-48ee-83d8-c2e25d23a71d';
const b = await browser(); const { page } = await asRole(b, 'VAN_THU');
const g = new Guide('van-thu', 'Hướng dẫn dành cho Văn thư');
const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(700); };
const menu = (t) => page.locator('aside a, nav a').filter({ hasText: t });

g.section('Việc đầu ngày: xem hồ sơ cần mình xử lý', 'Văn thư là người giữ số và con dấu của Văn phòng. Hằng ngày bạn bắt đầu từ Tổng quan và Vi bằng để biết hồ sơ nào đang chờ cấp số, chờ đóng dấu hoặc chờ tải bản scan.');
await go('/');
await g.shot(page, { title: 'Trang Tổng quan', note: 'Thanh bên chỉ hiện mục thuộc vai Văn thư. Thẻ Vi bằng cho biết số hồ sơ đang xử lý.', marks: [{ loc: menu('Vi bằng'), text: 'Bấm Vi bằng ở thanh bên để mở danh sách hồ sơ' }] });
await go('/vi-bang');
await g.shot(page, { title: 'Danh sách hồ sơ Vi bằng', note: 'Cột "Bước tiếp theo" cho biết việc kế tiếp của từng hồ sơ. Hồ sơ cần cấp số hoặc đóng dấu sẽ ghi rõ ở đây.', marks: [{ loc: page.locator('table tbody tr').first(), text: 'Bấm vào tên hồ sơ để mở' }, { loc: page.getByText(/Tạo hồ sơ Vi bằng/), text: 'Văn thư cũng được tạo hồ sơ mới' }] });

g.section('Cấp số Vi bằng', 'Số Vi bằng dạng 1/2026/VB-THV chạy một dãy chung cho toàn Văn phòng, tăng dần trong năm. Chỉ cấp khi Kế toán đã xác nhận thanh toán đủ trên MISA; phần mềm không ghi số tiền.', ['Chưa có xác nhận thanh toán thì không cấp số.', 'Mỗi hồ sơ chỉ cấp một số; số của hồ sơ huỷ không dùng lại.']);
await go('/vi-bang/' + C2);
await g.shot(page, { title: 'Mở hồ sơ chờ cấp số', note: 'Hồ sơ đã giao THV nhưng Kế toán chưa xác nhận MISA, nên bước kế tiếp là "Xác nhận MISA và cấp số".', marks: [{ loc: page.getByRole('button', { name: /Thêm thao tác/ }), text: 'Bấm Thêm thao tác' }] });
await page.getByRole('button', { name: /Thêm thao tác/ }).click(); await page.waitForTimeout(500);
await g.shot(page, { title: 'Chọn Cấp số MISA', note: 'Việc chưa tới bước vẫn hiện nhưng mờ, kèm lý do ngắn.', marks: [{ loc: page.getByText('Cấp số MISA').first(), text: 'Chọn Cấp số MISA' }] });
await page.getByText('Cấp số MISA').first().click(); await page.waitForTimeout(1500);
await g.shot(page, { title: 'Ngăn kéo Cấp số: chưa thanh toán thì không cấp', note: 'Hệ thống chặn cấp số khi chưa có xác nhận của Kế toán và nói rõ lý do ngay trên màn hình.', marks: [{ loc: page.getByText('Cần xác nhận thanh toán đủ trước khi cấp số.').first(), text: 'Đọc lý do bị chặn; chờ Kế toán xác nhận rồi quay lại' }] });

g.section('Xác nhận đã đóng dấu và tải bản scan cuối', 'Sau khi Thừa hành viên ký trên văn bản giấy, Văn thư đóng dấu thật, bấm xác nhận trên phần mềm, rồi scan bản đã ký và đóng dấu để tải lên. Bản gốc giấy vẫn lưu tại Văn phòng; bản scan chỉ để quản lý.', ['Chỉ bấm "Đã đóng dấu" khi đã đóng dấu thật.', 'Bản scan cuối là PDF, tối đa 25 MB.']);
await go('/vi-bang/' + C1);
await g.shot(page, { title: 'Hồ sơ đã ký và đóng dấu, chờ bản scan', note: 'Thanh tiến độ cho thấy 4 bước đã xong; bước 5 là Bản scan cuối.', marks: [{ loc: page.getByText(/Tiếp tục: Ký/), text: 'Bấm Tiếp tục: Ký, đóng dấu và bản scan' }] });
await page.getByText(/Tiếp tục: Ký/).click(); await page.waitForTimeout(1800);
await g.shot(page, { title: 'Chọn tệp scan và tải lên', note: 'Hai xác nhận phía trên đã hoàn tất. Chọn tệp PDF đã có chữ ký và dấu.', marks: [{ loc: page.locator('input[type=file]'), text: 'Bấm Choose File rồi chọn tệp PDF scan' }, { loc: page.getByRole('button', { name: 'Tải bản scan cuối' }), text: 'Bấm Tải bản scan cuối' }] });
await page.locator('input[type=file]').setInputFiles('demo-scan.pdf'); await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Tải bản scan cuối' }).click(); await page.waitForTimeout(2500);
await g.shot(page, { title: 'Đã tải bản scan cuối', note: 'Bản scan được lưu kèm mã kiểm tra; trạng thái chuyển sang đã có bản scan.', marks: [{ loc: page.getByText(/Đã có bản scan|Đã tải/).first(), text: 'Trạng thái: đã có bản scan cuối' }] }).catch(async () => { g.cur.steps.pop(); await g.shot(page, { title: 'Sau khi tải bản scan cuối', note: 'Hệ thống ghi nhận bản scan.', marks: [] }); });
g.save(); await b.close(); console.log('done', g.n);
