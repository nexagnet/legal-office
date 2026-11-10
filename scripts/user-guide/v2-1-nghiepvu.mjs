import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
// Hướng dẫn bản mới (v2), phần 1: đăng nhập, giao diện, Vi bằng, Tống đạt, Xác minh THA, Tổ chức THA. Chụp bằng vai Thừa hành viên.
// Chạy: GUIDE_OUT=docs/user-guide/v2 node v2-1-nghiepvu.mjs  (xem docs/user-guide/v2/README.md)
const SCAN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo-scan.pdf');
const b = await browser();
const g = new Guide('nghiep-vu', 'Đăng nhập và bốn nghiệp vụ');
const T = await asRole(b, 'THV'); const page = T.page;
const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(800); };
const tall = (h = 1250) => page.setViewportSize({ width: 1440, height: h });
const norm = () => page.setViewportSize({ width: 1440, height: 900 });
const f = (n, v) => page.locator(`[name=${n}]`).fill(v);

// 1. Đăng nhập và giao diện
g.section('Đăng nhập và làm quen màn hình', 'Mở địa chỉ hệ thống do Văn phòng cấp, đăng nhập bằng tài khoản của riêng bạn. Menu bên trái chỉ hiện những mục thuộc quyền của bạn.', [
  'Mỗi người một tài khoản, không dùng chung. Mọi thao tác trên hồ sơ đều ghi tên người đăng nhập.',
  'Lần đăng nhập đầu hệ thống bắt đổi mật khẩu mới (tối thiểu 12 ký tự).',
  'Sai mật khẩu quá 5 lần thì tài khoản bị khóa 15 phút; nhờ Admin hỗ trợ nếu cần.',
], [['Quên mật khẩu', 'Bấm "Quên mật khẩu?" ở màn đăng nhập để nhận liên kết đặt lại qua email, hoặc nhờ Admin đặt lại.'], ['Thiếu mục trên menu', 'Mỗi người chỉ thấy mục thuộc quyền của mình. Cần thêm quyền thì nhờ Admin.']]);
const anon = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const lp = await anon.newPage(); await lp.goto(BASE + '/login', { waitUntil: 'networkidle' }); await lp.waitForTimeout(600);
await g.shot(lp, { title: 'Màn hình đăng nhập', note: 'Nhập email (hoặc số CCCD) và mật khẩu rồi bấm Đăng nhập.', marks: [
  { loc: lp.getByLabel('Email hoặc số CCCD'), text: 'Nhập email hoặc số CCCD Văn phòng đã cấp' },
  { loc: lp.getByLabel('Mật khẩu'), text: 'Nhập mật khẩu' },
  { loc: lp.getByRole('button', { name: 'Đăng nhập', exact: true }), text: 'Bấm Đăng nhập' },
  { loc: lp.getByRole('link', { name: 'Quên mật khẩu?' }), text: 'Quên mật khẩu: nhận liên kết đặt lại qua email' }] });
await anon.close();
await go('/');
await g.shot(page, { title: 'Màn hình làm việc', note: 'Menu bên trái để chuyển mục, ô tìm kiếm phía trên (hoặc phím Ctrl K), chuông thông báo và tên tài khoản ở góc phải.', marks: [
  { loc: page.getByRole('link', { name: 'Vi bằng', exact: true }), text: 'Menu: chọn nghiệp vụ hoặc mục cần làm' },
  { loc: page.getByText(/Tìm kiếm hồ sơ, trang/).first(), text: 'Tìm hồ sơ, trang (Ctrl K)' },
  { loc: page.getByRole('link', { name: /Thông báo/ }).or(page.getByRole('button', { name: /Thông báo/ })).first(), text: 'Chuông thông báo', optional: true },
  { loc: page.getByRole('button', { name: /Phạm Quốc Bảo/ }).first(), text: 'Tài khoản: đổi mật khẩu, đăng xuất' }] });

// 2. Vi bằng
g.section('Vi bằng', 'Mọi hồ sơ mới bắt đầu là bản nháp. Điền Sổ S-02 (phần A), đính kèm bản scan (phần B), thông tin khác (phần C), rồi xác nhận lưu chính thức để được cấp số hồ sơ.', [
  'Bản nháp chưa có số và chưa vào sổ; sửa, hủy tự do.',
  'Sau khi lưu chính thức, chỉ Admin sửa được nội dung (có lý do, lưu lịch sử); nhân viên chỉ tải thêm scan.',
  'Phần A chỉ gồm các cột của Sổ S-02. Tên, SĐT, ghi chú nằm ở phần C và không in ra sổ.',
], [['Bấm Lưu nháp báo SĐT sai', 'SĐT phải là số Việt Nam, 10 số, bắt đầu bằng 0.'], ['Không thấy bản nháp ở tab Chính thức', 'Bản nháp nằm ở tab Nháp; chỉ hồ sơ đã lưu chính thức mới ở tab Chính thức.']]);
await go('/dms/vi-bang');
await g.shot(page, { title: 'Danh sách Vi bằng', note: 'Chọn tab Chính thức, Nháp hoặc Đã hủy; tìm theo từ khóa; bấm + Tạo hồ sơ để lập hồ sơ mới.', marks: [
  { loc: page.getByRole('button', { name: 'Chính thức', exact: true }).or(page.getByRole('link', { name: 'Chính thức', exact: true })).first(), text: 'Tab: Chính thức, Nháp, Đã hủy' },
  { loc: page.getByRole('link', { name: '+ Tạo hồ sơ' }), text: 'Bấm + Tạo hồ sơ' },
  { loc: page.getByRole('link', { name: /^Xuất S-0/ }).or(page.getByRole('button', { name: /^Xuất S-0/ })).first(), text: 'Xuất Sổ S-02 ra tệp' },
  { loc: page.getByRole('button', { name: 'Tìm', exact: true }), text: 'Tìm theo từ khóa' }] });
await go('/dms/vi-bang/tao-moi'); await tall();
await g.shot(page, { title: 'Biểu mẫu tạo hồ sơ Vi bằng', note: 'Phần A là các cột của Sổ S-02, phần B là tệp scan đính kèm, phần C là thông tin khác không vào sổ.', marks: [
  { loc: page.locator('[name=nguoi_yeu_cau]'), text: 'Cột 2: người yêu cầu lập vi bằng (họ tên, địa chỉ)' },
  { loc: page.locator('[name=thua_hanh_vien]'), text: 'Cột 6: thừa hành viên lập vi bằng (họ tên, số thẻ)' },
  { loc: page.locator('[name=files]'), text: 'Phần B: chọn tệp scan (PDF, JPEG, PNG)' },
  { loc: page.locator('[name=phone]'), text: 'Phần C: SĐT khách hàng (không in ra sổ)' },
  { loc: page.getByRole('button', { name: 'Lưu nháp' }), text: 'Bấm Lưu nháp' }] });
await f('nguoi_yeu_cau', 'Nguyễn Văn An, 12 phố Huế, quận Hai Bà Trưng, Hà Nội'); await f('noi_dung_yeu_cau', 'Ghi nhận việc giao nhận tiền đặt cọc mua bán nhà');
await f('dia_chi_noi_lap', 'Số 4 – A11 Đầm Trấu, phường Bạch Đằng, quận Hai Bà Trưng, Hà Nội'); await f('thua_hanh_vien', 'Phạm Quốc Bảo, thẻ số 128'); await f('ghi_chu', 'Có kèm ảnh chụp hiện trạng');
await f('title', 'Vi bằng thỏa thuận mua bán nhà của ông Nguyễn Văn An'); await f('phone', '0900 000 123');
await page.locator('[name=files]').setInputFiles(SCAN); await page.waitForTimeout(500);
await g.shot(page, { title: 'Điền thông tin, chọn tệp scan rồi Lưu nháp', note: 'Ô chưa biết có thể để trống và bổ sung sau khi còn là nháp. Tệp scan được tải lên ngay sau khi lưu nháp.', marks: [
  { loc: page.locator('[name=noi_dung_yeu_cau]'), text: 'Điền các cột của Sổ S-02' },
  { loc: page.locator('[name=files]'), text: 'Đã chọn tệp scan' },
  { loc: page.locator('[name=title]'), text: 'Tên hồ sơ (bỏ trống thì hệ thống tự đặt)' },
  { loc: page.getByRole('button', { name: 'Lưu nháp' }), text: 'Bấm Lưu nháp' }] });
await page.getByRole('button', { name: 'Lưu nháp' }).click(); await page.waitForURL(/\/dms\/vi-bang\/[0-9a-f-]{36}/, { timeout: 60000 }); await page.waitForTimeout(2500); await norm(); await page.waitForTimeout(500);
const draftUrl = page.url();
await tall(1900);
await g.shot(page, { title: 'Bản nháp vừa tạo', note: 'Hệ thống mở trang bản nháp. Sửa tiếp được; xong thì Xác nhận lưu chính thức, hoặc Hủy nháp nếu không cần nữa.', marks: [
  { loc: page.getByRole('button', { name: 'Hủy nháp' }), text: 'Hủy nháp (phải nêu lý do)' },
  { loc: page.getByRole('button', { name: 'Xác nhận lưu chính thức' }), text: 'Xác nhận lưu chính thức: cấp số và ghi sổ' }] });
await norm();
await page.getByRole('button', { name: 'Hủy nháp' }).click(); await page.waitForTimeout(600);
await page.getByLabel('Lý do hủy nháp').fill('Nhập trùng với hồ sơ đã có.');
await g.shot(page, { title: 'Hủy bản nháp', note: 'Nhập lý do rồi bấm Xác nhận hủy; muốn giữ lại thì bấm Giữ bản nháp. Bản nháp hủy chuyển sang tab Đã hủy.', marks: [
  { loc: page.getByLabel('Lý do hủy nháp'), text: 'Lý do hủy (bắt buộc)' },
  { loc: page.getByRole('button', { name: 'Giữ bản nháp' }), text: 'Giữ bản nháp, không hủy' },
  { loc: page.getByRole('button', { name: 'Xác nhận hủy' }), text: 'Xác nhận hủy' }] });
await page.getByRole('button', { name: 'Giữ bản nháp' }).click(); await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Xác nhận lưu chính thức' }).click(); await page.waitForTimeout(600);
await g.shot(page, { title: 'Xác nhận lưu chính thức', note: 'Sau bước này hồ sơ được cấp số, vào sổ và không sửa trực tiếp được nữa. Kiểm tra kỹ rồi bấm Lưu chính thức.', marks: [
  { loc: page.getByRole('button', { name: 'Quay lại' }), text: 'Quay lại để kiểm tra thêm' },
  { loc: page.getByRole('button', { name: 'Lưu chính thức' }), text: 'Lưu chính thức' }] });
await page.getByRole('button', { name: 'Lưu chính thức' }).click(); await page.waitForTimeout(3500);
await g.shot(page, { title: 'Hồ sơ đã ghi sổ', note: 'Tiêu đề hiện số hồ sơ vừa cấp. Các tab: Thông tin chung, Tài liệu, Tệp đính kèm, Phiên bản cũ, Sổ liên quan, Lịch sử hồ sơ.', marks: [
  { loc: page.getByRole('link', { name: /^Tài liệu/ }).first(), text: 'Tab Tài liệu: xem bản scan' },
  { loc: page.getByRole('link', { name: /^Phiên bản cũ/ }).first(), text: 'Tab Phiên bản cũ: các bản trước khi Admin sửa' },
  { loc: page.getByRole('link', { name: /^Lịch sử hồ sơ/ }).first(), text: 'Tab Lịch sử hồ sơ: ai làm gì, lúc nào' }] });
const caseUrl = page.url().split('?')[0];
await page.goto(caseUrl + '?tab=tai-lieu', { waitUntil: 'networkidle' }); await page.waitForTimeout(1800);
await g.shot(page, { title: 'Xem bản scan trong hồ sơ', note: 'Bản scan hiện ngay trong trang; có nút tải về và in.', marks: [
  { loc: page.locator('iframe').first(), text: 'Khung xem trước bản scan' },
  { loc: page.getByRole('link', { name: 'Tải bản scan chính' }).or(page.getByRole('button', { name: 'Tải bản scan chính' })).first(), text: 'Tải bản scan chính về máy', optional: true }] });
const heading = (await page.locator('h1').first().innerText().catch(() => '')) || '';
const num = (heading.split('·')[0] || '').trim();
await go('/dms/vi-bang');
const box = page.getByRole('checkbox', { name: new RegExp('Đã trả kết quả hồ sơ ' + num.replace(/[/]/g, '\\/')) });
await g.shot(page, { title: 'Đánh dấu Đã trả kết quả', note: 'Khi đã trả kết quả cho khách, tích ô trên dòng hồ sơ. Ô này chỉ để theo dõi, không đổi trạng thái hồ sơ.', marks: [{ loc: box, text: 'Tích khi đã trả kết quả cho khách' }] });

// 3. Ba nghiệp vụ còn lại
const DOMS = [
  ['tong-dat', 'Tống đạt', 'S-01', 'Tống đạt: mỗi hồ sơ có thể gồm nhiều dòng của Sổ S-01, thêm sau khi lưu nháp. Quy trình giống Vi bằng: nháp, scan, lưu chính thức.', []],
  ['xac-minh', 'Xác minh điều kiện thi hành án', 'S-04', 'Xác minh THA: ghi hợp đồng dịch vụ, quyết định thi hành án, người yêu cầu, người phải thi hành, nội dung và kết quả xác minh vào Sổ S-04.', ['hop_dong_dich_vu', 'quyet_dinh_thi_hanh_an', 'nguoi_phai_thi_hanh_an', 'ket_qua_xac_minh', 'thua_hanh_vien']],
  ['to-chuc-tha', 'Tổ chức thi hành án', 'S-05', 'Tổ chức THA: ghi hợp đồng, quyết định, bên phải thi hành, bên được thi hành, khoản phải thi hành và kết quả vào Sổ S-05.', ['hop_dong_dich_vu', 'quyet_dinh_thi_hanh_an', 'ben_phai_thi_hanh_an', 'ben_duoc_thi_hanh_an', 'ket_qua_thi_hanh_an', 'thua_hanh_vien']],
];
for (const [slug, name, book, intro, marksN] of DOMS) {
  g.section(name, intro, ['Cách làm giống Vi bằng: bản nháp, đính kèm scan, Xác nhận lưu chính thức để được cấp số.', `Phần A của biểu mẫu chỉ gồm các cột của Sổ ${book}.`], []);
  await go('/dms/' + slug);
  await g.shot(page, { title: `Danh sách ${name}`, note: `Các thẻ phía trên cho biết số hồ sơ cần chú ý. Bấm + Tạo hồ sơ để lập hồ sơ mới, Xuất ${book} để tải sổ.`, marks: [
    { loc: page.getByRole('link', { name: '+ Tạo hồ sơ' }), text: 'Bấm + Tạo hồ sơ' },
    { loc: page.getByRole('link', { name: new RegExp('^Xuất ' + book) }).or(page.getByRole('button', { name: new RegExp('^Xuất ' + book) })).first(), text: `Xuất Sổ ${book}` },
    { loc: page.getByRole('button', { name: /^Nháp/ }).or(page.getByRole('link', { name: /^Nháp/ })).first(), text: 'Tab Nháp: hồ sơ chưa lưu chính thức' }] });
  await go(`/dms/${slug}/tao-moi`); await tall(slug === 'vi-bang' ? 1250 : 1500);
  await g.shot(page, { title: `Biểu mẫu tạo hồ sơ ${name}`, note: `Phần A là các cột của Sổ ${book}, phần B là tệp scan, phần C là thông tin khác không vào sổ.`, marks: [
    ...marksN.slice(0, 2).map((n, i) => ({ loc: page.locator(`[name=${n}]`), text: i === 0 ? 'Điền các cột của sổ' : 'Cột kế tiếp của sổ' })),
    { loc: page.locator('[name=files]'), text: 'Chọn tệp scan đính kèm' },
    { loc: page.getByRole('button', { name: 'Lưu nháp' }), text: 'Bấm Lưu nháp' }].filter((m) => m.loc) });
  await norm();
}
g.save(); await b.close(); console.log('done', g.n);
