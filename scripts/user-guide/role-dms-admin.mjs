import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
// Admin trong DMS: Tổng quan, Trình/Duyệt, sửa sau ghi sổ, xóa scan, Scan đã xóa, Lịch sử hoạt động.
// Cần có ít nhất một hồ sơ đã ghi sổ mang tiền tố "[guide]" (do role-dms-vibang.mjs tạo). Chạy với APPEND=1.
const SCAN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo-scan.pdf');
const b = await browser();
const { page } = await asRole(b, 'ADMIN');
const thv = await asRole(b, 'THV');
const g = new Guide('admin', 'Hướng dẫn dành cho Admin');
const gt = new Guide('thua-hanh-vien', 'Hướng dẫn dành cho Thừa hành viên');
const go = async (p, pg = page) => { await pg.goto(BASE + p, { waitUntil: 'networkidle' }); await pg.waitForTimeout(900); };
const REAL = process.env.GUIDE_REAL === '1'; // dữ liệu minh họa gửi khách: tiêu đề thật, không tiền tố [guide], không mốc giờ
const TAG = REAL ? '' : '[guide] ';
const stamp = REAL ? '' : new Date().toISOString().slice(5, 16).replace('T', ' ');

// ---------- Tổng quan ----------
g.section('DMS · Tổng quan của Admin', 'Tổng quan cho biết nhanh tình hình năm hiện tại: số hồ sơ, tài liệu, hồ sơ thiếu scan, số hồ sơ đã trả kết quả và các bản trình đang chờ bạn duyệt.', [
  'Số liệu chỉ tính hồ sơ đã lưu chính thức, không tính bản nháp và hồ sơ đã hủy.',
], [['Không thấy khối "Bản trình chờ duyệt"', 'Khối này chỉ hiện khi đang có bản trình chờ duyệt. Hết bản trình chờ thì khối tự ẩn.']]);
await go('/');
await g.shot(page, { title: 'Trang Tổng quan', note: 'Bốn thẻ số liệu ở trên, bên dưới là biểu đồ hồ sơ theo nghiệp vụ và danh sách hồ sơ cần bổ sung scan.',
  detail: ['Hồ sơ năm: số hồ sơ chính thức của năm hiện tại.', 'Tài liệu hiện hành: số tài liệu đang có hiệu lực (không tính các bản đã được thay bằng phiên bản mới).', 'Hồ sơ thiếu scan: có tài liệu nhưng chưa có bản scan, cần bổ sung.', 'Đã trả kết quả: số hồ sơ đã được tích Đã trả kết quả.', 'Cần bổ sung scan: bấm Mở để vào thẳng hồ sơ thiếu scan.'],
  marks: [
    { loc: page.getByText('Hồ sơ theo nghiệp vụ'), text: 'Số hồ sơ theo từng nghiệp vụ: bấm tên để mở danh sách' },
    { loc: page.getByText('Cần bổ sung scan', { exact: true }), text: 'Hồ sơ còn thiếu bản scan' },
    { loc: page.getByRole('link', { name: 'Mở hàng chờ' }), text: 'Mở hàng chờ duyệt bản trình (chỉ hiện khi có bản đang chờ)', optional: true },
  ] });

// ---------- Trình / Duyệt ----------
g.section('DMS · Trình / Duyệt bản trình', 'Bản trình là cách nhân viên (Thừa hành viên, Văn thư) gửi tiêu đề, mô tả và bản scan lên để Admin duyệt hoặc từ chối. Bản trình KHÔNG phải hồ sơ nghiệp vụ và không tạo số hồ sơ.', [
  '"Duyệt" trong phần mềm là xác nhận nội bộ, không phải chữ ký pháp lý.',
  'Từ chối bắt buộc nhập ghi chú. Duyệt thì ghi chú không bắt buộc.',
  'Bản trình không bao giờ bị xóa; chỉ file scan xóa được, với người có quyền xóa scan.',
  'Người gửi chỉ thấy bản trình của mình. Admin thấy bản trình của cả văn phòng.',
], [
  ['Bấm Từ chối nhưng không có gì xảy ra', 'Chưa nhập Ghi chú. Từ chối bắt buộc có ghi chú để người gửi biết lý do.'],
  ['Muốn duyệt lại bản đã duyệt hoặc đã từ chối', 'Không được. Mỗi bản trình chỉ duyệt hoặc từ chối một lần; nếu cần, người gửi gửi bản trình mới.'],
]);
gt.section('DMS · Trình / Duyệt: gửi bản trình', 'Khi cần Admin xem xét một việc kèm bản scan (ví dụ đề nghị cấp bản sao, bổ sung giấy ủy quyền), bạn gửi một bản trình.', [
  'Bản trình không phải hồ sơ nghiệp vụ và không tạo số hồ sơ.',
  'Bạn chỉ thấy bản trình của mình. Admin duyệt hoặc từ chối; nếu từ chối sẽ có ghi chú lý do.',
], [
  ['Bấm Gửi bản trình báo thiếu thông tin', 'Điền Tiêu đề và chọn ít nhất một bản scan (PDF, JPEG hoặc PNG).'],
  ['Bản trình bị từ chối', 'Mở bản trình xem ghi chú của Admin, chỉnh lại rồi gửi bản trình mới.'],
]);
await go('/dms/trinh-duyet', thv.page);
await gt.shot(thv.page, { title: 'Trình / Duyệt: danh sách bản trình của tôi', note: 'Bạn chỉ thấy bản trình do mình gửi. Bấm "+ Trình mới" để gửi bản trình mới.', marks: [
  { loc: thv.page.getByRole('button', { name: '+ Trình mới' }), text: 'Bấm "+ Trình mới" để gửi bản trình' },
  { loc: thv.page.getByRole('link', { name: 'Chờ duyệt' }).or(thv.page.getByRole('button', { name: 'Chờ duyệt' })).first(), text: 'Lọc theo trạng thái: Chờ duyệt, Đã duyệt, Từ chối' },
] });
await thv.page.getByRole('button', { name: '+ Trình mới' }).click(); await thv.page.waitForTimeout(700);
await thv.page.getByLabel('Tiêu đề').fill(`${TAG}Đề nghị cấp bản sao vi bằng${REAL ? ' số 07/2026' : ' ' + stamp}`);
await thv.page.getByLabel('Mô tả').fill('Khách hàng đề nghị cấp 02 bản sao vi bằng số 035/2026/VB-TPL.');
await thv.page.locator('input[name=files]').setInputFiles(SCAN);
await gt.shot(thv.page, { title: 'Hộp thoại Trình mới', note: 'Điền tiêu đề, mô tả và chọn bản scan (PDF, JPEG hoặc PNG) rồi bấm Gửi bản trình. Không cần chọn loại hay từ khóa.',
  detail: ['Tiêu đề: tóm tắt đề nghị trong một dòng.', 'Mô tả: nêu rõ việc cần Admin xem xét.', 'Bản scan: có thể chọn nhiều tệp.'],
  marks: [
    { loc: thv.page.getByLabel('Tiêu đề'), text: 'Tiêu đề bản trình' },
    { loc: thv.page.getByLabel('Mô tả'), text: 'Mô tả đề nghị' },
    { loc: thv.page.locator('input[name=files]'), text: 'Chọn bản scan đính kèm' },
    { loc: thv.page.getByRole('button', { name: 'Gửi bản trình' }), text: 'Gửi bản trình lên Admin' },
  ] });
await thv.page.getByRole('button', { name: 'Gửi bản trình' }).click(); await thv.page.waitForTimeout(2500);
await go('/dms/trinh-duyet', thv.page);
await gt.shot(thv.page, { title: 'Bản trình vừa gửi ở trạng thái Chờ duyệt', note: 'Bản trình hiện trong danh sách với trạng thái Chờ duyệt. Khi Admin duyệt hoặc từ chối, trạng thái đổi theo và bạn nhận thông báo.',
  marks: [{ loc: thv.page.locator('tbody tr', { hasText: REAL ? 'số 07/2026' : '[guide]' }).first(), text: 'Bản trình vừa gửi: đang chờ duyệt' }] });
await go('/dms/trinh-duyet');
await g.shot(page, { title: 'Hàng chờ duyệt của Admin', note: 'Admin thấy bản trình của mọi người. Huy hiệu đỏ trên thanh bên cho biết số bản đang chờ.',
  marks: [
    { loc: page.getByRole('link', { name: /Trình \/ Duyệt/ }).first(), text: 'Thanh bên: số bản trình đang chờ duyệt' },
    { loc: page.locator('tbody tr', { hasText: REAL ? 'số 07/2026' : '[guide]' }).first(), text: 'Bản trình cần xem' },
  ] });
await page.locator('tbody tr', { hasText: REAL ? 'số 07/2026' : '[guide]' }).first().getByRole('link').first().click(); await page.waitForTimeout(1500);
await page.locator('textarea[name=note]').fill('Đã đối chiếu với hồ sơ, hợp lệ.');
await g.shot(page, { title: 'Xem bản trình và quyết định', note: 'Xem thông tin người gửi và bản scan ngay trong trang. Nhập ghi chú rồi bấm Duyệt hoặc Từ chối.',
  detail: ['Ghi chú: bắt buộc khi từ chối, tùy chọn khi duyệt.', 'Thêm scan: bổ sung bản scan cho bản trình nếu còn thiếu.', 'Xóa scan: chỉ người có quyền xóa scan mới thấy nút này.'],
  marks: [
    { loc: page.locator('textarea[name=note]'), text: 'Ghi chú (bắt buộc khi từ chối)' },
    { loc: page.getByRole('button', { name: 'Duyệt', exact: true }), text: 'Duyệt bản trình' },
    { loc: page.getByRole('button', { name: 'Từ chối', exact: true }), text: 'Từ chối bản trình (phải có ghi chú)' },
    { loc: page.getByRole('link', { name: 'Xem', exact: true }).first(), text: 'Xem bản scan của bản trình' },
  ] });
await page.getByRole('button', { name: 'Duyệt', exact: true }).click(); await page.waitForTimeout(2500);
await g.shot(page, { title: 'Bản trình đã duyệt', note: 'Trạng thái chuyển sang Đã duyệt, kèm người duyệt, thời điểm và ghi chú. Bản trình đã quyết định không duyệt lại được.', marks: [] });

// ---------- Sửa sau ghi sổ, xóa scan ----------
await go('/dms/vi-bang');
const row = page.locator('tbody tr', { hasText: REAL ? 'thỏa thuận mua bán nhà' : '[guide]' }).first();
const caseHref = await row.getByRole('link', { name: 'Xem' }).first().getAttribute('href');
await go(caseHref);
g.section('DMS · Admin sửa hồ sơ đã ghi sổ', 'Hồ sơ đã lưu chính thức không sửa trực tiếp. Chỉ Admin sửa được nội dung, bắt buộc nêu lý do; mỗi lần sửa tạo một phiên bản mới, bản gốc khi ghi sổ vẫn được giữ.', [
  'Số hồ sơ (STT) giữ nguyên khi sửa. Hồ sơ không bao giờ bị xóa.',
  'Mọi lần sửa đều ghi người sửa, thời điểm, lý do trong Lịch sử hoạt động.',
  'Nhân viên khác chỉ tải thêm scan, không sửa được.',
], [
  ['Bấm Lưu thay đổi nhưng báo thiếu lý do', 'Ô Lý do sửa là bắt buộc. Nêu rõ chỗ sửa và vì sao.'],
  ['Cần xem nội dung trước khi sửa', 'Mở tab Phiên bản cũ để xem bản gốc và các bản sửa trước đó.'],
]);
await g.shot(page, { title: 'Nút "Sửa hồ sơ (Admin)"', note: 'Chỉ Admin thấy nút này trên hồ sơ đã ghi sổ. Bấm để mở hộp thoại sửa.',
  marks: [{ loc: page.getByRole('button', { name: /Sửa hồ sơ \(Admin\)/ }), text: 'Sửa hồ sơ (chỉ Admin)' }] });
await page.getByRole('button', { name: /Sửa hồ sơ \(Admin\)/ }).click(); await page.waitForTimeout(700);
await page.locator('[role=dialog] [name=ghi_chu]').fill('Đã bổ sung ghi chú theo đề nghị của khách.');
await page.locator('textarea[name=reason]').fill('Bổ sung ghi chú theo đề nghị của người yêu cầu.');
await g.shot(page, { title: 'Hộp thoại Sửa hồ sơ (Admin)', note: 'Sửa các ô cần thiết, bắt buộc nhập Lý do sửa, rồi bấm Lưu thay đổi. Hệ thống lưu thành phiên bản mới.',
  marks: [
    { loc: page.locator('[role=dialog] [name=title]'), text: 'Tên hồ sơ' },
    { loc: page.locator('[role=dialog] [name=ghi_chu]'), text: 'Ô cần sửa (ví dụ Ghi chú)' },
    { loc: page.locator('textarea[name=reason]'), text: 'Lý do sửa (bắt buộc)' },
    { loc: page.getByRole('button', { name: 'Lưu thay đổi' }), text: 'Lưu thành phiên bản mới' },
  ] });
await page.getByRole('button', { name: 'Lưu thay đổi' }).click(); await page.waitForTimeout(2500);
await go(caseHref.split('?')[0] + '?tab=phien-ban');
await g.shot(page, { title: 'Tab Phiên bản cũ: bản gốc và bản sửa', note: 'Mỗi lần Admin sửa tạo thêm một dòng: bản gốc khi ghi sổ và các bản sửa kèm người sửa, thời điểm và lý do.',
  marks: [{ loc: page.getByRole('link', { name: /^Phiên bản cũ/ }).first(), text: 'Tab Phiên bản cũ' }] });

g.section('DMS · Xóa scan và mục Scan đã xóa', 'Chỉ file scan xóa được; hồ sơ, số hồ sơ và dòng sổ vẫn còn nguyên. File bị xóa chuyển vào mục "Scan đã xóa 30 ngày", chỉ Admin xem và tải được.', [
  'Cần quyền riêng "xóa scan" do Admin cấp. Quyền này không nằm trong nhóm quyền mặc định.',
  'Bắt buộc nêu lý do xóa. Sau 30 ngày file bị xóa hẳn khỏi kho và không khôi phục được.',
  'Nếu cần giữ lại, Admin tải file về từ mục Scan đã xóa trong vòng 30 ngày.',
], [
  ['Không thấy nút Xóa scan', 'Bạn chưa được cấp quyền xóa scan. Nhờ Admin cấp quyền riêng cho đúng người, đúng thời gian cần.'],
  ['Xóa nhầm file', 'Vào Scan đã xóa, tải file về (còn trong 30 ngày) rồi tải lên lại ở tab Tài liệu.'],
]);
await go(caseHref.split('?')[0] + '?tab=tai-lieu');
await page.getByRole('button', { name: 'Xóa scan' }).first().click(); await page.waitForTimeout(700);
await page.locator('textarea[name=reason]').fill('Scan nhầm trang, sẽ tải lại bản đúng.');
await g.shot(page, { title: 'Hộp thoại Xóa file scan', note: 'Đọc kỹ ba lưu ý trong hộp thoại, nhập lý do rồi bấm Xóa scan. Hồ sơ và dòng sổ không bị ảnh hưởng.',
  marks: [
    { loc: page.locator('textarea[name=reason]'), text: 'Lý do xóa (bắt buộc)' },
    { loc: page.getByRole('button', { name: 'Hủy', exact: true }), text: 'Hủy: không xóa' },
    { loc: page.getByRole('button', { name: 'Xóa scan' }).last(), text: 'Xóa scan: file chuyển vào Scan đã xóa 30 ngày' },
  ] });
await page.getByRole('button', { name: 'Xóa scan' }).last().click(); await page.waitForTimeout(2500);
await go('/dms/scan-da-xoa');
await g.shot(page, { title: 'Mục Scan đã xóa 30 ngày', note: 'Liệt kê file đã xóa kèm hồ sơ gốc, người xóa, ngày xóa, lý do và số ngày còn lại. Bấm Tải để lấy lại file trong thời hạn.',
  detail: ['Cột Còn lại: số ngày đến khi file bị xóa hẳn khỏi kho.', 'Cột Tải: tải file về máy (chỉ Admin).'],
  marks: [{ loc: page.locator('tbody tr').first(), text: 'File vừa xóa: xem lý do, người xóa, còn bao nhiêu ngày' }, { loc: page.getByRole('link', { name: 'Tải' }).first(), text: 'Tải file về máy', optional: true }] });

// ---------- Lịch sử hoạt động ----------
g.section('DMS · Lịch sử hoạt động', 'Nhật ký mọi thay đổi quan trọng trên hồ sơ, tài liệu, tệp scan, bản trình và phân quyền: ai làm, lúc nào, làm gì. Chỉ Admin xem được.', [
  'Nhật ký chỉ ghi thêm, không sửa, không xóa.',
]);
await go('/dms/lich-su');
await g.shot(page, { title: 'Lịch sử hoạt động', note: 'Chọn nhóm bằng các nút phía trên, hoặc gõ số hồ sơ, tên người, từ khóa vào ô tìm. Bấm vào tên đối tượng để mở thẳng hồ sơ.',
  detail: ['Thời gian, Người làm, Hoạt động, Đối tượng, Chi tiết: mỗi dòng là một thao tác.', 'Nhóm: Hồ sơ, Tài liệu, Tệp & scan, Trình / Duyệt, Phân quyền.'],
  marks: [
    { loc: page.getByRole('link', { name: 'Tệp & scan' }).first(), text: 'Lọc theo nhóm hoạt động' },
    { loc: page.getByPlaceholder(/Tìm/).first(), text: 'Tìm theo số hồ sơ, người làm hoặc từ khóa' },
    { loc: page.locator('tbody tr').first(), text: 'Một thao tác: người làm, hoạt động, đối tượng, chi tiết' },
  ] });
g.save(); gt.save(); await b.close(); console.log('done', g.n, gt.n);
