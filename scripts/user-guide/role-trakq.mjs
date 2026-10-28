import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
const C1 = process.env.CASE;
const b = await browser(); const { page } = await asRole(b, 'THV');
const g = new Guide('thua-hanh-vien', 'Hướng dẫn dành cho Thừa hành viên');
const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(900); };
const btn = (n) => page.getByRole('button', { name: n });
const menu = async () => { await btn(/Thêm thao tác/).click(); await page.waitForTimeout(450); };
const item = (n) => page.getByRole('menuitem', { name: new RegExp(n) });

g.section('Vi bằng: liên hệ khách và trả kết quả', 'Trả kết quả là bước cuối của Vi bằng. Để được ghi "Đã trả" phải đủ năm điều kiện: thanh toán còn hợp lệ, THV đã ký, Văn thư đã đóng dấu, đã có bản scan cuối và việc bàn giao thực tế đã xảy ra. Liên hệ khách không đồng nghĩa với đã trả.', ['Ghi từng lần liên hệ (nhắc nhận, báo kết quả) và kết quả liên hệ.', 'Cập nhật cơ sở dữ liệu hoặc gửi Sở Tư pháp là việc riêng, không chặn việc trả khách.']);
await go('/vi-bang/' + C1);
await menu();
await item('Trả kết quả').click(); await page.waitForTimeout(1800);
await page.locator('select[name=kind]').selectOption({ index: 1 });
await g.shot(page, { title: 'Ghi lần liên hệ khách', note: 'Chọn loại liên hệ và kết quả liên hệ rồi lưu. Nhật ký liên hệ ghi ngày, người và kết quả.', marks: [{ loc: page.locator('select[name=kind]'), text: 'Chọn loại liên hệ' }, { loc: page.locator('select[name=outcome]'), text: 'Chọn kết quả liên hệ' }, { loc: btn('Lưu kết quả liên hệ'), text: 'Bấm Lưu kết quả liên hệ' }] });
await btn('Lưu kết quả liên hệ').click(); await page.waitForTimeout(2000);
await page.locator('input[name=recipientName]').fill('DEMO Nguyễn Văn A');
await page.locator('input[name=handedOverOn]').fill(new Date().toISOString().slice(0, 10));
await g.shot(page, { title: 'Ghi người nhận và ngày bàn giao', note: 'Khi khách đến nhận bản gốc: nhập người nhận kết quả và ngày bàn giao thực tế.', marks: [{ loc: page.locator('input[name=recipientName]'), text: 'Nhập người nhận kết quả' }, { loc: page.locator('input[name=handedOverOn]'), text: 'Chọn ngày bàn giao' }, { loc: btn('Lưu người nhận'), text: 'Bấm Lưu người nhận' }, { loc: btn('Xác nhận đã trả kết quả'), text: 'Cuối cùng bấm Xác nhận đã trả kết quả' }] });
await btn('Lưu người nhận').click(); await page.waitForTimeout(2000);
await btn('Xác nhận đã trả kết quả').click(); await page.waitForTimeout(2500);
await g.shot(page, { title: 'Hồ sơ đã trả kết quả', note: 'Hệ thống chỉ cho trả khi đủ điều kiện; thiếu một điều kiện sẽ báo lý do bằng chữ đỏ ngay dưới nút.', marks: [] });
await page.keyboard.press('Escape');

g.save(); await b.close(); console.log('done', g.n);
