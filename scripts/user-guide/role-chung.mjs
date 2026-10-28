import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
const b = await browser();
const g = new Guide('chung', 'Phần chung: đăng nhập và giao diện');
// Đăng nhập (chưa có phiên)
const anon = await (await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' })).newPage();
await anon.goto(BASE + '/login', { waitUntil: 'networkidle' }); await anon.waitForTimeout(900);
g.section('Đăng nhập', 'Mỗi người dùng một tài khoản riêng do Admin lập. Bạn đăng nhập bằng email và mật khẩu, hoặc bằng liên kết gửi qua email nếu Văn phòng đã cấu hình gửi thư.', ['Sai mật khẩu quá 5 lần, tài khoản bị khoá 15 phút; liên hệ Admin để được hỗ trợ.', 'Không dùng dữ liệu khách thật trên môi trường chạy thử.']);
const inputs = anon.locator('input');
await g.shot(anon, { title: 'Màn hình đăng nhập', note: 'Nhập email và mật khẩu rồi bấm Đăng nhập.', marks: [{ loc: inputs.nth(0), text: 'Nhập Email' }, { loc: inputs.nth(1), text: 'Nhập Mật khẩu' }, { loc: anon.getByRole('button', { name: /Đăng nhập/ }).first(), text: 'Bấm Đăng nhập' }] });
// Giao diện chung
const { page } = await asRole(b, 'TRUONG_VP');
await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(900);
g.section('Làm quen với giao diện', 'Giao diện gồm thanh bên trái (menu theo vai), ô tìm kiếm phía trên, chuông thông báo và thẻ tài khoản ở góc phải. Mỗi người chỉ thấy mục thuộc vai của mình.', ['Thanh bên chia theo nhóm: Công việc, Nghiệp vụ, Văn phòng, Quản trị.', 'Mục Hộp duyệt hiện số đỏ khi có đề xuất đang chờ.']);
await g.shot(page, { title: 'Các thành phần chính', note: 'Bấm Ctrl K ở bất kỳ màn nào để tìm hồ sơ hoặc trang.', marks: [{ loc: page.locator('aside').first(), text: 'Thanh bên: menu theo vai của bạn' }, { loc: page.getByText('Tìm kiếm hồ sơ, trang').first(), text: 'Ô tìm kiếm (Ctrl K)' }, { loc: page.getByRole('button', { name: /Trưởng văn phòng/ }).first(), text: 'Thẻ tài khoản: xem vai, đăng xuất' }] });
await page.getByRole('button', { name: 'Thu gọn' }).click(); await page.waitForTimeout(600);
await g.shot(page, { title: 'Thu gọn thanh bên', note: 'Bấm Thu gọn ở cuối thanh bên để màn làm việc rộng hơn; bấm lại để mở. Máy nhớ lựa chọn của bạn.', marks: [] });
g.save(); await b.close(); console.log('done', g.n);
