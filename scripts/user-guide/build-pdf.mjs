import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
// Dựng PDF hướng dẫn từ docs/user-guide/roles/*.json: 6 PDF theo vai (phần chung + phần của vai) và 1 bản đầy đủ.
// Dùng: node build-pdf.mjs [vai|day-du]   (GUIDE_SHA=<mã bản deploy> để ghi lên bìa)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/user-guide');
const ROLES = path.join(ROOT, 'roles'), PDF = path.join(ROOT, 'pdf');
fs.mkdirSync(PDF, { recursive: true });
const TITLES = { admin: 'Admin', 'truong-van-phong': 'Trưởng văn phòng', 'thua-hanh-vien': 'Thừa hành viên', 'thu-ky': 'Thư ký', 'van-thu': 'Văn thư', 'ke-toan': 'Kế toán' };
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const nice = (t) => String(t).replace(/^DMS · /, ''); // bỏ tiền tố kỹ thuật khi hiển thị tiêu đề phần
const css = `@page{size:A4;margin:16mm 14mm}*{box-sizing:border-box}body{font:11pt/1.55 "Segoe UI",Arial,sans-serif;color:#1b2540}
h1{font-size:26pt;margin:0 0 6pt;color:#14284b}h2{font-size:16pt;margin:20pt 0 6pt;color:#14284b;border-bottom:2px solid #c9a24a;padding-bottom:3pt;page-break-after:avoid}
h3{font-size:12pt;margin:12pt 0 4pt;color:#14284b;page-break-after:avoid}.part{font-size:20pt;color:#14284b;margin:0 0 8pt;page-break-before:always}
.cover{height:250mm;display:flex;flex-direction:column;justify-content:center;page-break-after:always}
.sub{color:#5a6781;font-size:12pt}.warn{background:#fff7e0;border-left:4px solid #c9a24a;padding:6pt 10pt;margin:8pt 0}
.rules{margin:6pt 0 4pt 0;padding-left:16pt}.step{page-break-inside:avoid;margin:10pt 0 16pt}.step img{width:100%;border:1px solid #cfd6e4;border-radius:6px;margin:4pt 0}
.marks{margin:2pt 0 0 0;padding:0;list-style:none}.marks li{margin:2pt 0}.n{display:inline-block;width:16pt;height:16pt;border-radius:50%;background:#e11d48;color:#fff;font-weight:700;text-align:center;line-height:16pt;font-size:9pt;margin-right:6pt}
.note{color:#3a4763;margin-bottom:4pt}.detail{margin:4pt 0 4pt 0;padding-left:16pt;color:#26324d;font-size:10pt}.detail li{margin:1.5pt 0}
.foot{color:#7a869f;font-size:9pt;margin-top:14pt}table{border-collapse:collapse;width:100%;font-size:10pt;margin:6pt 0 10pt}td,th{border:1px solid #cfd6e4;padding:4pt 6pt;text-align:left;vertical-align:top}th{background:#eef2fb}
.toc{page-break-after:always}.toc ol{margin:6pt 0;padding-left:0;list-style:none}.toc li{margin:2pt 0}.toc .p{font-weight:700;margin-top:10pt}
.problems{page-break-inside:avoid}h2+p{page-break-after:avoid}.warn{page-break-inside:avoid}`;
const principles = `<div class="warn"><b>Ba nguyên tắc của phần mềm.</b> (1) Phần mềm ghi nhận, nhắc và chặn bước sai; người có thẩm quyền mới ký và ban hành, "duyệt" trong phần mềm không phải chữ ký pháp lý. (2) Không làm kế toán: MISA là sổ kế toán duy nhất, phần mềm không lưu số tiền. (3) Không xóa, không sửa âm thầm hồ sơ đã có giá trị pháp lý.</div>`;
const stamp = () => `Phiên bản ${new Date().toLocaleDateString('vi-VN')}${process.env.GUIDE_SHA ? ` · bản chạy ${process.env.GUIDE_SHA}` : ''}`;
const cover = (title) => `<div class="cover"><div class="sub">Legal Office · Hệ thống quản lý hồ sơ Văn phòng thi hành án dân sự</div><h1>${esc(title)}</h1>
<p class="sub">Hướng dẫn từng bước bằng hình ảnh. Mọi ảnh chụp từ bản chạy thử với dữ liệu giả (tiền tố [guide], DEMO), không có dữ liệu khách thật.<br>Quy ước: vòng đỏ có số là chỗ cần bấm hoặc nhập, làm theo thứ tự số. Khung "Cần nhớ" là quy tắc nghiệp vụ; bảng "Lỗi thường gặp" cuối mỗi phần giúp tự xử lý.</p>
${principles}<p class="foot">${esc(stamp())}</p></div>`;
const sectionHtml = (s, base, num) => `<h2>${num}. ${esc(nice(s.title))}</h2><p>${esc(s.intro)}</p>
${s.rules?.length ? `<div class="warn"><b>Cần nhớ:</b><ul class="rules">${s.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
${s.steps.map((st, i) => `<div class="step"><h3>Bước ${num}.${i + 1} · ${esc(st.title)}</h3><div class="note">${esc(st.note)}</div>
${st.detail?.length ? `<ul class="detail">${st.detail.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
<img src="file:///${base}/${st.img}">${st.marks.length ? `<ul class="marks">${st.marks.map((m) => `<li><span class="n">${m.n}</span>${esc(m.text)}</li>`).join('')}</ul>` : ''}</div>`).join('')}
${s.problems?.length ? `<div class="problems"><h3>Lỗi thường gặp và cách xử lý</h3><table><tr><th style="width:38%">Hiện tượng</th><th>Cách xử lý</th></tr>${s.problems.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table></div>` : ''}`;
const tocHtml = (parts) => { let n = 0; return `<div class="toc"><h2>Mục lục</h2><ol>${parts.map((p) => `${p.title ? `<li class="p">${esc(p.title)}</li>` : ''}${p.sections.map((s) => `<li>${++n}. ${esc(nice(s.title))}</li>`).join('')}`).join('')}</ol></div>`; };
const body = (parts, base) => { let n = 0; return parts.map((p) => `${p.title ? `<h1 class="part">${esc(p.title)}</h1>` : ''}${p.sections.map((s) => sectionHtml(s, base, ++n)).join('')}`).join(''); };
const page = (title, parts, base) => `<!doctype html><html lang="vi"><meta charset="utf-8"><style>${css}</style><body>${cover(title)}${tocHtml(parts)}${body(parts, base)}</body></html>`;
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROLES, f), 'utf8'));
const only = process.argv[2];
const b = await chromium.launch({ executablePath: 'C:/Users/phung/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' });
const base = ROLES.split(path.sep).join('/');
const chung = read('chung.json');
const out = async (name, title, parts) => {
  const pg = await b.newPage(); const tmp = path.join(ROLES, name + '.html');
  fs.writeFileSync(tmp, page(title, parts, base)); await pg.goto('file:///' + tmp.split(path.sep).join('/')); await pg.waitForTimeout(800);
  await pg.pdf({ path: path.join(PDF, `huong-dan-${name}.pdf`), format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: `<div style="font:8pt sans-serif;width:100%;text-align:center;color:#777">${esc(title)} · trang <span class="pageNumber"></span>/<span class="totalPages"></span></div>`, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } });
  fs.unlinkSync(tmp); console.log('pdf', name, (fs.statSync(path.join(PDF, `huong-dan-${name}.pdf`)).size / 1048576).toFixed(1) + ' MB'); await pg.close();
};
const roles = Object.keys(TITLES);
if (only !== 'day-du') for (const r of roles) { if (only && only !== r) continue; const j = read(r + '.json'); await out(r, `Hướng dẫn dành cho ${TITLES[r]}`, [{ sections: chung.sections }, { sections: j.sections }]); }
if (!only || only === 'day-du') await out('day-du', 'Hướng dẫn sử dụng đầy đủ', [{ title: 'Phần chung cho mọi vai', sections: chung.sections }, ...roles.map((r) => ({ title: `Dành cho ${TITLES[r]}`, sections: read(r + '.json').sections }))]);
await b.close();
