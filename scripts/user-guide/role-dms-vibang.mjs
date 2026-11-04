import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
// Vi bằng trong DMS, góc nhìn Thừa hành viên: tạo nháp, tài liệu và scan, hủy nháp, lưu chính thức, đã trả kết quả.
// Mỗi lần chạy tạo một hồ sơ giả "[guide] ..." trên dev (hồ sơ đã ghi sổ không bao giờ bị xóa).
const SCAN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo-scan.pdf');
const b = await browser();
const { page } = await asRole(b, 'THV');
const g = new Guide('thua-hanh-vien', 'Hướng dẫn dành cho Thừa hành viên');
if (!process.env.APPEND) console.log('Gợi ý: đặt APPEND=1 để giữ các phần cũ của vai này');
const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(900); };
const f = (n, v) => page.locator(`[name=${n}]`).fill(v);
const stamp = new Date().toISOString().slice(5, 16).replace('T', ' ');
const TITLE = `[guide] Vi bằng thỏa thuận mua bán nhà ${stamp}`;

g.section('DMS · Vi bằng: tạo hồ sơ nháp', 'Hồ sơ Vi bằng mới luôn bắt đầu là bản NHÁP: chưa có số hồ sơ, chưa vào sổ S-02 và chưa tính vào thống kê. Bạn có thể sửa, thêm tài liệu hoặc hủy nháp thoải mái cho đến khi lưu chính thức.', [
  'Bản nháp chưa có số hồ sơ. Số hồ sơ (dạng 034/2026/VB-TPL) chỉ được cấp khi lưu chính thức.',
  'Tên hồ sơ là ô bắt buộc duy nhất. SĐT khách hàng nên nhập để liên hệ nhưng không in ra sổ.',
  'Các ô Cột 2 đến Cột 7 chính là các cột của Sổ S-02. Điền đúng chính tả vì đây là nội dung sẽ ghi vào sổ.',
], [
  ['Bấm Lưu nháp báo SĐT không hợp lệ', 'SĐT phải là số điện thoại Việt Nam (10 số, bắt đầu bằng 0, có thể có dấu cách). Nhập lại cho đúng rồi lưu.'],
  ['Bấm Lưu nháp báo thiếu tên hồ sơ', 'Điền ô Tên hồ sơ (ví dụ: Vi bằng ghi nhận thỏa thuận mua bán nhà của ông Nguyễn Văn An).'],
  ['Không thấy bản nháp vừa tạo ở tab Chính thức', 'Bản nháp nằm ở tab Nháp. Chỉ hồ sơ đã lưu chính thức mới hiện ở tab Chính thức.'],
]);
await go('/dms/vi-bang');
await g.shot(page, { title: 'Bấm "+ Tạo hồ sơ"', note: 'Nút nằm ở góc trên bên phải danh sách Vi bằng. Chỉ vai được cấp quyền tạo hồ sơ mới thấy nút này.',
  marks: [{ loc: page.getByRole('link', { name: '+ Tạo hồ sơ' }), text: 'Bấm "+ Tạo hồ sơ" để mở biểu mẫu tạo mới' }] });
await go('/dms/vi-bang/tao-moi');
await g.shot(page, { title: 'Điền thông tin Vi bằng (phần đầu)', note: 'Biểu mẫu chia 3 phần: A là thông tin phục vụ Sổ S-02, B là tài liệu đính kèm, C là thông tin hệ thống tự điền.',
  detail: ['Tên hồ sơ (bắt buộc): tên gọi để tìm lại hồ sơ, ví dụ "Vi bằng ghi nhận thỏa thuận mua bán nhà của ông Nguyễn Văn An".', 'SĐT khách hàng: số điện thoại liên hệ của người yêu cầu. Chỉ dùng để liên hệ, không in ra sổ.', 'Cột 2 (Người yêu cầu lập vi bằng): ghi rõ họ tên và địa chỉ.', 'Cột 3 (Nội dung yêu cầu lập vi bằng): mô tả ngắn việc cần ghi nhận.'],
  marks: [
    { loc: page.locator('[name=title]'), text: 'Tên hồ sơ (bắt buộc)' },
    { loc: page.locator('[name=phone]'), text: 'SĐT khách hàng (10 số, bắt đầu bằng 0)' },
    { loc: page.locator('[name=nguoi_yeu_cau]'), text: 'Cột 2: người yêu cầu lập vi bằng (họ tên, địa chỉ)' },
    { loc: page.locator('[name=noi_dung_yeu_cau]'), text: 'Cột 3: nội dung yêu cầu lập vi bằng' },
  ] });
await f('title', TITLE); await f('phone', '123');
await f('nguoi_yeu_cau', 'Nguyễn Văn An, 12 phố Huế, quận Hai Bà Trưng, Hà Nội');
await f('noi_dung_yeu_cau', 'Ghi nhận việc giao nhận tiền đặt cọc mua bán nhà');
await page.locator('form').first().evaluate((f) => { f.noValidate = true; }); // để chụp được thông báo lỗi của ứng dụng thay vì bong bóng gợi ý của trình duyệt
await page.getByRole('button', { name: 'Lưu nháp' }).click(); await page.getByText(/Thông tin chưa hợp lệ/).waitFor({ timeout: 30000 }); await page.waitForTimeout(500);
await g.shot(page, { title: 'Nhập sai SĐT: hệ thống chặn và báo lỗi', note: 'SĐT "123" không phải số điện thoại hợp lệ nên hồ sơ chưa được lưu. Sửa lại cho đúng rồi bấm Lưu nháp lần nữa.',
  marks: [
    { loc: page.locator('[name=phone]'), text: 'Ô SĐT báo lỗi: nhập lại 10 số, bắt đầu bằng 0' },
    { loc: page.getByText(/Thông tin chưa hợp lệ/), text: 'Thông báo lỗi hiện phía dưới biểu mẫu' },
  ] });
await f('phone', '0900 000 123');
await f('dia_chi_noi_lap', 'Số 4 – A11 Đầm Trấu, phường Bạch Đằng, quận Hai Bà Trưng, Hà Nội');
await f('thua_hanh_vien', 'DEMO Thừa hành viên');
await f('ghi_chu', 'Hồ sơ mẫu dùng cho tài liệu hướng dẫn');
await g.shot(page, { title: 'Điền thông tin Vi bằng (phần cuối) rồi Lưu nháp', note: 'Điền tiếp các cột còn lại của Sổ S-02 rồi bấm Lưu nháp. Có thể để trống ô chưa biết và bổ sung sau khi còn là nháp.',
  detail: ['Cột 4 (Số, ngày, tháng, năm của vi bằng): có thể để trống khi còn là nháp.', 'Cột 5 (Địa chỉ nơi lập vi bằng): ghi theo xã/phường/đặc khu, tỉnh/thành phố.', 'Cột 6 (Thừa hành viên lập vi bằng): ghi rõ họ tên và số thẻ.', 'Cột 7 (Ghi chú): thông tin thêm nếu có.'],
  marks: [
    { loc: page.locator('[name=dia_chi_noi_lap]'), text: 'Cột 5: địa chỉ nơi lập vi bằng' },
    { loc: page.locator('[name=thua_hanh_vien]'), text: 'Cột 6: thừa hành viên lập vi bằng (họ tên, số thẻ)' },
    { loc: page.locator('[name=ghi_chu]'), text: 'Cột 7: ghi chú' },
    { loc: page.getByRole('button', { name: 'Lưu nháp' }), text: 'Bấm Lưu nháp' },
  ] });
await page.getByRole('button', { name: 'Lưu nháp' }).click(); await page.waitForURL(/\/dms\/vi-bang\/[0-9a-f-]{36}/, { timeout: 60000 }); await page.waitForTimeout(1200);
const draftUrl = page.url();
await g.shot(page, { title: 'Bản nháp vừa tạo', note: 'Hệ thống chuyển sang trang chi tiết của bản nháp. Từ đây bạn lưu thêm, thêm tài liệu, hủy nháp hoặc lưu chính thức.',
  detail: ['Lưu hoặc Lưu nháp: lưu lại các ô vừa sửa, vẫn là bản nháp.', '+ Thêm tài liệu: mở tab Tài liệu để thêm văn bản và tải bản scan.', 'Hủy nháp: bỏ bản nháp (phải nêu lý do), xem phần "Hủy bản nháp".', 'Xác nhận lưu chính thức: cấp số hồ sơ, vào sổ, từ đó không sửa trực tiếp được nữa.'],
  marks: [
    { loc: page.getByRole('button', { name: 'Lưu', exact: true }), text: 'Lưu thay đổi (vẫn là bản nháp)' },
    { loc: page.getByRole('link', { name: '+ Thêm tài liệu' }), text: 'Thêm tài liệu cho hồ sơ' },
    { loc: page.getByRole('button', { name: 'Hủy nháp' }), text: 'Hủy bản nháp (cần nêu lý do)' },
    { loc: page.getByRole('button', { name: 'Xác nhận lưu chính thức' }), text: 'Lưu chính thức: cấp số và vào sổ' },
  ] });

g.section('DMS · Vi bằng: tài liệu và bản scan', 'Mỗi hồ sơ gồm một hoặc nhiều tài liệu (biên bản, vi bằng, giấy tờ kèm theo); mỗi tài liệu có các tệp đính kèm, thường là bản scan đã ký và đóng dấu.', [
  'Bản scan phải là tệp PDF hoặc ảnh. Nên scan rõ nét, đủ trang, đúng chiều.',
  'Tệp tải lên được nhận dạng chữ (OCR) tự động sau 1 đến 2 phút để phục vụ tìm theo nội dung.',
  'Sau khi lưu chính thức, không xóa hay sửa tài liệu đã có; chỉ được tải THÊM scan.',
], [
  ['Bấm Tải lên mà không có gì xảy ra', 'Chưa chọn tệp. Bấm "Chọn tệp" và chọn tệp PDF hoặc ảnh trước khi bấm Tải lên.'],
  ['Xem trước báo "Chọn một tệp để xem trước"', 'Hồ sơ chưa có tệp nào. Tải bản scan lên, rồi bấm Xem ở dòng tệp.'],
]);
await page.goto(draftUrl + '?tab=tai-lieu', { waitUntil: 'networkidle' }); await page.waitForTimeout(900);
await g.shot(page, { title: 'Tab Tài liệu: thêm một tài liệu', note: 'Tài liệu là một văn bản thuộc hồ sơ. Điền Loại tài liệu và Tên tài liệu rồi bấm "+ Thêm tài liệu".',
  detail: ['Loại tài liệu: mã hoặc loại văn bản, ví dụ N-04.', 'Tên tài liệu: tên gọi dễ nhận biết, ví dụ "Vi bằng ghi nhận thỏa thuận mua bán nhà".', 'Văn bản chính thức: tích nếu đây là văn bản chính thức của hồ sơ (thường là bản vi bằng đã ký).'],
  marks: [
    { loc: page.locator('[name=kind]'), text: 'Loại tài liệu (ví dụ N-04)' },
    { loc: page.locator('[name=title]'), text: 'Tên tài liệu' },
    { loc: page.locator('[name=isOfficial]'), text: 'Tích nếu là văn bản chính thức' },
    { loc: page.getByRole('button', { name: '+ Thêm tài liệu' }), text: 'Bấm để thêm tài liệu' },
  ] });
await page.locator('[name=kind]').fill('N-04'); await page.locator('[name=title]').fill('Vi bằng ghi nhận thỏa thuận mua bán nhà');
await page.locator('[name=isOfficial]').check();
await page.getByRole('button', { name: '+ Thêm tài liệu' }).click(); await page.waitForSelector('input[type=file]', { timeout: 15000 }); await page.waitForTimeout(800);
await page.locator('input[type=file]').first().setInputFiles(SCAN); await page.locator('[name=label]').first().fill('Bản scan vi bằng đã ký');
await g.shot(page, { title: 'Chọn tệp scan và tải lên', note: 'Sau khi thêm tài liệu, mục tải tệp hiện ra. Chọn tệp, đặt tên tệp (không bắt buộc), giữ ô "Bản scan" được tích rồi bấm Tải lên.',
  detail: ['Chọn tệp: chọn tệp PDF hoặc ảnh trên máy.', 'Tên tệp (tùy chọn): đặt tên dễ nhớ, ví dụ "Bản scan vi bằng đã ký".', 'Bản scan: tích nếu đây là bản scan văn bản giấy đã ký, đóng dấu.'],
  marks: [
    { loc: page.locator('input[type=file]').first(), text: 'Chọn tệp scan trên máy' },
    { loc: page.locator('[name=label]').first(), text: 'Tên tệp (không bắt buộc)' },
    { loc: page.locator('[name=isScan]').first(), text: 'Tích nếu là bản scan' },
    { loc: page.getByRole('button', { name: 'Tải lên' }).first(), text: 'Bấm Tải lên' },
  ] });
await page.getByRole('button', { name: 'Tải lên' }).first().click(); await page.waitForTimeout(3500);
await g.shot(page, { title: 'Tệp đã tải lên', note: 'Tệp hiện trong danh sách tài liệu. Bấm Xem để xem trước ngay bên cạnh. Chữ trong tệp sẽ được nhận dạng sau 1 đến 2 phút để tìm theo nội dung.',
  marks: [{ loc: page.getByRole('link', { name: 'Xem' }).first(), text: 'Bấm Xem để xem trước tệp' }] });

g.section('DMS · Vi bằng: hủy bản nháp', 'Khi mở nhầm hoặc không còn cần bản nháp, bạn hủy nháp. Bản nháp chưa có số và chưa vào sổ nên hủy không làm lệch số.', [
  'Chỉ hủy được BẢN NHÁP. Hồ sơ đã lưu chính thức không hủy hay xóa.',
  'Lý do hủy bắt buộc. Bản nháp hủy chuyển sang tab Đã hủy, vẫn tra cứu được.',
], [
  ['Nút Xác nhận hủy bị mờ', 'Chưa nhập Lý do hủy nháp. Nhập lý do rồi bấm lại.'],
  ['Bấm nhầm Hủy nháp', 'Bấm "Giữ bản nháp" để đóng hộp thoại, không có gì thay đổi.'],
]);
await page.goto(draftUrl, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Hủy nháp' }).click(); await page.waitForTimeout(600);
await page.getByLabel('Lý do hủy nháp').fill('Nhập trùng với hồ sơ đã có, không cần lập vi bằng nữa.');
await g.shot(page, { title: 'Hộp thoại Hủy bản nháp', note: 'Nhập lý do rồi bấm Xác nhận hủy. Muốn giữ lại bản nháp thì bấm Giữ bản nháp.',
  marks: [
    { loc: page.getByLabel('Lý do hủy nháp'), text: 'Lý do hủy nháp (bắt buộc)' },
    { loc: page.getByRole('button', { name: 'Giữ bản nháp' }), text: 'Giữ bản nháp: đóng hộp thoại, không hủy' },
    { loc: page.getByRole('button', { name: 'Xác nhận hủy' }), text: 'Xác nhận hủy: bản nháp chuyển sang Đã hủy' },
  ] });
await page.getByRole('button', { name: 'Giữ bản nháp' }).click(); await page.waitForTimeout(400);

g.section('DMS · Vi bằng: lưu chính thức (ghi sổ)', 'Khi nội dung đã đúng, bạn "Xác nhận lưu chính thức". Hệ thống cấp số hồ sơ, đưa hồ sơ vào sổ S-02 và khóa nội dung.', [
  'Sau khi lưu chính thức, hồ sơ và tài liệu KHÔNG sửa trực tiếp, KHÔNG xóa. Chỉ Admin sửa được nội dung (có lý do, lưu thành phiên bản mới); nhân viên chỉ tải thêm scan.',
  'Kiểm tra kỹ từng cột trước khi xác nhận vì đây là nội dung sổ.',
], [
  ['Cần sửa hồ sơ đã lưu chính thức', 'Nhờ Admin sửa (nêu rõ chỗ cần sửa và lý do). Bạn không sửa trực tiếp được.'],
  ['Muốn thêm bản scan sau khi lưu chính thức', 'Vẫn làm được: mở tab Tài liệu, dùng mục Tải thêm scan.'],
]);
await page.getByRole('button', { name: 'Xác nhận lưu chính thức' }).click(); await page.waitForTimeout(600);
await g.shot(page, { title: 'Hộp thoại xác nhận lưu chính thức', note: 'Đọc kỹ lưu ý: sau bước này hồ sơ không sửa trực tiếp được. Bấm Lưu chính thức để cấp số, hoặc Quay lại để kiểm tra thêm.',
  marks: [
    { loc: page.getByRole('button', { name: 'Quay lại' }), text: 'Quay lại để kiểm tra thêm' },
    { loc: page.getByRole('button', { name: 'Lưu chính thức' }), text: 'Lưu chính thức: cấp số hồ sơ và vào sổ' },
  ] });
await page.getByRole('button', { name: 'Lưu chính thức' }).click(); await page.waitForTimeout(3500);
const heading = (await page.locator('h1').first().innerText().catch(() => '')) || '';
console.log('hồ sơ sau ghi sổ:', heading.slice(0, 60), page.url());
await g.shot(page, { title: 'Hồ sơ sau khi lưu chính thức', note: 'Tiêu đề hiện số hồ sơ vừa cấp. Dải thông báo nhắc rằng chỉ Admin sửa được nội dung. Thông tin chung và Nội dung sổ S-02 hiển thị dạng chỉ đọc.',
  detail: ['Các tab: Thông tin chung, Tài liệu, Tệp đính kèm, Phiên bản cũ (các bản trước khi Admin sửa), Sổ liên quan.', 'Bạn không thấy nút sửa vì chỉ Admin sửa được hồ sơ đã ghi sổ.'],
  marks: [
    { loc: page.getByRole('link', { name: /^Tài liệu/ }).first(), text: 'Tab Tài liệu: xem và tải thêm scan' },
    { loc: page.getByRole('link', { name: /^Phiên bản cũ/ }).first(), text: 'Tab Phiên bản cũ: các bản trước khi Admin sửa' },
    { loc: page.getByRole('link', { name: /^Sổ liên quan/ }).first(), text: 'Tab Sổ liên quan' },
  ] });
const caseUrl = page.url().split('?')[0];
await page.goto(caseUrl + '?tab=tai-lieu', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
await g.shot(page, { title: 'Tab Tài liệu của hồ sơ đã ghi sổ', note: 'Xem bản scan ngay trong trang. Các nút phía trên khung xem cho phép tải bản scan chính, in, hoặc tải thêm scan.',
  marks: [
    { loc: page.locator('iframe').first(), text: 'Khung xem trước bản scan' },
    { loc: page.getByRole('link', { name: 'Tải bản scan chính' }).or(page.getByRole('button', { name: 'Tải bản scan chính' })), text: 'Tải bản scan chính về máy' },
    { loc: page.getByRole('link', { name: 'In', exact: true }).or(page.getByRole('button', { name: 'In', exact: true })), text: 'In bản scan' },
    { loc: page.getByRole('link', { name: 'Tải thêm scan', exact: true }).or(page.getByRole('button', { name: 'Tải thêm scan', exact: true })), text: 'Tải thêm một tệp scan nữa (cuộn xuống mục tải tệp)' },
  ] });

g.section('DMS · Vi bằng: đánh dấu Đã trả kết quả', 'Khi đã trả kết quả (vi bằng) cho khách, bạn tích ô "Đã trả kết quả" trên dòng hồ sơ. Ô này chỉ để theo dõi, không đổi trạng thái hồ sơ.', [
  'Chỉ tích được với hồ sơ đã lưu chính thức (đã có số). Bản nháp chưa tích được.',
  'Số hồ sơ đã tích hiện ở thẻ "Đã trả kết quả" trên danh sách và trên Tổng quan.',
], [
  ['Không tích được ô Đã trả kết quả', 'Hồ sơ còn là bản nháp, hoặc bạn không có quyền ghi trên hồ sơ này.'],
]);
const num = (heading.split('·')[0] || '').trim();
await go('/dms/vi-bang');
const box = page.getByRole('checkbox', { name: new RegExp('Đã trả kết quả hồ sơ ' + num.replace(/[/]/g, '\\/')) });
await g.shot(page, { title: 'Tìm dòng hồ sơ và tích Đã trả kết quả', note: 'Tích vào ô trên dòng hồ sơ. Hệ thống lưu ngay và thẻ "Đã trả kết quả" phía trên tăng thêm 1.',
  marks: [{ loc: box, text: 'Tích khi đã trả kết quả cho khách' }] });
await box.check(); await page.waitForTimeout(1500);
await go('/dms/vi-bang'); // tải lại để thẻ đếm cập nhật
await g.shot(page, { title: 'Đã tích: thẻ Đã trả kết quả tăng', note: 'Ô đã được tích và được lưu ngay. Thẻ "Đã trả kết quả" phía trên đếm lại số hồ sơ đã tích (cập nhật khi tải lại trang). Bỏ tích nếu tích nhầm.',
  marks: [{ loc: box, text: 'Ô đã tích' }, { loc: page.getByText('Đã trả kết quả', { exact: true }).first().locator('xpath=..'), text: 'Thẻ đếm số hồ sơ đã trả kết quả' }] });
g.save(); await b.close(); console.log('done', g.n);
