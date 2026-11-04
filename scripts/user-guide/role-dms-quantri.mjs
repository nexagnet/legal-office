import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
// Admin: các màn Quản trị (nhân sự, chi nhánh, phân quyền, thẻ THV, email, lịch, hồ sơ lao động, cấu hình, báo cáo, vật tư). Chỉ xem và mở hộp thoại, KHÔNG lưu gì. Chạy với APPEND=1.
const b = await browser();
const { page } = await asRole(b, 'ADMIN');
const g = new Guide('admin', 'Hướng dẫn dành cho Admin');
const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(900); };
const R = (name, o = {}) => page.getByRole('button', { name, ...o }).or(page.getByRole('link', { name, ...o })).first();
/** Đánh dấu mọi ô nhập đang hiện trong phạm vi `scope`, lấy chữ nhãn làm chú thích (tối đa `max`). */
const autoMarks = async (scope, max = 8) => {
  const els = await scope.locator('input:not([type=hidden]):not([type=checkbox]),select,textarea').all();
  const marks = [];
  for (const el of els) {
    if (marks.length >= max || !(await el.isVisible().catch(() => false))) continue;
    const label = ((await el.evaluate((e) => e.labels?.[0]?.innerText || e.getAttribute('aria-label') || e.placeholder || e.name || '')) || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    if (label) marks.push({ loc: el, text: `Ô: ${label}` });
  }
  return marks;
};

g.section('Quản trị · Nhân sự và tài khoản', 'Admin tạo tài khoản, đổi tên, xem quyền hiệu lực và khóa/mở khóa thành viên. Mọi màn quản trị nằm trong nhóm QUẢN TRỊ của thanh bên, chuyển qua lại bằng dãy thẻ phía trên.', [
  'Mỗi người một tài khoản riêng, đăng nhập bằng email. Không dùng chung tài khoản.',
  'Cấp quyền và vai theo quy tắc hai người: người đề xuất và người duyệt phải khác nhau.',
], [
  ['Người mới không đăng nhập được', 'Kiểm tra thành viên đã được duyệt chưa (thẻ Chờ duyệt) và đã được gán nhóm quyền chưa (thẻ Chưa có quyền).'],
  ['Cần đổi họ tên hiển thị', 'Bấm Sửa tên ở dòng thành viên.'],
]);
await go('/quan-tri/nhan-su');
await g.shot(page, { title: 'Nhân sự: danh sách thành viên', note: 'Các thẻ Tất cả, Chờ duyệt, Chưa có quyền, Tạm khóa lọc nhanh theo trạng thái; số đếm hiện bên cạnh.',
  detail: ['Dãy thẻ phía trên (Nhân sự, Chi nhánh, Phân quyền, Thẻ THV, Email gửi thư, Lịch làm việc, Hồ sơ lao động) là các màn quản trị.', '+ Thêm thành viên: tạo đề xuất thành viên mới.', 'Xem quyền hiệu lực: mở chi tiết quyền thực sự của người đó.', 'Sửa tên: đổi họ tên hiển thị.'],
  marks: [
    { loc: R('Chi nhánh', { exact: true }), text: 'Các màn quản trị khác (Chi nhánh, Phân quyền, Thẻ THV...)' },
    { loc: R(/Chưa có quyền/), text: 'Lọc: thành viên chưa được gán quyền' },
    { loc: page.getByPlaceholder(/Tìm thành viên/), text: 'Tìm theo tên hoặc email' },
    { loc: R('+ Thêm thành viên'), text: 'Thêm thành viên mới' },
    { loc: R(/Xem quyền hiệu lực/), text: 'Xem quyền hiệu lực của người này' },
    { loc: R('Sửa tên'), text: 'Đổi họ tên hiển thị' },
  ] });
await R('+ Thêm thành viên').click(); await page.waitForTimeout(1500);
await g.shot(page, { title: 'Thêm thành viên mới', note: 'Điền họ tên, email và vai đề nghị. Việc cấp quyền cần người thứ hai duyệt ở màn Phân quyền.', marks: await autoMarks(page.locator('main')) });

g.section('Quản trị · Chi nhánh', 'Chi nhánh (địa điểm hoạt động) quyết định hồ sơ của ai hiện ở đâu. Thành viên chỉ thấy hồ sơ thuộc chi nhánh được cấp.', [
  'Hồ sơ chưa gắn chi nhánh chỉ Admin thấy; gắn chi nhánh để đúng người thấy.',
]);
await go('/quan-tri/chi-nhanh');
await g.shot(page, { title: 'Chi nhánh và hồ sơ chưa gắn chi nhánh', note: 'Phần trên là danh sách địa điểm; phần dưới liệt kê hồ sơ chưa gắn chi nhánh để bạn chọn nhiều hồ sơ rồi gắn một lần.',
  detail: ['+ Thêm địa điểm: tạo chi nhánh mới.', 'Đổi tên: sửa tên chi nhánh.', 'Xem người được cấp: những ai được xem hồ sơ của chi nhánh này.', 'Gắn chi nhánh: tích các hồ sơ, chọn chi nhánh đích rồi bấm nút.'],
  marks: [
    { loc: R('+ Thêm địa điểm'), text: 'Thêm địa điểm (chi nhánh) mới' },
    { loc: R('Đổi tên'), text: 'Đổi tên chi nhánh' },
    { loc: R(/Xem người được cấp/), text: 'Xem ai được cấp chi nhánh này' },
    { loc: page.getByLabel('Chọn tất cả hồ sơ'), text: 'Tích để chọn tất cả hồ sơ chưa gắn', optional: true },
    { loc: page.locator('select[name=branch]'), text: 'Chọn chi nhánh đích' },
    { loc: R(/Gắn chi nhánh/), text: 'Gắn các hồ sơ đã chọn vào chi nhánh' },
  ] });

g.section('Quản trị · Phân quyền', 'Quyền của mỗi người = nhóm quyền + phạm vi (chi nhánh) + quyền cấp riêng. Màn Phân quyền cho xem quyền hiệu lực, quản lý nhóm quyền và duyệt đề xuất.', [
  'Đề xuất cấp hoặc đổi quyền cần người khác duyệt (quy tắc hai người).',
  'Quyền "xóa scan" chỉ cấp riêng cho từng người, không nằm trong nhóm quyền.',
  'Mọi thay đổi quyền ghi vào Nhật ký phân quyền.',
]);
await go('/quan-tri/phan-quyen');
await g.shot(page, { title: 'Phân quyền: người dùng và quyền hiệu lực', note: 'Mỗi dòng là một thành viên với nhóm quyền, phạm vi, tình trạng tài khoản và đề xuất đang chờ. Bấm Xem để mở chi tiết.',
  detail: ['Người dùng & quyền hiệu lực: tổng hợp quyền thực tế.', 'Nhóm quyền: tạo và sửa nhóm.', 'Yêu cầu chờ duyệt: đề xuất cấp quyền chờ người thứ hai duyệt.', 'Nhật ký phân quyền: lịch sử mọi thay đổi.'],
  marks: [
    { loc: page.getByRole('link', { name: /Nhóm quyền/ }).first(), text: 'Quản lý nhóm quyền', optional: true },
    { loc: page.getByRole('link', { name: /Yêu cầu chờ duyệt/ }).first(), text: 'Duyệt đề xuất cấp quyền', optional: true },
    { loc: page.getByPlaceholder(/Tìm thành viên/), text: 'Tìm thành viên' },
    { loc: page.getByRole('link', { name: /Xem ›/ }).first(), text: 'Mở chi tiết quyền của người này' },
  ] });
await page.getByRole('link', { name: /Xem ›/ }).nth(1).click(); await page.waitForTimeout(1500);
console.log('chi tiết phân quyền:', page.url(), JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('main button,main a')].filter(e => e.getClientRects().length).map(e => e.innerText.trim()).filter(Boolean).slice(0, 25))));
await g.shot(page, { title: 'Chi tiết quyền của một người', note: 'Màn này tổng hợp quyền hiệu lực của người đó từ các nhóm quyền. Muốn đổi nhóm quyền thì gửi đề xuất; người thứ hai sẽ duyệt.',
  detail: ['Nhóm quyền đang áp dụng: nhóm hiện tại của người này.', 'Chi nhánh được xem: người này chỉ thấy hồ sơ của các chi nhánh liệt kê ở đây.', 'Tạm khóa tài khoản: chặn đăng nhập tạm thời mà không xóa dữ liệu.', 'Đề xuất thay đổi nhóm quyền: gửi đề xuất cho người thứ hai duyệt.'],
  marks: [
    { loc: R('Tạm khóa tài khoản'), text: 'Tạm khóa tài khoản' },
    { loc: R('Đề xuất thay đổi nhóm quyền'), text: 'Đề xuất đổi nhóm quyền (cần người thứ hai duyệt)' },
    { loc: page.getByText('Nhóm quyền đang áp dụng'), text: 'Nhóm quyền hiện tại' },
    { loc: page.getByText('Chi nhánh được xem'), text: 'Phạm vi chi nhánh được xem' },
  ] });
await R('Lưu quyền riêng').scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, 200)); await page.waitForTimeout(400);
await g.shot(page, { title: 'Quyền chi tiết riêng của người này (ví dụ quyền xóa scan)', note: 'Ô đã tích là quyền đang có. Có thể thêm riêng hoặc bỏ riêng một quyền cho từng người mà không đổi nhóm quyền. Quyền xóa scan chỉ cấp ở đây, không nằm trong nhóm quyền.',
  detail: ['Lưu quyền riêng: ghi lại các quyền thêm hoặc bỏ riêng cho người này (có lý do, ghi vào Nhật ký phân quyền).', 'Quay về đúng theo nhóm: xóa mọi quyền cấp riêng, quyền trở lại đúng theo nhóm quyền.', 'Cấp quyền xóa scan: chỉ cấp cho người thật sự cần và thu hồi khi xong việc.'],
  marks: [
    { loc: R('Lưu quyền riêng'), text: 'Lưu quyền riêng của người này' },
    { loc: R('Quay về đúng theo nhóm'), text: 'Bỏ hết quyền riêng, quay về đúng theo nhóm' },
  ] });

g.section('Quản trị · Thẻ thừa hành viên', 'Mỗi thừa hành viên có số thẻ riêng; số thẻ được ghi vào các sổ và biểu mẫu ở cột Thừa hành viên.', [
  'Thiếu thẻ hoặc thẻ ngừng hiệu lực thì không ghi tên thừa hành viên đó được vào sổ.',
]);
await go('/quan-tri/the-thv');
await g.shot(page, { title: 'Thẻ THV: danh sách và tình trạng', note: 'Thẻ chia theo tình trạng: Còn hiệu lực, Chờ bổ sung, Ngừng hiệu lực. Bấm "Nhập thẻ" để nhập số thẻ cho từng người.',
  marks: [
    { loc: R(/Chờ bổ sung/), text: 'Lọc thẻ còn thiếu thông tin' },
    { loc: page.getByPlaceholder(/Tìm thừa hành viên/), text: 'Tìm thừa hành viên' },
    { loc: R(/Nhập thẻ của/), text: 'Nhập thông tin thẻ cho người này' },
  ] });
await R(/Nhập thẻ của/).click(); await page.waitForTimeout(900);
await g.shot(page, { title: 'Nhập thông tin thẻ', note: 'Thẻ chỉ có hiệu lực khi có quyết định hoặc giấy tờ kèm bản scan. Lưu xong thẻ có hiệu lực ngay, không cần ai xác nhận; ngừng hiệu lực không xóa thẻ hay lịch sử.',
  detail: ['Họ tên trên sổ: tên in ở cột Thừa hành viên của các sổ.', 'Số thẻ: số thẻ thừa hành viên.', 'Số quyết định / giấy tờ và Ngày ban hành quyết định: căn cứ cấp thẻ.', 'Ngày hiệu lực: ngày thẻ bắt đầu có hiệu lực.', 'Bản scan quyết định (bắt buộc): PDF, JPEG hoặc PNG, tối đa 25 MB.'],
  marks: [
    { loc: page.getByLabel('Họ tên trên sổ'), text: 'Họ tên in trên sổ' },
    { loc: page.getByLabel('Số thẻ', { exact: true }), text: 'Số thẻ thừa hành viên' },
    { loc: page.getByLabel(/Số quyết định/), text: 'Số quyết định hoặc giấy tờ làm căn cứ' },
    { loc: page.getByLabel(/Ngày ban hành/), text: 'Ngày ban hành quyết định' },
    { loc: page.getByLabel(/Ngày hiệu lực/), text: 'Ngày thẻ bắt đầu có hiệu lực' },
    { loc: page.locator('input[type=file]').last(), text: 'Bản scan quyết định (bắt buộc)' },
    { loc: R('Lưu thẻ'), text: 'Lưu thẻ' },
  ] });
await page.keyboard.press('Escape');

g.section('Quản trị · Email gửi thư (SMTP)', 'Cấu hình hộp thư hệ thống dùng để gửi liên kết đăng nhập và nhắc hạn cho nhân viên.', [
  'Mật khẩu SMTP được mã hóa khi lưu và không bao giờ hiện lại trên màn hình.',
  'Sau khi lưu nên bấm "Gửi thư thử" để chắc thư gửi được.',
], [
  ['Thư thử không đến', 'Kiểm tra máy chủ, cổng, TLS/SSL đúng nhà cung cấp; với Gmail dùng mật khẩu ứng dụng, không dùng mật khẩu đăng nhập.'],
  ['Muốn tắt đăng nhập bằng liên kết email', 'Bỏ tích "Cho phép đăng nhập bằng link email" rồi lưu.'],
]);
await go('/quan-tri/email');
await g.shot(page, { title: 'Máy chủ gửi thư (SMTP)', note: 'Điền thông tin do nhà cung cấp email cung cấp. Có thể gửi thư thử tới chính bạn để kiểm tra.',
  detail: ['Máy chủ và Cổng: ví dụ smtp.gmail.com, cổng 465.', 'Kết nối mã hóa TLS/SSL: tích khi dùng cổng 465.', 'Tài khoản và Mật khẩu SMTP: tài khoản gửi thư.', 'Địa chỉ người gửi: địa chỉ hiện ở thư gửi đi.', 'Cho phép đăng nhập bằng link email: bật/tắt cho mọi người dùng.'],
  marks: [
    { loc: page.locator('[name=host]'), text: 'Máy chủ gửi thư' },
    { loc: page.locator('[name=port]'), text: 'Cổng' },
    { loc: page.locator('[name=username]'), text: 'Tài khoản SMTP' },
    { loc: page.locator('[name=password]'), text: 'Mật khẩu SMTP (không hiển thị lại)' },
    { loc: page.locator('[name=mailFrom]'), text: 'Địa chỉ người gửi' },
    { loc: R(/Lưu cấu hình/), text: 'Lưu cấu hình' },
    { loc: R(/Gửi thư thử/), text: 'Gửi thư thử để kiểm tra' },
  ] });

g.section('Quản trị · Lịch làm việc và ngày nghỉ', 'Lịch quyết định cách tính hạn theo ngày làm việc: ngày làm việc trong tuần và các ngày nghỉ, lễ.', [
  'Hạn pháp định và nhắc hạn đều tính theo lịch này. Nhập ngày lễ của năm trước khi dùng.',
]);
await go('/quan-tri/lich');
await g.shot(page, { title: 'Lịch làm việc', note: 'Chọn các thứ trong tuần là ngày làm việc, thêm ngày nghỉ lễ, rồi Lưu lịch. Có công cụ Tính hạn để thử.',
  detail: ['Thứ 2 đến CN: bấm để bật/tắt ngày làm việc.', '+ Thêm ngày nghỉ: nhập ngày lễ hoặc nghỉ bù.', 'Tính hạn: nhập Từ ngày và Số ngày làm việc để xem ngày hết hạn.'],
  marks: [
    { loc: R('Thứ 7', { exact: true }), text: 'Bật/tắt ngày làm việc trong tuần' },
    { loc: R('+ Thêm ngày nghỉ'), text: 'Thêm ngày nghỉ, lễ' },
    { loc: R('Lưu lịch'), text: 'Lưu lịch' },
    { loc: page.locator('[name=from]'), text: 'Công cụ Tính hạn: từ ngày' },
    { loc: page.locator('[name=days]'), text: 'Số ngày làm việc' },
    { loc: R('Tính hạn', { exact: true }), text: 'Tính ngày hết hạn' },
  ] });

g.section('Quản trị · Hồ sơ lao động', 'Hồ sơ lao động của nhân sự văn phòng (dùng cho sổ sử dụng lao động).', [
  'Chỉ Admin và Trưởng văn phòng xem được. Không lưu số tiền bảo hiểm, chỉ tình trạng và ghi chú.',
]);
await go('/quan-tri/ho-so-lao-dong');
await g.shot(page, { title: 'Hồ sơ lao động', note: 'Các thẻ lọc theo tình trạng làm việc. Bấm "+ Thêm hồ sơ" để thêm hồ sơ cho nhân sự.', marks: [{ loc: R('+ Thêm hồ sơ'), text: 'Thêm hồ sơ lao động' }, { loc: R(/Đang làm việc/), text: 'Lọc theo tình trạng', optional: true }] });

g.section('Quản trị · Cấu hình văn phòng', 'Thông tin pháp lý của văn phòng in lên biểu mẫu và sổ, cùng quy tắc đánh số hồ sơ.', [
  'Đúng tên pháp lý và địa chỉ là bắt buộc vì in lên biểu mẫu chính thức.',
  'Số cuối của sổ chỉ nhập một lần và chỉ được tăng, để số tiếp theo nối tiếp sổ giấy.',
]);
await go('/cai-dat');
await g.shot(page, { title: 'Cấu hình văn phòng', note: 'Điền đúng thông tin pháp lý, bấm Lưu thay đổi. Phần Quy tắc số cho biết cách đánh số hồ sơ; nút "Nhập số cuối" dùng khi chuyển từ sổ giấy sang phần mềm.',
  marks: [
    { loc: page.locator('[name=legalName]'), text: 'Đơn vị pháp lý (tên đầy đủ)' },
    { loc: page.locator('[name=displayName]'), text: 'Tên hiển thị trên văn bản' },
    { loc: R('Lưu thay đổi'), text: 'Lưu thay đổi' },
    { loc: R('Nhập số cuối'), text: 'Nhập số cuối của sổ giấy', optional: true },
  ] });

g.section('Quản trị · Báo cáo', 'Hai nơi xem báo cáo: Báo cáo hoạt động (số lượng theo khoảng thời gian, chi nhánh) và Báo cáo tổng hợp (số liệu theo mẫu N-09, N-10).', [
  'Mỗi đơn vị tính riêng, không cộng chéo giữa các nghiệp vụ.',
]);
await go('/bao-cao');
await g.shot(page, { title: 'Báo cáo hoạt động', note: 'Chọn khoảng ngày, chi nhánh và cách chia rồi bấm Áp dụng. Chuyển thẻ để xem Vi bằng, Tống đạt/Xác minh/THA, hoặc công văn, vật tư, nhân sự.',
  marks: [
    { loc: page.locator('[name=from]'), text: 'Từ ngày' },
    { loc: page.locator('[name=to]'), text: 'Đến ngày' },
    { loc: page.locator('[name=branchId]'), text: 'Chi nhánh' },
    { loc: page.locator('[name=groupBy]'), text: 'Chia theo' },
    { loc: R('Áp dụng'), text: 'Áp dụng bộ lọc' },
  ] });
await go('/dms/bao-cao');
await g.shot(page, { title: 'Báo cáo tổng hợp (N-09, N-10)', note: 'Số liệu tổng hợp theo hai mẫu báo cáo. Nút Sao chép ở từng chỉ tiêu giúp chép con số sang văn bản báo cáo.',
  marks: [{ loc: R(/N-10/), text: 'Chuyển giữa mẫu N-09 và N-10' }, { loc: R(/Sao chép/), text: 'Sao chép số liệu', optional: true }] });

g.section('Quản trị · Vật tư văn phòng', 'Theo dõi tồn kho văn phòng phẩm: nhập, xuất, kiểm kê và ngưỡng cảnh báo sắp hết.', [
  'Xuất vượt tồn bị chặn. Điều chỉnh sau kiểm kê cần Trưởng văn phòng duyệt.',
]);
await go('/vat-tu');
await g.shot(page, { title: 'Vật tư: tồn kho', note: 'Thẻ Tồn kho cho thấy số lượng hiện có của từng mặt hàng. "Đặt ngưỡng" để hệ thống báo Sắp hết khi dưới mức đặt.',
  marks: [
    { loc: R('Nhập / xuất'), text: 'Ghi nhập hoặc xuất kho' },
    { loc: R('Thêm tác vụ vật tư'), text: 'Thêm tác vụ vật tư' },
    { loc: page.getByPlaceholder(/Tìm theo tên vật tư/), text: 'Tìm theo tên vật tư' },
    { loc: R('Đặt ngưỡng'), text: 'Đặt ngưỡng cảnh báo sắp hết' },
  ] });
g.save(); await b.close(); console.log('done', g.n);
