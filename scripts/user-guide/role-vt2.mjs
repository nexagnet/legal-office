import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
const C2 = process.env.CASE;
const b = await browser(); const { page } = await asRole(b, 'VAN_THU');
const g = new Guide('van-thu', 'Hướng dẫn dành cho Văn thư');
const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(900); };
g.section('Cấp số khi Kế toán đã xác nhận thanh toán', 'Sau khi Kế toán xác nhận thanh toán đủ trên MISA, nút Cấp số mở ra. Hệ thống tự cấp số kế tiếp trong dãy chung của Văn phòng.', ['Mỗi hồ sơ chỉ cấp một lần.', 'Không có ô nhập số: số do hệ thống cấp, tránh trùng.']);
await go('/vi-bang/' + C2);
await page.getByRole('button', { name: /Thêm thao tác/ }).click(); await page.waitForTimeout(500);
await page.getByText('Cấp số MISA').first().click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1800);
if (await page.getByRole('button', { name: /^Cấp số/ }).count()) {
await g.shot(page, { title: 'Bấm Cấp số khi đã có xác nhận thanh toán', note: 'Trạng thái đã chuyển sang Đã xác nhận thanh toán đủ; nút Cấp số đã sẵn sàng.', marks: [{ loc: page.getByRole('button', { name: /^Cấp số/ }), text: 'Bấm Cấp số' }] });
await page.getByRole('button', { name: /^Cấp số/ }).click(); await page.waitForTimeout(2500);
await g.shot(page, { title: 'Số Vi bằng đã được cấp', note: 'Số có dạng số thứ tự/năm/VB-THV. Hồ sơ chuyển sang bước Thừa hành viên ký.', marks: [] });
} else {
  g.cur.steps.push({ title: 'Bấm Cấp số khi đã có xác nhận thanh toán', note: 'Trạng thái đã chuyển sang Đã xác nhận thanh toán đủ; nút Cấp số đã sẵn sàng.', img: 'van-thu/09.png', marks: [{ n: 1, text: 'Bấm Cấp số' }] });
  g.cur.steps.push({ title: 'Số Vi bằng đã được cấp', note: 'Số có dạng số thứ tự/năm/VB-THV. Hồ sơ chuyển sang bước Thừa hành viên ký.', img: 'van-thu/10.png', marks: [] });
}
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
g.section('Vào sổ công văn đến', 'Văn thư theo dõi sổ văn bản của Văn phòng. Công văn đến được vào sổ với loại văn bản, nơi gửi, trích yếu, số ký hiệu và ngày nhận.', ['Công văn có hạn xử lý sẽ được nhắc ở Tổng quan.']);
await go('/cong-van');
g.n = Math.max(g.n, 10); await g.shot(page, { title: 'Màn Công văn đi / đến', note: 'Danh sách văn bản đã vào sổ và nút tạo văn bản mới.', marks: [{ loc: page.getByText(/Tạo văn bản/), text: 'Bấm + Tạo văn bản để vào sổ công văn mới' }] });
g.save(); await b.close(); console.log('done', g.n);
