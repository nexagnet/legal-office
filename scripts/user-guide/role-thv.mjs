import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
const TD2 = 'd0e8966e-c79b-4208-9abe-d6ae5f871716', XM = '80b4e63f-7631-4fec-a37c-6de9197ee05f', THA = 'd4e62a01-a17b-496a-847d-a66d089a5499';
const b = await browser(); const { page } = await asRole(b, 'THV');
const g = new Guide('thua-hanh-vien', 'Hướng dẫn dành cho Thừa hành viên');
const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(800); };
const btn = (n) => page.getByRole('button', { name: n });
g.section('Việc của tôi: hồ sơ đang giao cho bạn', 'Thừa hành viên (THV) xem được mọi hồ sơ Vi bằng nhưng chỉ làm bước pháp lý trên hồ sơ được giao. Trang Việc của tôi gom hồ sơ được giao ở cả bốn nghiệp vụ, hạn gần nhất lên trước.', ['Không làm bước pháp lý trên hồ sơ không được giao cho mình.']);
await go('/viec-cua-toi');
await g.shot(page, { title: 'Trang Việc của tôi', note: 'Ba thẻ trên cùng cho biết số việc quá hạn, đang xử lý và tổng số việc. Có thể lọc theo nghiệp vụ.', marks: [{ loc: page.getByText('Tống đạt').first(), text: 'Lọc theo nghiệp vụ nếu cần' }, { loc: page.locator('table tbody tr').first(), text: 'Bấm vào dòng để mở hồ sơ' }] });

g.section('Tống đạt: ghi từng lần đi giao văn bản', 'Tống đạt là giao văn bản cho đúng người, đúng nơi, đúng hạn. Mỗi lần đi giao đều phải ghi lại. Không gặp người nhận KHÔNG phải là tống đạt thành công; chỉ khi có bằng chứng đã giao mới ghi "đã tống đạt".', ['Chưa được giao làm thì không ghi được lần tống đạt.', 'Hồ sơ chỉ đóng khi mọi văn bản đều có kết quả hợp lệ.']);
await go('/tong-dat');
await g.shot(page, { title: 'Danh sách văn bản tống đạt', note: 'Mỗi dòng là một văn bản (một yêu cầu có thể có nhiều văn bản), có hạn và số lần đã thử.', marks: [{ loc: page.getByText('Mở').first(), text: 'Bấm Mở để vào trang chi tiết' }] });
await go('/tong-dat/' + TD2);
await page.getByLabel('Kết quả lần tống đạt').selectOption({ label: 'Vắng mặt' });
await g.shot(page, { title: 'Ghi nhận lần tống đạt chưa thành công', note: 'Đi giao nhưng người nhận vắng mặt: chọn kết quả của lần đó rồi ghi nhận. Số lần đã thử sẽ tăng.', marks: [{ loc: page.getByLabel('Kết quả lần tống đạt'), text: 'Chọn kết quả lần tống đạt (ví dụ Vắng mặt)' }, { loc: btn('Ghi nhận lần tống đạt'), text: 'Bấm Ghi nhận lần tống đạt' }] });
await btn('Ghi nhận lần tống đạt').click(); await page.waitForTimeout(2000);
await page.locator('input[name=evidence]').setInputFiles('demo-scan.pdf');
await g.shot(page, { title: 'Ghi nhận ĐÃ tống đạt kèm bằng chứng', note: 'Khi giao được, tải biên bản hoặc ảnh làm bằng chứng (PDF, JPEG, PNG, tối đa 25 MB) rồi ghi nhận.', marks: [{ loc: page.locator('input[name=evidence]'), text: 'Chọn tệp bằng chứng' }, { loc: btn('Ghi nhận đã tống đạt'), text: 'Bấm Ghi nhận đã tống đạt' }] });
await btn('Ghi nhận đã tống đạt').click(); await page.waitForTimeout(2500);
await g.shot(page, { title: 'Văn bản đã được tống đạt', note: 'Trạng thái chuyển sang Đã tống đạt, số lần và bằng chứng được lưu.', marks: [] });

g.section('Xác minh điều kiện thi hành án', 'Một hồ sơ xác minh có nhiều lượt, mỗi lượt xác minh một bên hoặc một nguồn. Kết quả của một lượt chưa phải là kết luận chung. Phải có nguồn (có tệp) thì mới ghi được kết quả lượt; mọi lượt có kết quả mới đề xuất được kết luận cho Trưởng văn phòng quyết định.', ['Thiếu nguồn thì không ghi được kết quả lượt.', 'Thông tin tài sản, nhân thân rất nhạy cảm: chọn đúng mức bảo mật.']);
await go('/xac-minh/' + XM + '?tab=luot');
await g.shot(page, { title: 'Các lượt xác minh', note: 'Mỗi lượt có bên được xác minh, trạng thái và kết quả. Nút Ghi kết quả nằm cuối dòng của lượt đang thực hiện.', marks: [{ loc: page.getByText('Thêm lượt xác minh').first(), text: 'Thêm lượt xác minh mới' }, { loc: page.getByText('Ghi kết quả').first(), text: 'Bấm Ghi kết quả của lượt' }] });
await page.getByText('Ghi kết quả').first().click(); await page.waitForTimeout(1500);
await page.getByLabel('Loại nguồn').fill('Văn bản của UBND phường');
await page.getByLabel('Mức bảo mật').selectOption({ label: 'Mật' });
await page.getByLabel('Mục đích sử dụng').fill('Xác định tài sản của người phải thi hành');
await page.locator('input[name=file]').setInputFiles('demo-scan.pdf');
await g.shot(page, { title: 'Ghi nguồn kèm tệp', note: 'Nhập loại nguồn, mức bảo mật, mục đích và tải tệp. Nguồn nhạy cảm chọn Mật hoặc Có dữ liệu cá nhân.', marks: [{ loc: page.getByLabel('Loại nguồn'), text: 'Nhập loại nguồn' }, { loc: page.getByLabel('Mức bảo mật'), text: 'Chọn mức bảo mật' }, { loc: page.getByLabel('Mục đích sử dụng'), text: 'Nhập mục đích sử dụng' }, { loc: page.locator('input[name=file]'), text: 'Chọn tệp nguồn' }, { loc: btn('Ghi nguồn kèm tệp'), text: 'Bấm Ghi nguồn kèm tệp' }] });
await btn('Ghi nguồn kèm tệp').click(); await page.waitForTimeout(2500);
if (!(await page.locator('textarea[name=result]').isVisible())) { await page.getByText('Ghi kết quả').first().click(); await page.waitForTimeout(1500); }
await page.locator('textarea[name=result]').fill('DEMO: Đã xác minh tại UBND phường; người phải thi hành có một tài khoản ngân hàng đứng tên.');
await g.shot(page, { title: 'Ghi kết quả của lượt', note: 'Sau khi có nguồn, nhập kết quả của lượt rồi ghi. Kết quả lượt không đồng nghĩa với kết luận cuối.', marks: [{ loc: page.getByLabel('Kết quả của lượt'), text: 'Nhập kết quả của lượt' }, { loc: btn('Ghi kết quả lượt'), text: 'Bấm Ghi kết quả lượt' }] });
await btn('Ghi kết quả lượt').click(); await page.waitForTimeout(2500);

g.section('Tổ chức thi hành án', 'Hồ sơ THA ghi nhận đương sự, nghĩa vụ và kết quả từng phần ở mức nghiệp vụ pháp lý. Không ghi sổ thu chi và không thay MISA. Hoàn thành một nghĩa vụ chưa làm xong cả vụ.', ['Còn nghĩa vụ chưa hoàn tất thì chưa hoàn tất hồ sơ được.', 'Không nhập số tiền thanh toán.']);
await go('/to-chuc-tha/' + THA);
await g.shot(page, { title: 'Trang chi tiết hồ sơ THA', note: 'Đương sự, nghĩa vụ và các ô thao tác nằm ngay trong trang.', marks: [{ loc: page.getByText('Nghĩa vụ').first(), text: 'Danh sách nghĩa vụ của hồ sơ' }, { loc: page.getByLabel('Tên đương sự'), text: 'Thêm đương sự mới ở đây' }] });
await page.getByLabel('Nội dung kết quả').fill('DEMO: Người phải thi hành đã thực hiện một phần nghĩa vụ.');
await page.locator('input[name=file]').setInputFiles('demo-scan.pdf');
await g.shot(page, { title: 'Ghi kết quả một phần kèm chứng cứ', note: 'Chọn nghĩa vụ, loại kết quả, nội dung và tệp chứng cứ. Kết quả được lưu bất biến (ai, khi nào, chứng cứ).', marks: [{ loc: page.getByLabel('Nghĩa vụ có kết quả'), text: 'Chọn nghĩa vụ' }, { loc: page.getByLabel('Loại kết quả'), text: 'Chọn Kết quả một phần hoặc Hoàn tất nghĩa vụ' }, { loc: page.getByLabel('Nội dung kết quả'), text: 'Nhập nội dung kết quả' }, { loc: btn('Ghi kết quả kèm chứng cứ'), text: 'Bấm Ghi kết quả kèm chứng cứ' }] });
await btn('Ghi kết quả kèm chứng cứ').click(); await page.waitForTimeout(2500);
g.save(); await b.close(); console.log('done', g.n);
