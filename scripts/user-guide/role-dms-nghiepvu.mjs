import { browser, asRole, BASE } from './lib.mjs';
import { Guide } from './guide.mjs';
// Ba nghiệp vụ còn lại (Tống đạt, Xác minh THA, Tổ chức THA): chụp biểu mẫu tạo hồ sơ (không lưu), và luồng
// "Thư ký tạo nháp -> chọn THV -> THV xác nhận". Chạy với APPEND=1. Tạo một nháp giả "[guide] ..." mỗi lần chạy.
const b = await browser();
const thv = await asRole(b, 'THV');
const tk = await asRole(b, 'THU_KY');
const gt = new Guide('thua-hanh-vien', 'Hướng dẫn dành cho Thừa hành viên');
const gk = new Guide('thu-ky', 'Hướng dẫn dành cho Thư ký');
const go = async (page, p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(900); };
const REAL = process.env.GUIDE_REAL === '1'; // dữ liệu minh họa gửi khách: tiêu đề thật, không tiền tố [guide], không mốc giờ
const TAG = REAL ? '' : '[guide] ';
const stamp = REAL ? '' : new Date().toISOString().slice(5, 16).replace('T', ' ');
/** Đánh dấu từng ô nhập đang hiện trong vùng main; trả cả marks lẫn dòng giải thích (nhãn, bắt buộc hay không). */
const fields = async (page, max = 10) => {
  const els = await page.locator('main input:not([type=hidden]):not([type=checkbox]):not([type=file]),main select,main textarea').all();
  const marks = [], detail = [];
  for (const el of els) {
    if (marks.length >= max || !(await el.isVisible().catch(() => false))) continue;
    const info = await el.evaluate((e) => ({ label: (e.labels?.[0]?.innerText || e.getAttribute('aria-label') || e.placeholder || e.name || '').replace(/\s+/g, ' ').trim(), req: e.required, name: e.name }));
    if (!info.label) continue;
    const short = info.label.slice(0, 80);
    marks.push({ loc: el, text: `${short}${info.req ? ' (bắt buộc)' : ''}` });
    detail.push(`${short}${info.req ? ' (bắt buộc)' : ''}`);
  }
  return { marks, detail };
};

const DOMAINS = [
  ['tong-dat', 'Tống đạt', 'S-01', 'Mỗi hồ sơ Tống đạt ghi việc tống đạt văn bản: văn bản nào, tống đạt cho ai, kết quả ra sao. Sổ S-01 được dựng từ các hồ sơ chính thức.'],
  ['xac-minh', 'Xác minh điều kiện thi hành án', 'S-04', 'Mỗi hồ sơ ghi việc xác minh điều kiện thi hành án theo yêu cầu: người yêu cầu, người phải thi hành, nội dung xác minh và kết quả. Sổ S-04 được dựng từ các hồ sơ chính thức.'],
  ['to-chuc-tha', 'Tổ chức thi hành án', 'S-05', 'Mỗi hồ sơ ghi việc tổ chức thi hành một bản án, quyết định: đương sự, nội dung, kết quả. Sổ S-05 được dựng từ các hồ sơ chính thức.'],
];
for (const [slug, name, book, intro] of DOMAINS) {
  gt.section(`DMS · ${name}: tạo hồ sơ`, `${intro} Cách làm giống nghiệp vụ Vi bằng: tạo bản nháp, thêm tài liệu và bản scan, rồi lưu chính thức; chỉ khác các ô của sổ ${book}.`, [
    `Bản nháp chưa có số hồ sơ và chưa vào sổ ${book}. Sau khi lưu chính thức không sửa trực tiếp, không xóa (chỉ Admin sửa có lý do).`,
    'Các ô mang tên "Cột n" chính là cột của sổ; điền đúng chính tả vì đây là nội dung sẽ ghi vào sổ.',
  ], [
    [`Không thấy nút "+ Tạo hồ sơ" ở ${name}`, 'Tài khoản chưa được cấp quyền tạo hồ sơ nghiệp vụ này. Nhờ Admin kiểm tra phân quyền.'],
    ['Bấm Lưu nháp báo thiếu thông tin', 'Điền ô bắt buộc (có ghi chú bắt buộc), kiểm tra SĐT đúng 10 số bắt đầu bằng 0.'],
  ]);
  await go(thv.page, `/dms/${slug}`);
  await gt.shot(thv.page, { title: `${name}: danh sách và nút tạo hồ sơ`, note: 'Danh sách dùng giống nghiệp vụ Vi bằng (tab, bộ lọc, tìm, cột). Bấm "+ Tạo hồ sơ" để tạo bản nháp mới.',
    marks: [{ loc: thv.page.getByRole('link', { name: '+ Tạo hồ sơ' }), text: 'Tạo hồ sơ mới (bản nháp)' }, { loc: thv.page.getByRole('link', { name: new RegExp(`Xuất ${book}`) }), text: `Xem trước và xuất sổ ${book}`, optional: true }] });
  await go(thv.page, `/dms/${slug}/tao-moi`);
  const f = await fields(thv.page);
  await gt.shot(thv.page, { title: `${name}: các ô của biểu mẫu tạo hồ sơ`, note: 'Điền các ô rồi bấm Lưu nháp ở cuối biểu mẫu. Có thể để trống ô chưa biết và bổ sung khi còn là bản nháp.', detail: f.detail, marks: f.marks });
}

// Thư ký tạo nháp và chọn Thừa hành viên; THV xác nhận
const ad = await asRole(b, 'ADMIN');
const ga = new Guide('admin', 'Hướng dẫn dành cho Admin');
gk.section('DMS · Thư ký: soạn bản nháp', 'Thư ký soạn bản nháp: điền thông tin, thêm tài liệu, tải bản scan. Với vai Thư ký, bản nháp có Lưu, Lưu nháp và Hủy nháp; không có nút "Xác nhận lưu chính thức" và ô "Thừa hành viên được ghi tên" chỉ có lựa chọn "Không ghi tên".', [
  'Bản nháp chưa có số hồ sơ, chưa vào sổ. Bạn Hủy nháp được (phải nêu lý do).',
  'Việc xác nhận lưu chính thức do người có quyền thực hiện; hỏi Trưởng văn phòng hoặc Admin quy trình của văn phòng.',
], [
  ['Không thấy nút "Xác nhận lưu chính thức"', 'Đúng thiết kế của vai Thư ký. Báo người phụ trách xác nhận.'],
  ['Ô "Thừa hành viên được ghi tên" chỉ có "Không ghi tên"', 'Vai Thư ký không có quyền chọn thừa hành viên.'],
]);
ga.section('DMS · Admin: soạn nháp và chọn Thừa hành viên ghi tên', 'Khi Admin soạn bản nháp, chọn thừa hành viên được ghi tên rồi Lưu. Hồ sơ sẽ hiện ở mục "Chờ tôi xác nhận" của thừa hành viên đó để họ xem lại và xác nhận lưu chính thức.', [
  'Chỉ người có quyền xem danh sách thừa hành viên mới chọn được. Chọn "Không ghi tên" nếu chưa biết.',
  'Admin chỉ thấy bản nháp do chính mình soạn, không thấy bản nháp của người khác.',
], [['Thừa hành viên không thấy hồ sơ trong "Chờ tôi xác nhận"', 'Chưa chọn đúng thừa hành viên ở ô "Thừa hành viên được ghi tên" hoặc chưa bấm Lưu.']]);
await go(tk.page, '/dms/vi-bang/tao-moi');
await tk.page.locator('[name=title]').fill(`${TAG}Vi bằng ghi nhận hiện trạng nhà số 18 phố Hàng Cót${REAL ? '' : ' ' + stamp}`);
await tk.page.locator('[name=phone]').fill('0900 000 456');
await tk.page.locator('[name=nguoi_yeu_cau]').fill('Trần Thị Bình, 25 phố Bạch Mai, Hai Bà Trưng, Hà Nội');
await tk.page.locator('[name=noi_dung_yeu_cau]').fill('Ghi nhận hiện trạng nhà ở trước khi bàn giao');
await tk.page.locator('select[name=branch]').selectOption({ index: 1 }).catch(() => {});
await tk.page.getByRole('button', { name: 'Lưu nháp' }).click(); await tk.page.waitForURL(/\/dms\/vi-bang\/[0-9a-f-]{36}/, { timeout: 15000 }); await tk.page.waitForTimeout(1500);
await gk.shot(tk.page, { title: 'Bản nháp do Thư ký soạn', note: 'Thư ký có Lưu, Lưu nháp và Hủy nháp; không có "Xác nhận lưu chính thức". Ô thừa hành viên chỉ có "Không ghi tên" vì bạn không có quyền chọn.',
  marks: [
    { loc: tk.page.locator('[name=thv]'), text: 'Thừa hành viên được ghi tên (Admin sẽ chọn)' },
    { loc: tk.page.getByRole('button', { name: 'Lưu', exact: true }), text: 'Lưu thay đổi' },
    { loc: tk.page.getByRole('button', { name: 'Hủy nháp' }), text: 'Hủy nháp (cần nêu lý do)' },
  ] });
// Admin chọn THV cho bản nháp
await go(ad.page, '/dms/vi-bang/tao-moi');
await ad.page.locator('[name=title]').fill(`${TAG}Vi bằng ghi nhận hiện trạng nhà số 18 phố Hàng Cót${REAL ? '' : ' ' + stamp}`);
await ad.page.locator('[name=phone]').fill('0900 000 456');
await ad.page.locator('[name=nguoi_yeu_cau]').fill('Trần Thị Bình, 25 phố Bạch Mai, Hai Bà Trưng, Hà Nội');
await ad.page.locator('[name=noi_dung_yeu_cau]').fill('Ghi nhận hiện trạng nhà ở trước khi bàn giao');
await ad.page.locator('select[name=branch]').selectOption({ index: 1 }).catch(() => {});
await ad.page.getByRole('button', { name: 'Lưu nháp' }).click(); await ad.page.waitForURL(/\/dms\/vi-bang\/[0-9a-f-]{36}/, { timeout: 15000 }); await ad.page.waitForTimeout(1500);
const optionLabel = await ad.page.locator('[name=thv] option', { hasText: REAL ? 'Phạm Quốc Bảo' : 'DEMO Thừa hành viên' }).first().innerText();
await ad.page.locator('[name=thv]').selectOption({ label: optionLabel.trim() });
await ga.shot(ad.page, { title: 'Chọn thừa hành viên được ghi tên', note: 'Ở đầu bản nháp, chọn thừa hành viên rồi bấm Lưu. Hồ sơ sẽ hiện ở "Chờ tôi xác nhận" của thừa hành viên đó.',
  marks: [{ loc: ad.page.locator('[name=thv]'), text: 'Thừa hành viên được ghi tên' }, { loc: ad.page.getByRole('button', { name: 'Lưu', exact: true }), text: 'Lưu để giao cho thừa hành viên' }] });
await ad.page.getByRole('button', { name: 'Lưu', exact: true }).click(); await ad.page.waitForTimeout(2500);

gt.section('DMS · Thừa hành viên: Chờ tôi xác nhận', 'Mục này liệt kê các bản nháp người khác soạn và ghi tên bạn. Bạn xem lại nội dung rồi xác nhận lưu chính thức hoặc báo lại người soạn.', [
  'Kiểm tra kỹ từng cột trước khi xác nhận vì sau đó hồ sơ không sửa trực tiếp được.',
], [['Danh sách "Chờ tôi xác nhận" trống', 'Chưa có bản nháp nào ghi tên bạn. Báo người soạn chọn đúng bạn ở ô "Thừa hành viên được ghi tên".']]);
await go(thv.page, '/dms/thv');
await gt.shot(thv.page, { title: 'Chờ tôi xác nhận', note: 'Mỗi dòng là một bản nháp đang chờ bạn. Bấm "Xem và xác nhận" để mở.',
  detail: ['Hồ sơ nháp, Nghiệp vụ, Ngày tạo, Trạng thái: thông tin nhanh để chọn việc.'],
  marks: [{ loc: thv.page.getByRole('link', { name: /Xem và xác nhận/ }).first(), text: 'Mở bản nháp để xem và xác nhận' }] });
await thv.page.getByRole('link', { name: /Xem và xác nhận/ }).first().click(); await thv.page.waitForTimeout(1800);
await gt.shot(thv.page, { title: 'Xem và xác nhận nội dung bản nháp', note: 'Hệ thống hiện lại toàn bộ nội dung hồ sơ và các tài liệu. Đọc kỹ; nếu đúng thì bấm "Tôi xác nhận nội dung này". Nếu người nhập liệu sửa lại sau khi bạn xác nhận, bạn phải xác nhận lại.',
  detail: ['Nội dung hồ sơ: các ô người soạn đã điền (hiển thị chỉ đọc).', 'Tài liệu: các tài liệu đã đính kèm vào bản nháp.'],
  marks: [{ loc: thv.page.getByRole('link', { name: /Chờ tôi xác nhận/ }).first(), text: 'Quay lại danh sách Chờ tôi xác nhận' }, { loc: thv.page.getByText('Nội dung hồ sơ', { exact: true }), text: 'Nội dung hồ sơ cần kiểm tra' }, { loc: thv.page.getByRole('button', { name: 'Tôi xác nhận nội dung này' }), text: 'Xác nhận nội dung (sau đó hồ sơ đủ điều kiện lưu chính thức)' }] });
gt.save(); gk.save(); ga.save(); await b.close(); console.log('done', gt.n, gk.n, ga.n);
