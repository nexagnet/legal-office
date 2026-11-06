import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
// Phần chung cho mọi vai (đăng nhập, bố cục, đọc danh sách, tìm kiếm, thông báo, điện thoại). Chụp bằng vai THV.
const b = await browser();
const g = new Guide('chung', 'Phần chung cho mọi vai');
const { page } = await asRole(b, 'THV');
const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(900); };

// 1. Đăng nhập (chưa có phiên)
const anon = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const lp = await anon.newPage();
await lp.goto(BASE + '/login', { waitUntil: 'networkidle' }); await lp.waitForTimeout(600);
g.section('Đăng nhập', 'Mở địa chỉ hệ thống do Văn phòng cung cấp. Mỗi người dùng một tài khoản riêng, không dùng chung.', [
  'Sai mật khẩu quá 5 lần liên tiếp thì tài khoản bị khóa 15 phút. Đợi hết thời gian hoặc nhờ Admin hỗ trợ.',
  'Không chia sẻ mật khẩu. Mọi thao tác trên hồ sơ đều ghi tên người đăng nhập.',
  'Lần đăng nhập đầu (hoặc sau khi Admin đặt lại mật khẩu) hệ thống bắt đổi mật khẩu mới, tối thiểu 12 ký tự, rồi mới dùng tiếp.',
], [
  ['Báo "Email, số CCCD hoặc mật khẩu không đúng"', 'Kiểm tra gõ đúng email hoặc số CCCD Văn phòng cấp, tắt Caps Lock. Mật khẩu phân biệt chữ hoa và chữ thường.'],
  ['Quên mật khẩu', 'Bấm "Quên mật khẩu" ở màn đăng nhập, nhập email; hệ thống gửi link đặt lại vào email của tài khoản. Cũng có thể nhờ Admin đặt lại.'],
  ['Báo tài khoản bị khóa tạm thời', 'Đã nhập sai quá 5 lần. Đợi 15 phút rồi thử lại, hoặc nhờ Admin.'],
  ['Vào được nhưng thiếu mục trên thanh bên', 'Mỗi vai chỉ thấy mục thuộc vai của mình. Cần thêm quyền thì nhờ Admin.'],
]);
await g.shot(lp, { title: 'Màn hình đăng nhập', note: 'Đăng nhập bằng email hoặc số CCCD cùng mật khẩu. Quên mật khẩu thì dùng liên kết bên dưới để nhận link đặt lại qua email.',
  detail: ['Email hoặc số CCCD: nhập địa chỉ email Văn phòng đã cấp, hoặc số CCCD 12 chữ số nếu đã được ghi vào tài khoản.', 'Mật khẩu: do Admin cấp lần đầu (tối thiểu 12 ký tự); phân biệt chữ hoa và chữ thường.', 'Quên mật khẩu: nhận link đặt lại qua email của tài khoản.'],
  marks: [
    { loc: lp.getByLabel('Email hoặc số CCCD'), text: 'Nhập email hoặc số CCCD do Văn phòng cấp' },
    { loc: lp.getByLabel('Mật khẩu'), text: 'Nhập Mật khẩu' },
    { loc: lp.getByRole('button', { name: 'Đăng nhập', exact: true }), text: 'Bấm Đăng nhập để vào hệ thống' },
    { loc: lp.getByRole('link', { name: 'Quên mật khẩu?' }), text: 'Quên mật khẩu: nhận link đặt lại qua email' },
  ] });
await lp.getByLabel('Email hoặc số CCCD').fill('khong-ton-tai@example.invalid');
await lp.getByLabel('Mật khẩu').fill('sai-mat-khau-123');
await lp.getByRole('button', { name: 'Đăng nhập', exact: true }).click(); await lp.waitForTimeout(1500);
await g.shot(lp, { title: 'Khi nhập sai email hoặc mật khẩu', note: 'Hệ thống báo lỗi ngay dưới ô nhập và không cho vào. Nhập lại cho đúng; sai quá 5 lần sẽ bị khóa 15 phút.',
  marks: [{ loc: lp.getByRole('alert'), text: 'Thông báo lỗi: kiểm tra lại email hoặc số CCCD và mật khẩu' }] });
await anon.close();

// 2. Bố cục
g.section('Làm quen với màn hình làm việc', 'Mọi màn đều có cùng bố cục: thanh bên trái để chuyển mục, thanh trên cùng để tìm kiếm, nhận thông báo và quản lý tài khoản, vùng giữa là nội dung.', [
  'Thanh bên chia nhóm Công việc, Nghiệp vụ, Văn phòng (Admin có thêm Quản trị). Mỗi người chỉ thấy mục thuộc vai của mình.',
  'Hồ sơ đã lưu chính thức không sửa trực tiếp, không xóa. Mọi thay đổi quan trọng đều lưu người làm, thời điểm và lý do.',
]);
await go('/dms');
await g.shot(page, { title: 'Thanh bên, ô tìm kiếm, chuông thông báo và tài khoản', note: 'Đây là trang Hồ sơ do tôi tạo, điểm bắt đầu của hầu hết các vai.',
  detail: ['Thanh bên: bấm tên mục để chuyển màn. Mục đang mở được tô sáng.', 'Ô Tìm kiếm (hoặc bấm Ctrl K ở bất kỳ màn nào): tìm nhanh hồ sơ và trang.', 'Chuông: mở danh sách thông báo (nhắc hạn, việc được giao).', 'Thẻ tài khoản: xem tên, vai, đăng xuất.'],
  marks: [
    { loc: page.getByRole('link', { name: 'Hồ sơ do tôi tạo' }).first(), text: 'Thanh bên: bấm tên mục để chuyển màn' },
    { loc: page.getByRole('button', { name: 'Tìm kiếm' }).first(), text: 'Ô tìm nhanh (phím tắt Ctrl K)' },
    { loc: page.getByRole('link', { name: 'Thông báo' }).first(), text: 'Chuông thông báo' },
    { loc: page.getByRole('button', { name: /Tài khoản/ }).first(), text: 'Thẻ tài khoản: tên, vai, đăng xuất' },
    { loc: page.getByRole('button', { name: 'Thu gọn thanh bên' }), text: 'Thu gọn thanh bên cho màn rộng hơn' },
  ] });
await page.getByRole('button', { name: 'Thu gọn thanh bên' }).click(); await page.waitForTimeout(600);
await g.shot(page, { title: 'Thanh bên đã thu gọn', note: 'Thanh bên thu thành một cột biểu tượng để vùng làm việc rộng hơn. Di chuột vào biểu tượng để xem tên mục; bấm nút mũi tên để mở lại. Máy nhớ lựa chọn của bạn.',
  marks: [{ loc: page.getByRole('button', { name: /Mở rộng|Thu gọn/ }), text: 'Bấm lại để mở rộng thanh bên' }] });
await page.getByRole('button', { name: /Mở rộng thanh bên|Thu gọn thanh bên/ }).dispatchEvent('click'); await page.waitForTimeout(400);

// 3. Đọc danh sách
g.section('Đọc và lọc danh sách hồ sơ', 'Bốn nghiệp vụ (Vi bằng, Tống đạt, Xác minh điều kiện THA, Tổ chức thi hành án) dùng chung một kiểu danh sách. Học một lần dùng cho cả bốn.', [
  'Danh sách chỉ hiện hồ sơ trong phạm vi quyền của bạn.',
  'Hồ sơ Nháp và Đã hủy nằm ở tab riêng, không lẫn vào Chính thức.',
], [
  ['Không thấy hồ sơ cần tìm', 'Kiểm tra đang đứng ở tab nào (Chính thức, Nháp, Đã hủy), bỏ bớt bộ lọc, chọn đúng Năm. Hồ sơ ngoài phạm vi quyền sẽ không hiện.'],
  ['Cột bị thiếu hoặc quá chật', 'Bấm Cột hiển thị để bật/tắt cột, hoặc bấm Hiển thị gọn để thu hàng.'],
]);
await go('/dms/vi-bang');
await g.shot(page, { title: 'Danh sách hồ sơ: tab, bộ lọc và ô tìm', note: 'Mỗi dòng là một hồ sơ. Dòng trên cùng là các tab trạng thái; bên dưới là thanh bộ lọc.',
  detail: ['Tab Chính thức: hồ sơ đã ghi sổ. Thiếu scan / Đủ scan: lọc theo tình trạng bản scan. Nháp và Đã hủy: có số hồ sơ đếm trong ngoặc.', 'Ô tìm: gõ số văn bản, tên người, trích yếu hoặc nội dung rồi bấm Tìm.', 'Năm: chọn năm ghi sổ cần xem. Loại tài liệu, Người tạo, Đơn vị, Tình trạng scan: thu hẹp danh sách.'],
  marks: [
    { loc: page.getByRole('link', { name: /^Chính thức/ }).first(), text: 'Tab trạng thái: Chính thức, Thiếu scan, Đủ scan, Nháp, Đã hủy' },
    { loc: page.getByPlaceholder(/Tìm số văn bản/), text: 'Gõ từ khóa rồi bấm Tìm' },
    { loc: page.locator('select[name=year]'), text: 'Chọn Năm' },
    { loc: page.locator('select[name=loc]'), text: 'Lọc theo Tình trạng scan' },
    { loc: page.getByRole('button', { name: 'Bộ lọc đã lưu' }), text: 'Lưu và mở lại cách lọc hay dùng' },
  ] });
await g.shot(page, { title: 'Bảng hồ sơ: số hồ sơ, SĐT, ô Đã trả kết quả', note: 'Mỗi hồ sơ chính thức có số hồ sơ do hệ thống cấp. Ô tích Đã trả kết quả chỉ để theo dõi, không đổi trạng thái hồ sơ.',
  detail: ['Bấm số hồ sơ để mở hồ sơ.', 'Ô tích Đã trả kết quả: tích khi đã trả kết quả cho khách; số lượng này hiện ở thẻ "Đã trả kết quả" trên Tổng quan.', 'Cột SĐT khách hàng chỉ để liên hệ, không in ra sổ.'],
  marks: [
    { loc: page.getByRole('button', { name: 'Cột hiển thị' }), text: 'Bật/tắt cột hiển thị' },
    { loc: page.getByRole('button', { name: 'Hiển thị gọn' }), text: 'Thu gọn hàng để xem được nhiều dòng hơn' },
    { loc: page.getByRole('checkbox').first(), text: 'Tích khi đã trả kết quả cho khách' },
    { loc: page.locator('tbody a[href*="/dms/vi-bang/"]').first(), text: 'Bấm số hồ sơ để mở hồ sơ' },
  ] });
await page.getByRole('button', { name: 'Bộ lọc đã lưu' }).click(); await page.waitForTimeout(700);
await g.shot(page, { title: 'Bộ lọc đã lưu', note: 'Đặt tên cho cách lọc đang dùng rồi bấm Lưu; lần sau chỉ cần bấm tên bộ lọc. Tối đa 30 bộ lọc.',
  marks: [{ loc: page.getByLabel('Tên bộ lọc'), text: 'Đặt tên rồi bấm Lưu' }] });
await page.keyboard.press('Escape');

// 4. Tìm trong nội dung scan
g.section('Tìm trong nội dung bản scan', 'Hệ thống nhận dạng chữ (OCR) trong các tệp scan sau khi tải lên, thường trong 1 đến 2 phút, để bạn tìm hồ sơ theo nội dung bên trong.', [
  'Kết quả chỉ trỏ về hồ sơ gốc, không sửa gì. Chỉ hiện hồ sơ trong phạm vi quyền của bạn.',
]);
await go('/dms/tim-kiem?q=hop%20dong');
await g.shot(page, { title: 'Tìm trong nội dung scan', note: 'Gõ từ khóa, chọn bộ lọc nếu cần rồi bấm Tìm. Mỗi dòng kết quả là một tệp scan khớp, kèm đoạn trích.',
  detail: ['Kết quả xếp theo độ khớp.', 'Số trong ngoặc ở các bộ lọc là số hồ sơ chính thức của từng lựa chọn.', 'Bấm Mở hồ sơ để vào đúng hồ sơ chứa tệp đó.'],
  marks: [
    { loc: page.getByRole('searchbox').first(), text: 'Từ khóa trong chữ nhận dạng từ bản scan' },
    { loc: page.getByRole('button', { name: 'Tìm', exact: true }), text: 'Bấm Tìm' },
  ] });

// 5. Thông báo
g.section('Thông báo', 'Chuông ở góc trên bên phải gom các thông báo của riêng bạn: nhắc hạn, việc được giao, kết quả duyệt.');
await go('/thong-bao');
await g.shot(page, { title: 'Trang Thông báo', note: 'Chuyển giữa các nhóm bằng các nút chữ phía trên danh sách. Bấm vào thông báo để mở đúng hồ sơ liên quan.',
  marks: [{ loc: page.getByRole('link', { name: 'Thông báo' }).first(), text: 'Chuông thông báo trên thanh trên' }] });

// 5b. Xuất sổ nghiệp vụ và Thư viện biểu mẫu
g.section('Xuất sổ nghiệp vụ', 'Các sổ S-01 (tống đạt), S-02 (lập vi bằng), S-04 (xác minh điều kiện thi hành án), S-05 (thi hành án) được dựng tự động từ hồ sơ đã lưu chính thức. Bạn xem trước rồi xuất PDF để in hoặc Excel.', [
  'Sổ chỉ gồm hồ sơ đã lưu chính thức của năm đang chọn. Bản nháp và hồ sơ đã hủy không vào sổ.',
  'Cột SĐT khách hàng không in ra sổ.',
  'Sổ điện tử hỗ trợ tra cứu và in; sổ giấy chính thức vẫn do văn phòng ký và đóng dấu giáp lai.',
], [
  ['Sổ trống', 'Năm đang chọn chưa có hồ sơ chính thức. Đổi Năm hoặc lưu chính thức hồ sơ trước.'],
  ['Bản xem trước hiện "Đang dựng bản xem trước"', 'Chờ vài giây để hệ thống dựng PDF; nếu lâu, bấm Xem lại.'],
]);
await go('/dms/so');
await g.shot(page, { title: 'Chọn sổ cần xuất', note: 'Mỗi thẻ là một sổ. Bấm "Xem trước và xuất ..." để mở sổ.',
  marks: [{ loc: page.getByRole('link', { name: /Xem trước và xuất S-02/ }), text: 'Mở sổ S-02 (theo dõi việc lập vi bằng)' }, { loc: page.getByRole('link', { name: /Xem trước và xuất S-01/ }), text: 'Các sổ khác: S-01, S-04, S-05', optional: true }] });
await go('/dms/so/s-02');
await page.waitForTimeout(2500);
await g.shot(page, { title: 'Xem trước và xuất sổ S-02', note: 'Chọn Năm, bấm Xem để dựng bản xem trước. Dùng "Xuất PDF để in" hoặc "Xuất Excel" khi cần lưu hoặc in.',
  marks: [
    { loc: page.locator('select[name=year]'), text: 'Chọn Năm của sổ' },
    { loc: page.getByRole('button', { name: 'Xem', exact: true }), text: 'Dựng bản xem trước' },
    { loc: page.getByRole('button', { name: /Xuất PDF để in/ }).or(page.getByRole('link', { name: /Xuất PDF để in/ })).first(), text: 'Xuất PDF để in' },
    { loc: page.getByRole('link', { name: 'Xuất Excel' }), text: 'Xuất Excel', optional: true },
  ] });
g.section('Thư viện biểu mẫu', 'Nơi tra cứu và tải các biểu mẫu (phụ lục) của văn phòng.', [
  'Thư viện chỉ để tải và soạn; việc ký và ban hành vẫn do người có thẩm quyền làm ngoài đời.',
]);
await go('/bieu-mau');
await g.shot(page, { title: 'Thư viện biểu mẫu', note: 'Gõ tên vào ô tìm rồi bấm Tìm. Bấm "Tải về" để lấy biểu mẫu.',
  marks: [
    { loc: page.locator('input[name=q]'), text: 'Tìm biểu mẫu theo tên' }
  ] });

// 6. Điện thoại
const m = await asRole(b, 'THV', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
g.section('Dùng trên điện thoại', 'Trên màn nhỏ (dưới 600 px), mỗi hồ sơ hiện thành một thẻ có đủ nhãn thay cho bảng nhiều cột.');
await m.page.goto(BASE + '/dms/vi-bang', { waitUntil: 'networkidle' }); await m.page.waitForTimeout(900);
await g.shot(m.page, { title: 'Danh sách hồ sơ trên điện thoại', note: 'Mỗi thẻ là một hồ sơ, các thông tin ghi rõ tên trường. Bấm số hồ sơ để mở hồ sơ. Cuộn xuống để xem thẻ tiếp theo.',
  marks: [{ loc: m.page.locator('main a[href*="/dms/vi-bang/"]').first(), text: 'Bấm số hồ sơ để mở hồ sơ' }] });
await m.ctx.close();
g.save(); await b.close(); console.log('done', g.n);
