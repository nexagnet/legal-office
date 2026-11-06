import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
// Admin: các màn Quản trị (tài khoản, nhóm quyền, chi nhánh, thẻ THV, email, lịch, hồ sơ lao động, cài đặt, báo cáo, vật tư). Chỉ xem và mở hộp thoại, KHÔNG lưu gì. Chạy với APPEND=1.
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

g.section('Quản trị · Tài khoản', 'Admin tạo tài khoản cho thành viên văn phòng: họ tên, email, số CCCD (không bắt buộc) và mật khẩu ban đầu. Quyền không nằm ở đây mà ở mục Nhóm quyền. Mọi màn quản trị nằm trong nhóm QUẢN TRỊ của thanh bên (Tài khoản, Nhóm quyền, Chi nhánh, Cài đặt văn phòng).', [
  'Mỗi người một tài khoản riêng. Đăng nhập bằng email hoặc số CCCD cùng mật khẩu; quên mật khẩu thì dùng liên kết "Quên mật khẩu" ở màn đăng nhập (link đặt lại gửi qua email).',
  'Mật khẩu ban đầu tối thiểu 12 ký tự; người dùng phải đổi mật khẩu ngay ở lần đăng nhập đầu.',
  'Tài khoản vừa tạo chưa có quyền gì cho tới khi được xếp vào nhóm quyền.',
], [
  ['Người mới đăng nhập được nhưng không thấy gì', 'Chưa được xếp vào nhóm quyền: mở Nhóm quyền rồi bấm Gán nhóm quyền (thẻ Chưa có quyền lọc ra những người này).'],
  ['Cần đổi họ tên hiển thị', 'Bấm Sửa tên ở dòng thành viên.'],
  ['Người dùng quên mật khẩu', 'Họ tự bấm Quên mật khẩu ở màn đăng nhập; Admin cũng có thể đặt lại mật khẩu cho họ, khi đó họ phải đổi mật khẩu ở lần đăng nhập kế tiếp.'],
]);
await go('/quan-tri/nhan-su');
await g.shot(page, { title: 'Tài khoản: danh sách thành viên', note: 'Các thẻ Tất cả, Chưa có quyền, Tạm khóa lọc nhanh theo trạng thái; số đếm hiện bên cạnh.',
  detail: ['Dãy mục bên trái (Tài khoản, Nhóm quyền, Chi nhánh, Cài đặt văn phòng) là các màn quản trị.', '+ Thêm thành viên: tạo tài khoản mới.', 'Xem quyền hiệu lực: mở chi tiết quyền thực sự của người đó.', 'Sửa tên: đổi họ tên hiển thị.'],
  marks: [
    { loc: R('Nhóm quyền', { exact: true }), text: 'Các mục quản trị khác (Nhóm quyền, Chi nhánh, Cài đặt văn phòng)' },
    { loc: R(/Chưa có quyền/), text: 'Lọc: thành viên chưa được xếp vào nhóm quyền' },
    { loc: page.getByPlaceholder(/Tìm thành viên/), text: 'Tìm theo tên hoặc email' },
    { loc: R('+ Thêm thành viên'), text: 'Thêm thành viên mới' },
    { loc: R(/Xem quyền hiệu lực/), text: 'Xem quyền hiệu lực của người này' },
    { loc: R('Sửa tên'), text: 'Đổi họ tên hiển thị' },
  ] });
await R('+ Thêm thành viên').click(); await page.waitForTimeout(1500);
await g.shot(page, { title: 'Thêm thành viên mới', note: 'Điền họ tên, email, CCCD (nếu có), mật khẩu ban đầu và nhập lại; chọn nhóm quyền và quyền chi tiết (tùy chọn) rồi bấm tạo. Tài khoản có hiệu lực ngay, không cần ai duyệt.',
  detail: ['Số CCCD: 12 chữ số, không trùng tài khoản khác. Có CCCD thì đăng nhập được bằng CCCD.', 'Mật khẩu ban đầu: tối thiểu 12 ký tự; người dùng đổi ở lần đăng nhập đầu.', 'Nhóm quyền: tích nhóm cần xếp người này vào. Quyền chi tiết (tùy chọn) thêm hoặc bỏ riêng từng quyền.'],
  marks: [
    { loc: page.getByLabel('Họ và tên'), text: 'Họ và tên' },
    { loc: page.getByLabel(/Email đăng nhập/), text: 'Email đăng nhập (cũng là nơi nhận link đặt lại mật khẩu)' },
    { loc: page.getByLabel(/Số CCCD/), text: 'Số CCCD 12 chữ số (không bắt buộc)' },
    { loc: page.getByLabel(/Mật khẩu ban đầu/), text: 'Mật khẩu ban đầu, tối thiểu 12 ký tự' },
    { loc: page.getByLabel('Nhập lại mật khẩu'), text: 'Nhập lại mật khẩu' },
  ] });

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
    { loc: page.locator('select[name=branch]'), text: 'Chọn chi nhánh đích', optional: true },
    { loc: R(/Gắn chi nhánh/), text: 'Gắn các hồ sơ đã chọn vào chi nhánh', optional: true },
  ] });

g.section('Quản trị · Nhóm quyền và phân quyền', 'Quyền của mỗi người = các nhóm quyền người đó thuộc + quyền thêm hoặc bỏ riêng. Chỉ Admin tạo nhóm, đổi quyền của nhóm, xếp người vào nhóm và đặt quyền riêng. Mọi thay đổi có hiệu lực ngay (không còn đề xuất và duyệt) và được ghi vào Lịch sử hoạt động, nhóm Phân quyền.', [
  'Nhóm "Admin" là nhóm hệ thống: không xóa, không ngừng dùng, không đổi quyền; người thuộc nhóm Admin và tài khoản Admin không đặt được quyền riêng.',
  'Mỗi thay đổi cần ghi lý do ngắn (bắt buộc, trừ khi Admin tự đổi quyền riêng của chính mình thì không cần).',
  'Quyền "xóa scan" chỉ cấp riêng cho từng người, không nằm trong nhóm quyền.',
]);
await go('/quan-tri/phan-quyen?tab=nhom');
await g.shot(page, { title: 'Nhóm quyền: danh sách nhóm', note: 'Mỗi nhóm cho biết số quyền, số thành viên và trạng thái. Bấm tên nhóm để xem và sửa; bấm "+ Tạo nhóm quyền" để tạo nhóm mới hoặc sao chép từ nhóm mẫu.',
  marks: [
    { loc: R('+ Tạo nhóm quyền'), text: 'Tạo nhóm quyền mới hoặc sao chép nhóm mẫu', optional: true },
    { loc: page.getByRole('link', { name: /Nhật ký phân quyền/ }).first(), text: 'Nhật ký phân quyền (mở Lịch sử hoạt động)', optional: true },
  ] });
await go('/quan-tri/phan-quyen');
await g.shot(page, { title: 'Người dùng và quyền hiệu lực', note: 'Mỗi dòng là một thành viên với nhóm quyền, phạm vi và tình trạng tài khoản. Bấm Xem để mở chi tiết; "Gán nhóm quyền" xếp người vào nhóm.',
  marks: [
    { loc: R('Gán nhóm quyền'), text: 'Xếp thành viên vào một nhóm quyền', optional: true },
    { loc: page.getByPlaceholder(/Tìm thành viên/), text: 'Tìm thành viên' },
    { loc: page.getByRole('link', { name: /Xem ›/ }).first(), text: 'Mở chi tiết quyền của người này' },
  ] });
await page.getByRole('link', { name: /Xem ›/ }).nth(1).click(); await page.waitForURL(/\/nguoi-dung\//, { timeout: 30000 }); await page.waitForTimeout(1500);
const detailUrl = page.url();
await g.shot(page, { title: 'Chi tiết một tài khoản: Quyền', note: 'Ba thẻ: Quyền, Thẻ thừa hành viên, Hồ sơ lao động. Thẻ Quyền cho thấy nhóm đang áp dụng, quyền hiệu lực theo nghiệp vụ và chi nhánh được xem.',
  detail: ['Nhóm quyền đang áp dụng: các nhóm người này thuộc.', 'Đổi nhóm quyền: xếp vào hoặc gỡ khỏi nhóm, có hiệu lực ngay.', 'Tạm khóa tài khoản: chặn đăng nhập mà không xóa dữ liệu.', 'Cấp chi nhánh: người này chỉ thấy hồ sơ của chi nhánh được cấp (hồ sơ do chính họ tạo luôn thấy).'],
  marks: [
    { loc: R('Tạm khóa tài khoản'), text: 'Tạm khóa tài khoản' },
    { loc: R('Đổi nhóm quyền'), text: 'Đổi nhóm quyền của người này (áp dụng ngay)' },
    { loc: R('Thẻ thừa hành viên'), text: 'Thẻ thừa hành viên của người này' },
    { loc: R('Hồ sơ lao động'), text: 'Hồ sơ lao động của người này', optional: true },
  ] });
await R('Đổi nhóm quyền').click(); await page.waitForTimeout(1500);
await g.shot(page, { title: 'Đổi nhóm hoặc quyền', note: 'Chọn loại thay đổi (gán nhóm, gỡ khỏi nhóm, thêm quyền vào nhóm, thu hồi quyền khỏi nhóm), chọn nhóm, chọn thành viên, xem trước rồi ghi lý do và áp dụng. Không còn bước chờ người thứ hai duyệt.',
  marks: [{ loc: page.getByRole('button', { name: /Gán nhóm quyền/ }).first(), text: 'Loại thay đổi', optional: true }] });
await page.goto(detailUrl, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
await page.getByText(/Quyền riêng|Quyền chi tiết/).first().scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(500);
await g.shot(page, { title: 'Quyền riêng của người này', note: 'Bảng 7 nghiệp vụ x 6 hành động (phạm vi: của tôi tạo hoặc toàn văn phòng) cộng 8 quyền đặc biệt. Tích để thêm riêng, bỏ tích để bỏ riêng một quyền mà không đổi nhóm.',
  detail: ['Lưu quyền riêng: ghi lại quyền thêm hoặc bỏ riêng, kèm lý do, ghi vào nhật ký.', 'Quay về đúng theo nhóm: xóa mọi quyền riêng.'],
  marks: [
    { loc: R('Lưu quyền riêng'), text: 'Lưu quyền riêng của người này', optional: true },
    { loc: R('Quay về đúng theo nhóm'), text: 'Bỏ hết quyền riêng, quay về đúng theo nhóm', optional: true },
  ] });
await go('/dms/lich-su?group=permission');
await g.shot(page, { title: 'Nhật ký phân quyền trong Lịch sử hoạt động', note: 'Mọi lần đổi nhóm, quyền, quyền riêng, chi nhánh được ghi tại Lịch sử hoạt động, thẻ Phân quyền. Ai có quyền xuất nhật ký thấy nút "Xuất bản sao".',
  marks: [{ loc: R('Xuất bản sao'), text: 'Xuất bản sao nhật ký phân quyền', optional: true }, { loc: R('Phân quyền', { exact: true }), text: 'Thẻ lọc nhóm hoạt động Phân quyền', optional: true }] });

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

g.section('Quản trị · Email gửi thư (SMTP)', 'Cấu hình hộp thư hệ thống dùng để gửi liên kết đặt lại mật khẩu và nhắc hạn cho nhân viên.', [
  'Mật khẩu SMTP được mã hóa khi lưu và không bao giờ hiện lại trên màn hình.',
  'Sau khi lưu nên bấm "Gửi thư thử" để chắc thư gửi được.',
], [
  ['Thư thử không đến', 'Kiểm tra máy chủ, cổng, TLS/SSL đúng nhà cung cấp; với Gmail dùng mật khẩu ứng dụng, không dùng mật khẩu đăng nhập.'],
]);
await go('/quan-tri/email');
await g.shot(page, { title: 'Máy chủ gửi thư (SMTP)', note: 'Điền thông tin do nhà cung cấp email cung cấp. Có thể gửi thư thử tới chính bạn để kiểm tra.',
  detail: ['Máy chủ và Cổng: ví dụ smtp.gmail.com, cổng 465.', 'Kết nối mã hóa TLS/SSL: tích khi dùng cổng 465.', 'Tài khoản và Mật khẩu SMTP: tài khoản gửi thư.', 'Địa chỉ người gửi: địa chỉ hiện ở thư gửi đi.'],
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
await go('/quan-tri/cai-dat');
await g.shot(page, { title: 'Cấu hình văn phòng', note: 'Điền đúng thông tin pháp lý, bấm Lưu thay đổi. Phần Quy tắc số cho biết cách đánh số hồ sơ; nút "Nhập số cuối" dùng khi chuyển từ sổ giấy sang phần mềm.',
  marks: [
    { loc: page.locator('[name=legalName]'), text: 'Đơn vị pháp lý (tên đầy đủ)' },
    { loc: page.locator('[name=displayName]'), text: 'Tên hiển thị trên văn bản' },
    { loc: R('Lưu thay đổi'), text: 'Lưu thay đổi', optional: true },
    { loc: R('Nhập số cuối'), text: 'Nhập số cuối của sổ giấy', optional: true },
  ] });

g.section('Quản trị · Báo cáo', 'Báo cáo tổng hợp cho số liệu theo mẫu N-09, N-10.', [
  'Mỗi đơn vị tính riêng, không cộng chéo giữa các nghiệp vụ.',
]);
await go('/dms/bao-cao');
await g.shot(page, { title: 'Báo cáo tổng hợp (N-09, N-10)', note: 'Số liệu tổng hợp theo hai mẫu báo cáo. Nút Sao chép ở từng chỉ tiêu giúp chép con số sang văn bản báo cáo.',
  marks: [{ loc: R(/N-10/), text: 'Chuyển giữa mẫu N-09 và N-10' }, { loc: R(/Sao chép/), text: 'Sao chép số liệu', optional: true }] });

g.section('Quản trị · Vật tư văn phòng', 'Theo dõi tồn kho văn phòng phẩm: nhập, xuất, kiểm kê và ngưỡng cảnh báo sắp hết.', [
  'Xuất vượt tồn bị chặn. Điều chỉnh sau kiểm kê cần Trưởng văn phòng duyệt.',
]);
await go('/vat-tu');
await g.shot(page, { title: 'Vật tư: tồn kho', note: 'Thẻ Tồn kho cho thấy số lượng hiện có của từng mặt hàng. "Đặt ngưỡng" để hệ thống báo Sắp hết khi dưới mức đặt.',
  marks: [
    { loc: R('Nhập / xuất'), text: 'Ghi nhập hoặc xuất kho', optional: true },
    { loc: R('Thêm tác vụ vật tư'), text: 'Thêm tác vụ vật tư', optional: true },
    { loc: page.getByPlaceholder(/Tìm theo tên vật tư/), text: 'Tìm theo tên vật tư', optional: true },
    { loc: R('Đặt ngưỡng'), text: 'Đặt ngưỡng cảnh báo sắp hết', optional: true },
  ] });
g.save(); await b.close(); console.log('done', g.n);
