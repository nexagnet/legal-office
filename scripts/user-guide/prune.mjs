import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Làm sạch bộ hướng dẫn: bỏ phần cũ không còn trên giao diện, xóa ảnh không còn được tham chiếu và kiểm tra nội dung.
// Dùng: node prune.mjs [--write]   (không có --write chỉ báo cáo)
const ROLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/user-guide/roles');
const write = process.argv.includes('--write');
const KEEP = /^(DMS ·|Quản trị ·)/;
const used = new Set(); let problems = 0;
const BAD = [/yêu cầu sửa đổi/i, /phungtienviet/i, /@gmail\.com/i, /@yahoo/i, /code\.run/i];
for (const f of fs.readdirSync(ROLES).filter((x) => x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(ROLES, f), 'utf8'));
  const before = j.sections.length;
  if (f !== 'chung.json') j.sections = j.sections.filter((s) => KEEP.test(s.title));
  for (const s of j.sections) for (const st of s.steps) {
    used.add(st.img);
    if (!fs.existsSync(path.join(ROLES, st.img))) { console.log('THIẾU ẢNH', f, st.img); problems++; }
    const text = JSON.stringify([s.title, s.intro, s.rules, s.problems, st.title, st.note, st.detail, st.marks]);
    for (const re of BAD) if (re.test(text)) { console.log('CẤM', re, f, s.title, '|', st.title); problems++; }
    if (/bấm|nhập|điền|chọn/i.test(st.note) && st.marks.length === 0) console.log('CHƯA KHOANH', f, st.title);
  }
  console.log(f, 'phần', before, '->', j.sections.length, 'bước', j.sections.reduce((n, s) => n + s.steps.length, 0));
  if (write) fs.writeFileSync(path.join(ROLES, f), JSON.stringify(j, null, 1));
}
let removed = 0;
for (const d of fs.readdirSync(ROLES, { withFileTypes: true }).filter((x) => x.isDirectory())) {
  for (const p of fs.readdirSync(path.join(ROLES, d.name)).filter((x) => x.endsWith('.png'))) {
    if (!used.has(`${d.name}/${p}`)) { removed++; if (write) fs.unlinkSync(path.join(ROLES, d.name, p)); }
  }
}
console.log(write ? 'đã xóa' : 'sẽ xóa', removed, 'ảnh không dùng;', problems, 'lỗi nội dung');
if (problems) process.exitCode = 1;
