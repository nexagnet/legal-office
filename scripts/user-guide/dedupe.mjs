import fs from 'node:fs';
const D = 'C:/Users/phung/Documents/vietpt/nexagnet/legal-office-demo/docs/user-guide/roles/';
for (const f of fs.readdirSync(D).filter((f) => f.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(D + f)); const m = new Map(); const order = [];
  for (const s of j.sections) { if (!m.has(s.title)) order.push(s.title); m.set(s.title, s); }
  j.sections = order.map((t) => m.get(t)); fs.writeFileSync(D + f, JSON.stringify(j, null, 1));
  const used = new Set(j.sections.flatMap((s) => s.steps.map((t) => t.img))); const dir = f.replace('.json', '');
  for (const p of fs.readdirSync(D + dir)) if (!used.has(dir + '/' + p)) fs.unlinkSync(D + dir + '/' + p);
  console.log(f, j.sections.map((s) => s.title.slice(0, 22)).join(' | '));
}
