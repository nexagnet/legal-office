import { browser, asRole, BASE } from './lib.mjs';
const b = await browser(); const s = {};
const api = async (role, method, path, data) => { s[role] ??= await asRole(b, role); const r = await s[role].ctx.request.fetch(BASE + '/api' + path, { method, data, headers: { 'content-type': 'application/json' } }); const t = await r.text(); return [r.status(), t.slice(0, 120)]; };
const id = process.argv[2];
console.log(await api('ADMIN', 'PUT', `/vibang/cases/${id}/responsible-thv`, { thvUserId: 'e9560730-691b-46f4-89a3-1eb4643fb399' }));
console.log(await api('KE_TOAN', 'PUT', `/vibang/cases/${id}/misa`, { status: 'CONFIRMED_FULL', reference: 'DEMO-MISA-004' }));
console.log(await api('VAN_THU', 'POST', `/vibang/cases/${id}/number`, {}));
await b.close();
