import { browser, asRole, BASE } from './lib.mjs';
const b = await browser(); const s = {};
const api = async (role, method, path, data) => { s[role] ??= await asRole(b, role); const r = await s[role].ctx.request.fetch(BASE + '/api' + path, { method, data, headers: { 'content-type': 'application/json' } }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status(), j }; };
const office = 'cd3e75c3-487e-4ed5-835f-ef954e005e29', branch = '2fa21040-323d-4a04-914e-1ee1af815c9e', thv = 'e9560730-691b-46f4-89a3-1eb4643fb399';
const ref = process.argv[2];
const r = await api('THU_KY', 'POST', '/service-of-documents/requests', { officeId: office, branchId: branch, requestRef: ref });
const d = await api('THU_KY', 'POST', `/service-of-documents/requests/${r.j.label}/documents`, { recipientName: 'DEMO Trần Thị D', address: '5 Bạch Mai, Hai Bà Trưng, Hà Nội', deadlineAt: new Date(Date.now() + 6 * 864e5).toISOString() });
console.log(d.j.label, (await api('TRUONG_VP', 'PUT', `/service-of-documents/documents/${d.j.label}/handler`, { handlerUserId: thv })).s);
await b.close();
