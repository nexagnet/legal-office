import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
process.env.APPEND = '1';
const C1 = '64ce003a-1556-49f6-a8e1-29294dc4c77b', KH1 = 'ab65caed-9bd6-4c7c-b43d-b24af8162948';
const b = await browser();
const only = process.argv[2];
const run = async (role, slug, title, fn) => {
  if (only && only !== role) return;
  const { page } = await asRole(b, role);
  const g = new Guide(slug, title);
  const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1500); };
  try { await fn({ page, g, go, btn: (n) => page.getByRole('button', { name: n }) }); } catch (e) { console.log('LỖI', slug, String(e).slice(0, 200)); }
  g.save(); console.log(slug, g.n);
};

await run('THU_KY', 'thu-ky', 'Hướng dẫn dành cho Thư ký', async ({ page, g, go, btn }) => {
  g.section('Tống đạt: tạo yêu cầu tống đạt', 'Thư ký, THV, Văn thư và Admin được tạo yêu cầu tống đạt. Một yêu cầu có thể gồm nhiều văn bản; mỗi văn bản có người nhận, địa chỉ và hạn riêng. Việc giao người xử lý do Admin hoặc Trưởng văn phòng làm.', ['Chưa giao người xử lý thì chưa ghi được lần tống đạt.', 'Hạn tống đạt là hạn nhắc, hệ thống không tự đổi trạng thái.']);
  await go('/tong-dat');
  await g.shot(page, { title: 'Danh sách Tống đạt và nút tạo yêu cầu', note: 'Danh sách chỉ tóm tắt; bấm Mở để vào trang chi tiết của từng văn bản.', marks: [{ loc: page.getByText('Tạo yêu cầu tống đạt').first(), text: 'Bấm + Tạo yêu cầu tống đạt' }] });
  await page.getByText('Tạo yêu cầu tống đạt').first().click(); await page.waitForTimeout(1200);
  await page.locator('#wz-requestRef').fill('DEMO-TD-003');
  await g.shot(page, { title: 'Bước 1: nhập mã yêu cầu', note: 'Trình tạo gồm ba bước: Yêu cầu, Người nhận, Xác nhận.', marks: [{ loc: page.locator('#wz-requestRef'), text: 'Nhập Mã yêu cầu' }, { loc: btn(/Tiếp tục: Người nhận/), text: 'Bấm Tiếp tục: Người nhận' }] });
  await btn(/Tiếp tục: Người nhận/).click(); await page.waitForTimeout(1000);
  await g.shot(page, { title: 'Bước 2: nhập người nhận, địa chỉ và hạn', note: 'Mỗi văn bản một người nhận; hạn tống đạt chọn theo ngày.', marks: [{ loc: page.locator('input').first(), text: 'Nhập tên người nhận' }] });
  await page.keyboard.press('Escape');
  g.section('Khách hàng và hợp đồng chi tiết', 'Mở một khách để xem thông tin, hợp đồng, phụ lục, Vi bằng liên quan và nhật ký liên hệ. Hợp đồng có thể gắn nhiều hồ sơ Vi bằng; phụ lục chỉ ghi thêm, không sửa, không xoá.', ['Bản scan hợp đồng và phụ lục đã ký là PDF, JPEG hoặc PNG, tối đa 25 MB.', 'Không có số tiền ở bất kỳ ô nào.']);
  await go('/hop-dong/khach/' + KH1);
  await g.shot(page, { title: 'Hồ sơ khách hàng: các tab', note: 'Các tab: Thông tin, Hợp đồng, Phụ lục, Vi bằng, Nhật ký liên hệ.', marks: [{ loc: page.getByRole('link', { name: /^Hợp đồng/ }).first(), text: 'Bấm tab Hợp đồng' }, { loc: btn('Lưu thông tin'), text: 'Sửa thông tin cá nhân rồi bấm Lưu thông tin' }] });
  await go('/hop-dong/khach/' + KH1 + '?tab=hop-dong');
  await g.shot(page, { title: 'Tab Hợp đồng', note: 'Chọn dịch vụ (Vi bằng, Tống đạt, Xác minh, Tổ chức THA), trạng thái, ngày ký, hiệu lực, ghi chú rồi lưu hợp đồng; có thể tải bản scan hợp đồng và liên kết người tham gia.', marks: [] });
  await go('/hop-dong/khach/' + KH1 + '?tab=phu-luc');
  await g.shot(page, { title: 'Tab Phụ lục', note: 'Mỗi phụ lục có loại (gia hạn, bổ sung phạm vi, đổi bên tham gia, khác), ngày hiệu lực, nội dung và bản scan đã ký bắt buộc.', marks: [] });
  await go('/hop-dong/n-03');
  await g.shot(page, { title: 'Soạn hợp đồng N-03', note: 'Sinh bản nháp Word hợp đồng lập Vi bằng từ dữ liệu khách; người dùng rà soát trước khi ký.', marks: [] });
  g.section('Thư viện biểu mẫu', 'Đăng ký và tải các phụ lục của Thông tư, tìm biểu mẫu và soạn bản nháp Word cho các mẫu N. Thư viện chỉ để tra cứu và tải; không tự điền, ký hay ban hành.', ['Bản nháp phải được người có thẩm quyền rà soát và ký.']);
  await go('/bieu-mau');
  await g.shot(page, { title: 'Thư viện biểu mẫu', note: 'Tìm biểu mẫu theo tên; nút Soạn nội dung Vi bằng N-04 mở màn soạn dữ liệu pháp lý.', marks: [{ loc: page.getByText('Soạn nội dung Vi bằng N-04'), text: 'Bấm Soạn nội dung Vi bằng N-04' }] });
  await go('/bieu-mau/n-04');
  await g.shot(page, { title: 'Soạn dữ liệu pháp lý N-04', note: 'Nhập người yêu cầu, người tham gia, địa điểm, ngày bắt đầu và sự kiện chứng kiến; sau đó xuất dự thảo Word. Checklist hoàn tất nhắc việc ký, đóng dấu và ảnh THV chứng kiến.', marks: [{ loc: btn('Xuất dự thảo Word'), text: 'Bấm Xuất dự thảo Word' }] });
});

await run('VAN_THU', 'van-thu', 'Hướng dẫn dành cho Văn thư', async ({ page, g, go, btn }) => {
  g.section('Công văn đi và đến: tạo công văn', 'Công văn đến được vào sổ với loại văn bản, nơi gửi, trích yếu, số ký hiệu và ngày nhận. Mỗi công văn có thể giao người xử lý, đặt hạn, đính kèm tài liệu và liên kết với hồ sơ.', ['Công văn đi tự cấp số dạng số/năm/CV-THV.', 'Phân biệt soạn, duyệt nội bộ và ký ban hành.']);
  await go('/cong-van');
  await g.shot(page, { title: 'Màn Công văn', note: 'Ba tab: Công văn đến, Công văn đi, Sổ quyết định; bộ lọc Chờ xử lý, Quá hạn, Đã xử lý.', marks: [{ loc: page.getByText('Tạo công văn').first(), text: 'Bấm + Tạo công văn' }] });
  await page.getByText('Tạo công văn').first().click(); await page.waitForTimeout(1500);
  await page.locator('#nc-type').fill('Công văn');
  await page.locator('#nc-party').fill('DEMO Toà án nhân dân quận');
  await page.locator('#nc-subject').fill('DEMO: Đề nghị phối hợp xác minh điều kiện thi hành án');
  await page.locator('#nc-ref').fill('DEMO-12/CV');
  await g.shot(page, { title: 'Nhập thông tin công văn đến', note: 'Điền loại văn bản, nơi gửi, trích yếu, số ký hiệu và ngày nhận, sau đó bấm Tiếp tục để đính kèm tài liệu và vào sổ.', marks: [{ loc: page.locator('#nc-dir'), text: 'Chọn Công văn đến hoặc đi' }, { loc: page.locator('#nc-party'), text: 'Nhập nơi gửi' }, { loc: page.locator('#nc-subject'), text: 'Nhập trích yếu' }, { loc: btn(/Tiếp tục: Đính kèm/), text: 'Bấm Tiếp tục: Đính kèm' }] });
  await btn(/Tiếp tục: Đính kèm/).click(); await page.waitForTimeout(1200);
  await g.shot(page, { title: 'Đính kèm và vào sổ', note: 'Đính kèm bản scan công văn (nếu có) rồi hoàn tất để vào sổ.', marks: [] });
  await page.keyboard.press('Escape');
  g.section('Thư viện biểu mẫu và sổ sách', 'Văn thư dùng thư viện biểu mẫu để tra cứu và tải phụ lục, và theo dõi sổ S-01, S-02, S-04, S-05. Mục Theo dõi cập nhật CSDL / Sở liệt kê hồ sơ chờ cập nhật theo hạn 3 ngày làm việc.', ['Sổ điện tử hỗ trợ theo dõi; bản in chính thức phải đóng dấu giáp lai hằng tháng.']);
  await go('/so-sach');
  await g.shot(page, { title: 'Sổ theo dõi Vi bằng (S-02)', note: 'Chọn sổ và năm rồi bấm Xem; xuất Excel, PDF hoặc CSV.', marks: [{ loc: page.getByText('Xuất PDF'), text: 'Xuất sổ ra tệp' }, { loc: page.getByText(/Theo dõi cập nhật CSDL/), text: 'Mở danh sách hồ sơ chờ cập nhật Sở' }] });
  await go('/bieu-mau');
  await g.shot(page, { title: 'Thư viện biểu mẫu', note: 'Tìm và tải biểu mẫu; soạn dữ liệu pháp lý N-04.', marks: [{ loc: page.getByText('Soạn nội dung Vi bằng N-04'), text: 'Soạn N-04' }] });
});

await run('THV', 'thua-hanh-vien', 'Hướng dẫn dành cho Thừa hành viên', async ({ page, g, go }) => {
  g.section('Các tab của hồ sơ Vi bằng', 'Trang hồ sơ có banner (mã, trạng thái, Thêm thao tác) và các tab: Tiến độ, Thông tin, Tài liệu, Pháp lý, Lịch sử, Đề nghị thay đổi. Chỉ nội dung tab đang chọn hiện ra.', ['Trong 48 giờ đầu sửa trực tiếp ở tab Thông tin; sau đó gửi đề nghị thay đổi cho Admin.', 'Hồ sơ đã có giá trị pháp lý không xoá, không sửa âm thầm.']);
  for (const [tab, note] of [['Thông tin', 'Thông tin hồ sơ và người phụ trách.'], ['Tài liệu', 'Kho chứng cứ và bản scan có phiên bản và mã kiểm tra.'], ['Pháp lý', 'Người yêu cầu, địa điểm, sự kiện chứng kiến, người tham gia: dữ liệu cho văn bản N-04.'], ['Lịch sử', 'Nhật ký ai làm gì, lúc nào; chỉ ghi thêm, không sửa.']]) {
    await go('/vi-bang/' + C1);
    const t = page.getByText(tab, { exact: true }).first();
    await t.click(); await page.waitForTimeout(1200);
    await g.shot(page, { title: 'Tab ' + tab, note, marks: [{ loc: t, text: 'Bấm tab ' + tab }] });
  }
});

await run('KE_TOAN', 'ke-toan', 'Hướng dẫn dành cho Kế toán', async ({ page, g, go, btn }) => {
  g.section('Thu hồi xác nhận MISA khi xác nhận nhầm', 'Nếu đã xác nhận thanh toán nhầm, Kế toán gửi đề nghị Thu hồi xác nhận MISA kèm lý do; Admin quyết định. Người gửi không tự duyệt được đề nghị của mình. Nếu đã cấp số nhưng chưa trả khách, hệ thống tạm chặn bàn giao.', ['Không xoá số đã cấp, không dùng lại số, không sửa âm thầm tài liệu đã ký và đóng dấu.']);
  await go('/vi-bang/' + C1);
  await btn(/Thêm thao tác/).click(); await page.waitForTimeout(450);
  await g.shot(page, { title: 'Chọn Thu hồi MISA trong menu', note: 'Mục nằm ở nhóm Sau phát hành, chỉ mở sau khi đã cấp số.', marks: [{ loc: page.getByRole('menuitem', { name: /Thu hồi MISA/ }), text: 'Chọn Thu hồi MISA' }] });
  await page.getByRole('menuitem', { name: /Thu hồi MISA/ }).click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1500);
  await g.shot(page, { title: 'Nhập lý do và gửi đề nghị', note: 'Nêu rõ lý do thu hồi để Admin quyết định.', marks: [{ loc: page.locator('[role=dialog] textarea').first(), text: 'Nhập lý do đề nghị thu hồi (không gửi nếu chỉ xem thử)' }] });
  await page.keyboard.press('Escape');
});

await run('ADMIN', 'admin', 'Hướng dẫn dành cho Admin', async ({ page, g, go }) => {
  g.section('Hộp duyệt, báo cáo và thẻ THV', 'Admin quyết định đề nghị thu hồi xác nhận MISA, duyệt hoặc từ chối đề nghị sửa sau 48 giờ ở Hộp duyệt; xem Báo cáo hoạt động; quản lý Thẻ THV (họ tên và số thẻ in lên sổ).', ['Mỗi đề nghị có ba lựa chọn: duyệt, trả lại, từ chối.', 'Người đề nghị không tự duyệt đề nghị của mình.']);
  await go('/hop-duyet');
  await g.shot(page, { title: 'Hộp duyệt của Admin', note: 'Các đề nghị đang chờ hiện theo thứ tự cũ nhất lên trước.', marks: [] });
  await go('/quan-tri/the-thv');
  await g.shot(page, { title: 'Thẻ THV', note: 'Nhập họ tên và số thẻ của từng Thừa hành viên để in vào cột THV của sổ.', marks: [] });
  await go('/bao-cao');
  await g.shot(page, { title: 'Báo cáo hoạt động', note: 'Số liệu theo ngày tạo, đếm riêng từng nghiệp vụ, không cộng chéo, không có số tiền.', marks: [{ loc: page.getByText('Xuất Excel'), text: 'Xuất báo cáo ra Excel, PDF hoặc CSV' }] });
});
await b.close();
