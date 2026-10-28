import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
process.env.APPEND = '1';
const TD4 = 'd18059f6-9e96-4fa1-9e7e-7110ece2434d', TD5 = '9e7ed9b0-9857-4350-a0d8-8ebf74175c8b';
const XM = '4a7d1364-b6cc-43ea-9af2-6af59ddeb422', THA = 'fcb640a3-b742-457b-8e55-bda3fcdf4cd8';
const C2 = '19f2f142-e7c2-48ee-83d8-c2e25d23a71d', C4 = '85d55d26-5a60-40cb-87a2-402ee4bc0ccd', C1 = '64ce003a-1556-49f6-a8e1-29294dc4c77b';
const b = await browser();
const only = process.argv[2];
const run = async (role, slug, title, fn) => {
  if (only && only !== slug) return;
  const { page } = await asRole(b, role);
  const g = new Guide(slug, title);
  const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1500); };
  const btn = (n) => page.getByRole('button', { name: n });
  try { await fn({ page, g, go, btn }); } catch (e) { console.log('LỖI', slug, String(e).slice(0, 300)); }
  g.save(); console.log(slug, g.n);
};

await run('THV', 'thua-hanh-vien', 'Hướng dẫn dành cho Thừa hành viên', async ({ page, g, go, btn }) => {
  const menu = async () => { await btn(/Thêm thao tác/).click(); await page.waitForTimeout(450); };
  const item = (n) => page.getByRole('menuitem', { name: new RegExp(n) });
  g.section('Việc của tôi: hồ sơ đang giao cho bạn', 'Thừa hành viên (THV) xem được mọi hồ sơ Vi bằng nhưng chỉ làm bước pháp lý trên hồ sơ được giao. Trang Việc của tôi gom hồ sơ được giao ở cả bốn nghiệp vụ, hạn gần nhất lên trước.', ['Không làm bước pháp lý trên hồ sơ không được giao cho mình.']);
  await go('/viec-cua-toi');
  await g.shot(page, { title: 'Trang Việc của tôi', note: 'Ba thẻ trên cùng cho biết số việc quá hạn, đang xử lý và tổng số việc. Các nút lọc theo nghiệp vụ nằm ngay dưới.', marks: [{ loc: page.getByRole('button', { name: 'Tống đạt' }).first(), text: 'Bấm nút lọc để chỉ xem một nghiệp vụ (Tống đạt, Tổ chức thi hành án, Xác minh, Vi bằng)' }, { loc: page.locator('table tbody tr').first(), text: 'Bấm vào tên hồ sơ để mở màn xử lý' }] });
  await page.getByRole('button', { name: 'Tống đạt' }).first().click(); await page.waitForTimeout(700);
  await g.shot(page, { title: 'Lọc theo một nghiệp vụ', note: 'Sau khi chọn Tống đạt, danh sách chỉ còn các văn bản tống đạt được giao cho bạn; bấm Tất cả để quay lại.', marks: [{ loc: page.getByRole('button', { name: 'Tất cả' }).first(), text: 'Bấm Tất cả để bỏ lọc' }] });

  g.section('Tống đạt: ghi từng lần đi giao văn bản', 'Tống đạt là giao văn bản cho đúng người, đúng nơi, đúng hạn. Mỗi lần đi giao đều phải ghi lại. Không gặp người nhận KHÔNG phải là tống đạt thành công; chỉ khi có bằng chứng đã giao mới kết thúc việc. Lưu ý: màn chi tiết hiện chưa hiện lịch sử từng lần, địa chỉ và tên văn bản; phần này sẽ bổ sung ở bản sau.', ['Chưa được giao làm thì không ghi được lần tống đạt.', '"Không thể tống đạt được" chỉ chọn được sau ít nhất một lần đã thử.', 'Hồ sơ chỉ kết thúc khi có bằng chứng hoặc kết luận hợp lệ.']);
  await go('/tong-dat');
  await g.shot(page, { title: 'Danh sách văn bản tống đạt', note: 'Cột "Việc tiếp theo" cho biết việc cần làm; văn bản đã xong hiện "Hoàn tất · xem bằng chứng".', marks: [{ loc: page.getByText('Ghi nhận kết quả').first(), text: 'Bấm Ghi nhận kết quả để vào trang chi tiết' }] });
  await go('/tong-dat/' + TD4);
  await g.shot(page, { title: 'Trang chi tiết: quy trình 3 bước', note: 'Bước 1 do Admin hoặc Trưởng VP giao người xử lý (đã xong); bước 2 là việc của bạn; bước 3 mở khi có bằng chứng hoặc kết luận.', marks: [{ loc: btn('Ghi nhận kết quả lần tống đạt'), text: 'Bấm Ghi nhận kết quả lần tống đạt sau mỗi lần đi giao' }, { loc: page.getByText('Thông tin văn bản').first(), text: 'Thông tin văn bản: số yêu cầu, người nhận, hạn, số lần đã thử' }] });
  await btn('Ghi nhận kết quả lần tống đạt').click(); await page.waitForTimeout(1500);
  await g.shot(page, { title: 'Chọn một trong ba kết quả', note: 'Ba lựa chọn: đã đưa được văn bản (kết thúc việc, cần bằng chứng); chưa gặp được người nhận (việc vẫn mở, chọn lý do); không thể tống đạt được (chỉ chọn được sau ít nhất một lần đã thử).', marks: [{ loc: page.getByText('Đã đưa được văn bản cho người nhận'), text: 'Đã đưa được văn bản: kết thúc việc' }, { loc: page.getByText('Chưa gặp được người nhận').first(), text: 'Chưa gặp được người nhận: việc vẫn mở' }, { loc: page.getByText('Không thể tống đạt được').first(), text: 'Không thể tống đạt được: sau ít nhất một lần thử' }] });
  await page.getByText('Chưa gặp được người nhận').first().click(); await page.waitForTimeout(400);
  await page.getByText('Vắng mặt').first().click(); await page.waitForTimeout(300);
  await g.shot(page, { title: 'Chưa gặp được: chọn lý do rồi lưu lần thử', note: 'Chọn lý do chưa gặp được (từ chối, vắng mặt, không có người nhận, sai địa chỉ, lý do khác). Giờ ghi nhận do hệ thống tự lấy.', marks: [{ loc: page.getByText('Vắng mặt').first(), text: 'Chọn lý do chưa gặp được' }, { loc: btn(/Lưu lần thử/), text: 'Bấm Lưu lần thử' }] });
  await btn(/Lưu lần thử/).click(); await page.waitForTimeout(2500);
  await g.shot(page, { title: 'Đã ghi lần thử', note: 'Số lần đã thử tăng; việc vẫn mở. Sau ít nhất một lần thử, lựa chọn "Không thể tống đạt được" được mở.', marks: [] });
  await btn(/Ghi nhận kết quả lần tống đạt/).click(); await page.waitForTimeout(1500);
  await page.getByText('Không thể tống đạt được').first().click(); await page.waitForTimeout(500);
  await g.shot(page, { title: 'Kết luận không thể tống đạt được', note: 'Chỉ chọn được sau ít nhất một lần đã thử. Nêu lý do rồi xác nhận; kết luận này kết thúc việc.', marks: [{ loc: page.getByText('Không thể tống đạt được').first(), text: 'Chọn Không thể tống đạt được và chọn lý do' }] });
  await page.keyboard.press('Escape');
  await go('/tong-dat/' + TD5);
  await btn('Ghi nhận kết quả lần tống đạt').click(); await page.waitForTimeout(1500);
  await page.getByText('Đã đưa được văn bản cho người nhận').click(); await page.waitForTimeout(400);
  await page.locator('input[name=evidence]').setInputFiles('demo-scan.pdf');
  await g.shot(page, { title: 'Đã đưa được văn bản: tải bằng chứng', note: 'Tải biên bản hoặc ảnh bằng chứng (PDF, JPEG, PNG, tối đa 25 MB). Sau khi xác nhận, việc chuyển sang Đã tống đạt và không sửa được.', marks: [{ loc: page.locator('input[name=evidence]'), text: 'Chọn tệp bằng chứng' }, { loc: btn('Xác nhận đã tống đạt'), text: 'Bấm Xác nhận đã tống đạt' }] });
  await btn('Xác nhận đã tống đạt').click(); await page.waitForTimeout(2500);
  await g.shot(page, { title: 'Văn bản đã được tống đạt', note: 'Bước 3 hoàn tất; số lần và bằng chứng được lưu.', marks: [] });

  g.section('Vi bằng: xác nhận đã ký', 'Sau khi Văn thư cấp số, Thừa hành viên phụ trách ký thật trên văn bản giấy, rồi bấm xác nhận trên phần mềm. Phần mềm chỉ ghi nhận hành vi đã xảy ra; chữ ký pháp lý là chữ ký trên giấy.', ['Chỉ THV được giao phụ trách hồ sơ mới xác nhận ký.', 'Văn thư chỉ đóng dấu được sau khi THV xác nhận đã ký.']);
  await go('/vi-bang/' + C4);
  await menu();
  await g.shot(page, { title: 'Mở Thêm thao tác, chọn Ký và đóng dấu', note: 'Hồ sơ đã có số và đang chờ ký.', marks: [{ loc: item('Ký và đóng dấu'), text: 'Chọn Ký và đóng dấu' }] });
  await item('Ký và đóng dấu').click(); await page.waitForTimeout(1800);
  await g.shot(page, { title: 'Bấm Xác nhận đã ký', note: 'Ngăn kéo hiện ba bước dạng thẻ: bước 1 của THV, bước 2 và 3 của Văn thư (mờ cho tới khi tới bước).', marks: [{ loc: btn('Xác nhận đã ký'), text: 'Bấm Xác nhận đã ký (sau khi đã ký thật trên giấy)' }] });
  await btn('Xác nhận đã ký').click(); await page.waitForTimeout(2500);
  await g.shot(page, { title: 'Đã xác nhận ký', note: 'Bước 1 chuyển sang Đã xong; bước kế tiếp là Văn thư đóng dấu.', marks: [] });
  await page.keyboard.press('Escape');

  g.section('Xác minh điều kiện thi hành án', 'Một hồ sơ xác minh có nhiều lượt, mỗi lượt xác minh một bên hoặc một nguồn. Kết quả của một lượt chưa phải là kết luận chung. Phải có nguồn (có tệp) thì mới ghi được kết quả lượt; mọi lượt có kết quả mới đề xuất được kết luận cho Trưởng văn phòng quyết định.', ['Thiếu nguồn thì không ghi được kết quả lượt.', 'Thông tin tài sản, nhân thân rất nhạy cảm: chọn đúng mức bảo mật.']);
  await go('/xac-minh/' + XM + '?tab=luot');
  await g.shot(page, { title: 'Quy trình 3 bước và các lượt xác minh', note: 'Đầu trang là quy trình 3 bước (giao THV, xác minh các bên, kết luận) kèm số lượt đã có kết quả. Bên dưới là bảng các lượt.', marks: [{ loc: btn('Thêm lượt xác minh').first(), text: 'Thêm lượt xác minh mới' }, { loc: page.getByText('Ghi kết quả', { exact: true }).first(), text: 'Bấm Ghi kết quả của lượt' }] });
  await page.getByText('Ghi kết quả', { exact: true }).first().click(); await page.waitForTimeout(1500);
  await page.getByLabel('Loại nguồn').fill('Văn bản của UBND phường');
  await page.getByLabel('Mức bảo mật').selectOption({ label: 'Mật' });
  await page.getByLabel('Mục đích sử dụng').fill('Xác định tài sản của người phải thi hành');
  await page.locator('input[name=file]').setInputFiles('demo-scan.pdf');
  await g.shot(page, { title: 'Ghi nguồn kèm tệp', note: 'Nhập loại nguồn, mức bảo mật, mục đích và tải tệp. Nguồn nhạy cảm chọn Mật hoặc Có dữ liệu cá nhân.', marks: [{ loc: page.getByLabel('Loại nguồn'), text: 'Nhập loại nguồn' }, { loc: page.getByLabel('Mức bảo mật'), text: 'Chọn mức bảo mật' }, { loc: page.getByLabel('Mục đích sử dụng'), text: 'Nhập mục đích sử dụng' }, { loc: page.locator('input[name=file]'), text: 'Chọn tệp nguồn' }, { loc: btn('Ghi nguồn kèm tệp'), text: 'Bấm Ghi nguồn kèm tệp' }] });
  await btn('Ghi nguồn kèm tệp').click(); await page.waitForTimeout(2500);
  if (!(await page.locator('textarea[name=result]').isVisible())) { await page.getByText('Ghi kết quả', { exact: true }).first().click(); await page.waitForTimeout(1500); }
  await page.locator('textarea[name=result]').fill('DEMO: Đã xác minh tại UBND phường; người phải thi hành có một tài khoản ngân hàng đứng tên.');
  await g.shot(page, { title: 'Ghi kết quả của lượt', note: 'Sau khi có nguồn, nhập kết quả của lượt rồi ghi. Kết quả lượt không đồng nghĩa với kết luận cuối.', marks: [{ loc: page.locator('textarea[name=result]'), text: 'Nhập kết quả của lượt' }, { loc: btn('Ghi kết quả lượt'), text: 'Bấm Ghi kết quả lượt' }] });
  await btn('Ghi kết quả lượt').click(); await page.waitForTimeout(2500);
  for (let i = 0; i < 2; i++) {
    await go('/xac-minh/' + XM + '?tab=luot');
    const l = page.getByText('Ghi kết quả', { exact: true }); if (!(await l.count())) break;
    await l.first().click(); await page.waitForTimeout(1500);
    await page.getByLabel('Loại nguồn').fill('Văn bản của cơ quan có thẩm quyền'); await page.getByLabel('Mục đích sử dụng').fill('Xác định điều kiện thi hành án');
    await page.locator('input[name=file]').setInputFiles('demo-scan.pdf'); await btn('Ghi nguồn kèm tệp').click(); await page.waitForTimeout(2500);
    if (!(await page.locator('textarea[name=result]').isVisible())) { await l.first().click(); await page.waitForTimeout(1500); }
    await page.locator('textarea[name=result]').fill('DEMO: Đã có kết quả xác minh cho lượt này.'); await btn('Ghi kết quả lượt').click(); await page.waitForTimeout(2500);
  }
  g.section('Xác minh: đề xuất kết luận', 'Khi mọi lượt xác minh đã có kết quả, THV đề xuất kết luận gửi Trưởng văn phòng. Duyệt kết luận trong phần mềm khác với ký quyết định pháp lý.', ['Chưa có kết quả ở mọi lượt thì không gửi được đề xuất.', 'Thiếu căn cứ thì không tự kết luận xong.']);
  await go('/xac-minh/' + XM);
  await menu();
  await g.shot(page, { title: 'Chọn Đề xuất kết luận', note: 'Menu Thêm thao tác của hồ sơ xác minh gồm: Thêm lượt, Đề xuất kết luận, Quyết định kết luận (Trưởng VP), Phân công, Ngày ký hợp đồng.', marks: [{ loc: item('Đề xuất kết luận'), text: 'Chọn Đề xuất kết luận' }] });
  await item('Đề xuất kết luận').click(); await page.waitForTimeout(1800);
  const ta = page.locator('[role=dialog] textarea').first();
  await ta.fill('DEMO: Người phải thi hành có tài khoản ngân hàng và không có bất động sản đứng tên; đề nghị tiếp tục thi hành.');
  await g.shot(page, { title: 'Nhập nội dung đề xuất kết luận', note: 'Ghi ngắn gọn kết luận dựa trên các lượt đã có kết quả.', marks: [{ loc: ta, text: 'Nhập nội dung kết luận đề xuất' }, { loc: page.locator('[role=dialog] button[type=submit], [role=dialog] button').last(), text: 'Bấm gửi đề xuất' }] });
  await page.locator('[role=dialog] button[type=submit], [role=dialog] button').last().click(); await page.waitForTimeout(2500);

  g.section('Tổ chức thi hành án', 'Hồ sơ THA ghi nhận đương sự, nghĩa vụ và kết quả từng phần ở mức nghiệp vụ pháp lý. Không ghi sổ thu chi và không thay MISA. Hoàn thành một nghĩa vụ chưa làm xong cả vụ.', ['Còn nghĩa vụ chưa hoàn tất thì chưa hoàn tất hồ sơ được.', 'Không nhập số tiền thanh toán.']);
  await go('/to-chuc-tha/' + THA);
  await g.shot(page, { title: 'Trang chi tiết hồ sơ THA: quy trình 3 bước', note: 'Quy trình gồm giao THV, thực hiện các nghĩa vụ (kèm số nghĩa vụ đã hoàn tất) và hoàn tất hoặc chấm dứt hồ sơ. Mọi thao tác nằm sau nút Cập nhật hồ sơ.', marks: [{ loc: btn('Cập nhật hồ sơ'), text: 'Bấm Cập nhật hồ sơ để thêm đương sự, nghĩa vụ, ghi kết quả' }, { loc: page.getByText('Thông tin hồ sơ').first(), text: 'Thông tin hồ sơ: mã, hợp đồng, quyết định, trạng thái' }] });
  await btn('Cập nhật hồ sơ').click(); await page.waitForTimeout(1500);
  await page.getByLabel('Nội dung kết quả').fill('DEMO: Người phải thi hành đã bàn giao một phần tài sản.');
  await page.locator('input[name=file]').setInputFiles('demo-scan.pdf');
  await g.shot(page, { title: 'Ghi kết quả một phần kèm chứng cứ', note: 'Trong ngăn kéo: chọn nghĩa vụ, loại kết quả (một phần hoặc hoàn tất nghĩa vụ), nội dung và tệp chứng cứ. Kết quả được lưu bất biến.', marks: [{ loc: page.getByLabel('Nghĩa vụ có kết quả'), text: 'Chọn nghĩa vụ' }, { loc: page.getByLabel('Loại kết quả'), text: 'Chọn Kết quả một phần hoặc Hoàn tất nghĩa vụ' }, { loc: page.getByLabel('Nội dung kết quả'), text: 'Nhập nội dung kết quả' }, { loc: btn('Ghi kết quả kèm chứng cứ'), text: 'Bấm Ghi kết quả kèm chứng cứ' }] });
  await btn('Ghi kết quả kèm chứng cứ').click(); await page.waitForTimeout(2500);
  await g.shot(page, { title: 'Nghĩa vụ đã ghi nhận một phần', note: 'Trạng thái nghĩa vụ chuyển sang Thực hiện một phần; hồ sơ chỉ hoàn tất khi mọi nghĩa vụ xong.', marks: [] });
  await page.keyboard.press('Escape');

  g.section('Các tab của hồ sơ Vi bằng', 'Trang hồ sơ có banner (mã, trạng thái, Thêm thao tác), thanh tiến độ và các tab: Tiến độ, Thông tin, Tài liệu, Pháp lý, Lịch sử, Đề nghị thay đổi. Chỉ nội dung tab đang chọn hiện ra.', ['Trong 48 giờ đầu sửa trực tiếp ở tab Thông tin; sau đó gửi đề nghị thay đổi cho Admin.', 'Hồ sơ đã có giá trị pháp lý không xoá, không sửa âm thầm.']);
  for (const [tab, note] of [['Thông tin', 'Thông tin hồ sơ và người phụ trách.'], ['Tài liệu', 'Kho chứng cứ và bản scan có phiên bản và mã kiểm tra.'], ['Pháp lý', 'Người yêu cầu, địa điểm, sự kiện chứng kiến, người tham gia: dữ liệu cho văn bản N-04.'], ['Lịch sử', 'Nhật ký ai làm gì, lúc nào; chỉ ghi thêm, không sửa.']]) {
    await go('/vi-bang/' + C1);
    const t = page.getByText(tab, { exact: true }).first();
    await t.click(); await page.waitForTimeout(1200);
    await g.shot(page, { title: 'Tab ' + tab, note, marks: [{ loc: t, text: 'Bấm tab ' + tab }] });
  }
});

await run('VAN_THU', 'van-thu', 'Hướng dẫn dành cho Văn thư', async ({ page, g, go, btn }) => {
  g.section('Xác nhận đã đóng dấu và tải bản scan cuối', 'Sau khi Thừa hành viên ký trên văn bản giấy, Văn thư đóng dấu thật, bấm xác nhận trên phần mềm, rồi scan bản đã ký và đóng dấu để tải lên. Bản gốc giấy vẫn lưu tại Văn phòng; bản scan chỉ để quản lý.', ['Chỉ bấm "Đã đóng dấu" khi đã đóng dấu thật.', 'Bản scan cuối là PDF, tối đa 25 MB.']);
  await go('/vi-bang/' + C2);
  await g.shot(page, { title: 'Hồ sơ đã ký, chờ đóng dấu', note: 'Thanh tiến độ cho thấy bước kế tiếp là Ký, đóng dấu và bản scan.', marks: [{ loc: page.getByText(/Tiếp tục: Ký/), text: 'Bấm Tiếp tục: Ký, đóng dấu và bản scan' }] });
  await page.getByText(/Tiếp tục: Ký/).click(); await page.waitForTimeout(1800);
  await g.shot(page, { title: 'Xác nhận đã đóng dấu', note: 'Ngăn kéo hiện ba bước dạng thẻ. Bước 1 (THV ký) đã xong; bước 2 là việc của Văn thư.', marks: [{ loc: btn('Xác nhận đã đóng dấu'), text: 'Bấm Xác nhận đã đóng dấu (sau khi đã đóng dấu thật)' }] });
  await btn('Xác nhận đã đóng dấu').click(); await page.waitForTimeout(2500);
  await g.shot(page, { title: 'Chọn tệp scan và tải lên', note: 'Bước 3 mở ra sau khi xác nhận đóng dấu. Chọn tệp PDF đã có chữ ký và dấu.', marks: [{ loc: page.locator('input[type=file]'), text: 'Bấm Choose File rồi chọn tệp PDF scan' }, { loc: btn('Tải bản scan cuối'), text: 'Bấm Tải bản scan cuối' }] });
  await page.locator('input[type=file]').setInputFiles('demo-scan.pdf'); await page.waitForTimeout(300);
  await btn('Tải bản scan cuối').click(); await page.waitForTimeout(2500);
  await g.shot(page, { title: 'Đã tải bản scan cuối', note: 'Cả ba bước đã xong; bản scan được lưu kèm mã kiểm tra. Hồ sơ chuyển sang bước trả kết quả cho THV.', marks: [] });
  await page.keyboard.press('Escape');
});
await b.close();
