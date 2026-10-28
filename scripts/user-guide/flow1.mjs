import { browser, asRole, BASE } from './lib.mjs';
const b = await browser();
const api = async (role, method, path, data) => {
  const { ctx } = asRole.cache?.[role] ?? (asRole.cache = { ...asRole.cache, [role]: await asRole(b, role) })[role];
  const r = await ctx.request.fetch(BASE + '/api' + path, { method, data, headers: { 'content-type': 'application/json' } });
  return [r.status(), (await r.text()).slice(0, 200)];
};
const cases = JSON.parse((await (await (await asRole(b,'TRUONG_VP')).ctx.request.get(BASE+'/api/vibang/cases')).text())).items;
const c1 = cases.find(c => /giao nhận tiền/.test(c.title));
console.log('case', c1.id, c1.status);
console.log('misa', await api('KE_TOAN','PUT',`/vibang/cases/${c1.id}/misa`,{status:'CONFIRMED_FULL',reference:'DEMO-MISA-001'}));
console.log('number', await api('VAN_THU','POST',`/vibang/cases/${c1.id}/number`,{}));
console.log('sign', await api('THV','POST',`/vibang/cases/${c1.id}/signature-confirmations`,{}));
console.log('stamp', await api('VAN_THU','POST',`/vibang/cases/${c1.id}/stamp-confirmations`,{}));
await b.close();
