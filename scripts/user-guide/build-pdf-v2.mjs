import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
// Dựng PDF hướng dẫn bản mới (v2) từ docs/user-guide/v2/*.json. Dùng: node build-pdf-v2.mjs [đường dẫn PDF đầu ra]
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/user-guide/v2');
const OUT = process.argv[2] ?? path.join(ROOT, 'huong-dan-su-dung.pdf');
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const css = `@page{size:A4;margin:15mm 14mm}*{box-sizing:border-box}body{font:10.5pt/1.5 "Segoe UI","Noto Sans",Arial,sans-serif;color:#1b2540}
h1{font-size:26pt;margin:0 0 6pt;color:#14284b}h2{font-size:16pt;margin:0 0 6pt;color:#14284b;border-bottom:2px solid #c9a24a;padding-bottom:3pt;page-break-after:avoid;page-break-before:always}
h3{font-size:11.5pt;margin:0 0 3pt;color:#14284b;page-break-after:avoid}.cover{height:255mm;display:flex;flex-direction:column;justify-content:center;page-break-after:always}
.sub{color:#5a6781;font-size:11.5pt}.warn{background:#fff7e0;border-left:4px solid #c9a24a;padding:5pt 10pt;margin:8pt 0;page-break-inside:avoid}
.rules{margin:3pt 0 2pt;padding-left:16pt}.step{page-break-inside:avoid;margin:10pt 0 14pt}.step img{display:block;max-width:100%;max-height:205mm;width:auto;margin-left:auto;margin-right:auto;border:1px solid #cfd6e4;border-radius:6px;margin:4pt 0}
.marks{margin:2pt 0 0;padding:0;list-style:none;columns:2;column-gap:14pt}.marks li{margin:2pt 0;font-size:10pt;break-inside:avoid}
.n{display:inline-block;width:15pt;height:15pt;border-radius:50%;background:#e11d48;color:#fff;font-weight:700;text-align:center;line-height:15pt;font-size:9pt;margin-right:5pt}
.note{color:#3a4763;margin-bottom:3pt}.foot{color:#7a869f;font-size:9pt;margin-top:14pt}table{border-collapse:collapse;width:100%;font-size:9.5pt;margin:6pt 0 10pt;page-break-inside:avoid}
td,th{border:1px solid #cfd6e4;padding:3pt 6pt;text-align:left;vertical-align:top}th{background:#eef2fb}.toc ol{margin:6pt 0;padding-left:0;list-style:none}.toc li{margin:3pt 0}`;
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const parts = [read('nghiep-vu.json'), read('quan-tri.json')];
const sections = parts.flatMap((p) => p.sections.map((s) => ({ ...s, base: ROOT.split(path.sep).join('/') })));
const roleTable = `<table><tr><th style="width:20%">Vai</th><th>Làm được</th></tr>
<tr><td>Admin</td><td>Quản lý tài khoản, nhóm quyền, chi nhánh, cài đặt; duyệt bản trình; sửa hồ sơ đã ghi sổ (có lý do); xem lịch sử, báo cáo.</td></tr>
<tr><td>Thừa hành viên</td><td>Tạo hồ sơ nháp, tải scan, xác nhận lưu chính thức, đánh dấu Đã trả kết quả ở bốn nghiệp vụ.</td></tr>
<tr><td>Thư ký</td><td>Tạo hồ sơ nháp và tải scan; không xác nhận lưu chính thức.</td></tr>
<tr><td>Văn thư</td><td>Ba sổ văn thư (đến, đi, nội bộ); xem bốn nghiệp vụ.</td></tr>
<tr><td>Kế toán</td><td>Nhập, xuất, kiểm kê văn phòng phẩm.</td></tr>
<tr><td>Báo cáo tổng hợp</td><td>Xem số liệu tổng hợp toàn văn phòng.</td></tr></table>`;
const principles = `<div class="warn"><b>Ba nguyên tắc.</b> (1) Phần mềm ghi nhận, nhắc và chặn bước sai; người có thẩm quyền mới ký và ban hành, "duyệt" trong phần mềm không phải chữ ký pháp lý. (2) Không làm kế toán: MISA là sổ kế toán duy nhất, phần mềm không lưu số tiền. (3) Không xóa, không sửa âm thầm hồ sơ đã có giá trị pháp lý; mọi thay đổi lưu người làm, thời điểm, lý do.</div>`;
const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Legal Office: hướng dẫn sử dụng</title><style>${css}</style><body>
<div class="cover"><div class="sub">Legal Office · Quản lý văn phòng thừa hành viên</div><h1>Hướng dẫn sử dụng</h1>
<p class="sub">Hướng dẫn từng bước bằng ảnh chụp màn hình. <b>Vòng đỏ có số</b> là chỗ cần bấm hoặc nhập; làm theo thứ tự số.<br>Mọi ảnh chụp từ văn phòng minh họa: tên người, số liệu và hồ sơ trong ảnh đều là dữ liệu giả.</p>${principles}
<p class="foot">Phiên bản ${new Date().toLocaleDateString('vi-VN')}</p></div>
<div class="toc"><h2 style="page-break-before:avoid">Mục lục</h2><ol>${sections.map((s, i) => `<li>${i + 1}. ${esc(s.title)}</li>`).join('')}</ol><h3 style="margin-top:14pt">Các vai trong phần mềm</h3>${roleTable}</div>
${sections.map((s, n) => `<h2>${n + 1}. ${esc(s.title)}</h2><p>${esc(s.intro)}</p>
${s.rules?.length ? `<div class="warn"><b>Cần nhớ:</b><ul class="rules">${s.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
${s.steps.map((st, i) => `<div class="step"><h3>Bước ${n + 1}.${i + 1} · ${esc(st.title)}</h3><div class="note">${esc(st.note)}</div><img src="file:///${s.base}/${st.img}">${st.marks.length ? `<ul class="marks">${st.marks.map((m) => `<li><span class="n">${m.n}</span>${esc(m.text)}</li>`).join('')}</ul>` : ''}</div>`).join('')}
${s.problems?.length ? `<h3>Lỗi thường gặp</h3><table><tr><th style="width:36%">Hiện tượng</th><th>Cách xử lý</th></tr>${s.problems.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>` : ''}`).join('')}
</body></html>`;
const b = await chromium.launch({ executablePath: process.env.GUIDE_CHROME ?? 'C:/Users/phung/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', args: ['--no-sandbox'] });
const pg = await b.newPage(); const tmp = path.join(ROOT, 'tmp.html'); fs.writeFileSync(tmp, html);
await pg.goto('file://' + tmp); await pg.waitForTimeout(1000);
await pg.pdf({ path: OUT, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font:8pt sans-serif;width:100%;text-align:center;color:#777">Legal Office · Hướng dẫn sử dụng · trang <span class="pageNumber"></span>/<span class="totalPages"></span></div>', margin: { top: '15mm', bottom: '15mm', left: '14mm', right: '14mm' } });
fs.unlinkSync(tmp); await b.close(); console.log('pdf', OUT, (fs.statSync(OUT).size / 1048576).toFixed(1) + ' MB');
