import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = 'C:/Users/phung/Documents/vietpt/nexagnet/legal-office-demo/docs/user-guide';
const ROLES = path.join(ROOT, 'roles'), PDF = path.join(ROOT, 'pdf');
fs.mkdirSync(PDF, { recursive: true });
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const css = `@page{size:A4;margin:16mm 14mm}*{box-sizing:border-box}body{font:11pt/1.5 "Segoe UI",Arial,sans-serif;color:#1b2540}
h1{font-size:26pt;margin:0 0 6pt;color:#14284b}h2{font-size:16pt;margin:18pt 0 6pt;color:#14284b;border-bottom:2px solid #c9a24a;padding-bottom:3pt;page-break-after:avoid}
h3{font-size:12pt;margin:12pt 0 4pt;color:#14284b;page-break-after:avoid}.cover{height:250mm;display:flex;flex-direction:column;justify-content:center;page-break-after:always}
.sub{color:#5a6781;font-size:12pt}.warn{background:#fff7e0;border-left:4px solid #c9a24a;padding:6pt 10pt;margin:8pt 0}
.rules{margin:6pt 0 8pt 0;padding-left:16pt}.step{page-break-inside:avoid;margin:10pt 0 14pt}.step img{width:100%;border:1px solid #cfd6e4;border-radius:6px;margin:4pt 0}
.marks{margin:2pt 0 0 0;padding:0;list-style:none}.marks li{margin:2pt 0}.n{display:inline-block;width:16pt;height:16pt;border-radius:50%;background:#e11d48;color:#fff;font-weight:700;text-align:center;line-height:16pt;font-size:9pt;margin-right:6pt}
.note{color:#3a4763}.foot{color:#7a869f;font-size:9pt;margin-top:14pt}table{border-collapse:collapse;width:100%;font-size:10pt}td,th{border:1px solid #cfd6e4;padding:4pt 6pt;text-align:left;vertical-align:top}th{background:#eef2fb}`;
const html = (j, base) => `<!doctype html><html lang="vi"><meta charset="utf-8"><style>${css}</style><body>
<div class="cover"><div class="sub">Legal Office · Hệ thống quản lý Văn phòng thừa hành viên</div><h1>${esc(j.title)}</h1>
<p class="sub">Hướng dẫn từng bước bằng hình ảnh. Mọi ảnh chụp từ bản chạy thử trên Northflank với dữ liệu giả (tiền tố DEMO).<br>Quy ước: vòng đỏ có số là chỗ cần bấm hoặc nhập, làm theo thứ tự số.</p>
<div class="warn"><b>Ba nguyên tắc của phần mềm.</b> (1) Phần mềm ghi nhận, nhắc và chặn bước sai; người có thẩm quyền mới ký và ban hành, "duyệt" trong phần mềm không phải chữ ký pháp lý. (2) Không làm kế toán: MISA là sổ kế toán duy nhất, phần mềm không lưu số tiền. (3) Không xoá, không sửa âm thầm hồ sơ đã có giá trị pháp lý.</div>
<p class="foot">Phiên bản ${new Date().toLocaleDateString('vi-VN')}</p></div>
${j.sections.map((s, si) => `<h2>${si + 1}. ${esc(s.title)}</h2><p>${esc(s.intro)}</p>
${s.rules?.length ? `<div class="warn"><b>Cần nhớ:</b><ul class="rules">${s.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
${s.steps.map((st, i) => `<div class="step"><h3>Bước ${si + 1}.${i + 1} · ${esc(st.title)}</h3><div class="note">${esc(st.note)}</div>
<img src="file:///${base}/${st.img}">${st.marks.length ? `<ul class="marks">${st.marks.map((m) => `<li><span class="n">${m.n}</span>${esc(m.text)}</li>`).join('')}</ul>` : ''}</div>`).join('')}`).join('')}
</body></html>`;
const only = process.argv[2];
const b = await chromium.launch({ executablePath: 'C:/Users/phung/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' });
for (const f of fs.readdirSync(ROLES).filter((f) => f.endsWith('.json'))) {
  const role = f.replace('.json', ''); if (only && only !== role) continue;
  const j = JSON.parse(fs.readFileSync(path.join(ROLES, f), 'utf8'));
  if (role === 'chung') continue;
  const chung = JSON.parse(fs.readFileSync(path.join(ROLES, 'chung.json'), 'utf8'));
  j.sections = [...chung.sections, ...j.sections];
  const page = await b.newPage();
  const tmp = path.join(ROLES, role + '.html'); fs.writeFileSync(tmp, html(j, ROLES.split(path.sep).join('/')));
  await page.goto('file:///' + tmp.split(path.sep).join('/')); await page.waitForTimeout(500);
  await page.pdf({ path: path.join(PDF, `huong-dan-${role}.pdf`), format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: `<div style="font:8pt sans-serif;width:100%;text-align:center;color:#777">${j.title} · trang <span class="pageNumber"></span>/<span class="totalPages"></span></div>`, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } });
  if (!process.env.KEEP) fs.unlinkSync(tmp); else await page.screenshot({ path: 'preview-' + role + '.png', fullPage: true }); console.log('pdf', role, fs.statSync(path.join(PDF, `huong-dan-${role}.pdf`)).size);
  await page.close();
}
await b.close();
