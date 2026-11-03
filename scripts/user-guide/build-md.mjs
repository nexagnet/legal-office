import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Sinh docs/user-guide/huong-dan-su-dung.md từ docs/user-guide/roles/*.json (cùng nguồn với PDF).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/user-guide');
const TITLES = { admin: 'Admin', 'truong-van-phong': 'Trưởng văn phòng', 'thua-hanh-vien': 'Thừa hành viên', 'thu-ky': 'Thư ký', 'van-thu': 'Văn thư', 'ke-toan': 'Kế toán' };
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'roles', f), 'utf8'));
const nice = (t) => t.replace(/^DMS · /, '');
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const lines = [];
const section = (s, num) => {
  lines.push(`### ${num}. ${nice(s.title)}`, '', s.intro, '');
  if (s.rules?.length) { lines.push('**Cần nhớ:**', '', ...s.rules.map((r) => `- ${r}`), ''); }
  s.steps.forEach((st, i) => {
    lines.push(`#### Bước ${num}.${i + 1} · ${st.title}`, '', st.note, '');
    if (st.detail?.length) lines.push(...st.detail.map((d) => `- ${d}`), '');
    lines.push(`![${st.title}](roles/${st.img})`, '');
    if (st.marks.length) lines.push(...st.marks.map((m) => `${m.n}. ${m.text}`), '');
  });
  if (s.problems?.length) {
    lines.push('**Lỗi thường gặp và cách xử lý**', '', '| Hiện tượng | Cách xử lý |', '| --- | --- |', ...s.problems.map(([a, b]) => `| ${cell(a)} | ${cell(b)} |`), '');
  }
};
lines.push('# Legal Office: hướng dẫn sử dụng', '',
  `Bản dựng ${new Date().toLocaleDateString('vi-VN')}. Ảnh chụp từ bản chạy thử với dữ liệu giả (tiền tố [guide], DEMO). Vòng đỏ có số là chỗ cần bấm hoặc nhập, làm theo thứ tự số.`,
  'Tệp này và các PDF trong `pdf/` đều sinh từ `roles/*.json` bằng `scripts/user-guide/build-md.mjs` và `build-pdf.mjs`. Không sửa tay; sửa nguồn rồi dựng lại.', '',
  '## Ba nguyên tắc của phần mềm', '',
  '- **Phần mềm ghi nhận, nhắc và chặn bước sai; người có thẩm quyền mới ký và ban hành.** "Duyệt" trong phần mềm không phải chữ ký pháp lý.',
  '- **Không làm kế toán.** MISA là sổ kế toán duy nhất; phần mềm không lưu số tiền.',
  '- **Không xóa, không sửa âm thầm hồ sơ đã có giá trị pháp lý.** Mọi thay đổi quan trọng lưu người làm, thời điểm và lý do.', '');
let n = 0;
lines.push('## Phần chung cho mọi vai', '');
for (const s of read('chung.json').sections) section(s, ++n);
for (const [r, name] of Object.entries(TITLES)) {
  lines.push(`## Dành cho ${name}`, '');
  for (const s of read(r + '.json').sections) section(s, ++n);
}
fs.writeFileSync(path.join(ROOT, 'huong-dan-su-dung.md'), lines.join('\n') + '\n');
console.log('md', n, 'phần');
