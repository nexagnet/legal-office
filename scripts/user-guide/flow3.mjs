import { browser, asRole, BASE } from './lib.mjs';
const b = await browser(); const sess = {};
const api = async (role, method, path, data) => { sess[role] ??= await asRole(b, role); const r = await sess[role].ctx.request.fetch(BASE + '/api' + path, { method, data, headers: { 'content-type': 'application/json' } }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status(), j }; };
const log = (n, r) => console.log(n, r.s, JSON.stringify(r.j).slice(0, 140));
const office = 'cd3e75c3-487e-4ed5-835f-ef954e005e29', branch = '2fa21040-323d-4a04-914e-1ee1af815c9e';
const R = process.argv[2];
for (const [n, u, q, out] of [['DEMO Giấy in A4', 'ram', 40, 12], ['DEMO Mực in', 'hộp', 6, 4], ['DEMO Bút bi xanh', 'cái', 100, 0]]) {
  const it = await api(R, 'POST', '/office/items', { officeId: office, name: n, unit: u }); log('item', it);
  if (it.s !== 200) continue;
  log('rcv', await api(R, 'POST', `/office/items/${it.j.label}/receipts`, { branchId: branch, quantity: q, receiptRef: 'DEMO-PN-' + n.slice(5, 9) }));
  if (out) log('iss', await api(R, 'POST', `/office/items/${it.j.label}/issues`, { branchId: branch, quantity: out, purpose: 'DEMO: dùng cho văn phòng' }));
}
await b.close();
