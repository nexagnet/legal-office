import fs from 'node:fs';
import path from 'node:path';
export const OUT = 'C:/Users/phung/Documents/vietpt/nexagnet/legal-office-demo/docs/user-guide/roles';
const overlay = (marks) => {
  const old = document.getElementById('__guide'); if (old) old.remove();
  const root = document.createElement('div'); root.id = '__guide';
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  for (const m of marks) {
    const r = document.createElement('div');
    r.style.cssText = `position:absolute;left:${m.x - 4}px;top:${m.y - 4}px;width:${m.w + 8}px;height:${m.h + 8}px;border:3px solid #e11d48;border-radius:8px;box-shadow:0 0 0 2px rgba(255,255,255,.85)`;
    const n = document.createElement('div');
    n.textContent = String(m.n);
    n.style.cssText = `position:absolute;left:${m.x - 18}px;top:${m.y - 18}px;width:28px;height:28px;border-radius:50%;background:#e11d48;color:#fff;font:700 16px/28px system-ui;text-align:center;box-shadow:0 0 0 2px #fff`;
    root.append(r, n);
  }
  document.body.append(root);
};
export class Guide {
  constructor(role, title) { this.role = role; this.title = title; this.sections = []; this.n = 0; fs.mkdirSync(path.join(OUT, role), { recursive: true });
    const f = path.join(OUT, role + '.json');
    if (fs.existsSync(f) && process.env.APPEND) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); this.sections = j.sections; this.n = Math.max(0, ...j.sections.flatMap(x => x.steps.map(t => Number(t.img.split('/')[1].slice(0, 2))))); } }
  section(title, intro, rules = []) { const cur = { title, intro, rules, steps: [] }; const i = this.sections.findIndex((x) => x.title === title); if (i >= 0) this.sections[i] = cur; else this.sections.push(cur); this.cur = cur; }
  /** marks: [{ loc: Locator, text: 'Bấm ...' }] đánh số 1..n theo thứ tự */
  async shot(page, { title, note, marks = [], full = false, clip }) {
    const boxes = [];
    for (const [i, m] of marks.entries()) {
      const loc = m.loc.first();
      await loc.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    }
    await page.evaluate(() => { const map = [['phungtienviet14@gmail.com', 'admin-demo@example.invalid'], ['phungtienviet14', 'admin-demo'], ['van-thu@van-thu.com', 'van-thu-2@example.invalid']]; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { let t = n.nodeValue; for (const [a, b] of map) t = t.split(a).join(b); if (t !== n.nodeValue) n.nodeValue = t; } });
    await page.waitForTimeout(250);
    for (const [i, m] of marks.entries()) {
      const bb = await m.loc.first().boundingBox({ timeout: 5000 }).catch(() => null);
      if (!bb) { console.log('BỎ QUA mark: ' + m.text); m.skip = true; continue; }
      boxes.push({ n: boxes.length + 1, x: bb.x, y: bb.y, w: bb.width, h: bb.height });
    }
    await page.evaluate(overlay, boxes);
    this.n += 1;
    const file = `${String(this.n).padStart(2, '0')}.png`;
    await page.screenshot({ path: path.join(OUT, this.role, file), fullPage: full, ...(clip ? { clip } : {}) });
    await page.evaluate(() => document.getElementById('__guide')?.remove());
    this.cur.steps.push({ title, note, img: `${this.role}/${file}`, marks: marks.filter(m => !m.skip).map((m, i) => ({ n: i + 1, text: m.text })) });
  }
  save() { fs.writeFileSync(path.join(OUT, this.role + '.json'), JSON.stringify({ role: this.role, title: this.title, sections: this.sections }, null, 1)); }
}
