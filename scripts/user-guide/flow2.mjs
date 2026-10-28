import { browser, asRole, BASE } from './lib.mjs';
const b = await browser();
const sess = {};
const api = async (role, method, path, data) => {
  sess[role] ??= await asRole(b, role);
  const r = await sess[role].ctx.request.fetch(BASE + '/api' + path, { method, data, headers: { 'content-type': 'application/json' } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status(), j };
};
const me = (await api('TRUONG_VP', 'GET', '/auth/me')).j;
const office = me.memberships[0].officeId, branch = me.branches?.[0]?.id;
const thv = 'e9560730-691b-46f4-89a3-1eb4643fb399';
console.log({ office, branch, thv, branches: me.branches });
const log = (n, r) => console.log(n, r.s, JSON.stringify(r.j).slice(0, 160));
const soon = d => new Date(Date.now() + d * 864e5).toISOString();
// Tống đạt
let r = await api('THU_KY', 'POST', '/service-of-documents/requests', { officeId: office, branchId: branch, requestRef: 'DEMO-TD-001' }); log('td-req', r);
const reqId = r.j.label;
for (const [n, a, d] of [['DEMO Nguyễn Văn A', '12 Phố Huế, Hai Bà Trưng, Hà Nội', 5], ['DEMO Công ty TNHH Mẫu', '88 Láng Hạ, Đống Đa, Hà Nội', 7]]) log('td-doc', await api('THU_KY', 'POST', `/service-of-documents/requests/${reqId}/documents`, { recipientName: n, address: a, deadlineAt: soon(d) }));
const docs = (await api('TRUONG_VP', 'GET', '/service-of-documents/documents')).j; console.log('docs', JSON.stringify(docs).slice(0, 300));
const items = docs.items ?? docs; const ids = items.filter(x => /DEMO-TD-001/.test(JSON.stringify(x))).map(x => x.id ?? x.documentId);
console.log('ids', ids);
for (const id of ids) log('td-assign', await api('TRUONG_VP', 'PUT', `/service-of-documents/documents/${id}/handler`, { handlerUserId: thv }));
if (ids[0]) log('td-attempt', await api('THV', 'POST', `/service-of-documents/documents/${ids[0]}/attempts`, { outcome: 'ABSENT' }));
// Xác minh
r = await api('THU_KY', 'POST', '/verification/cases', { officeId: office, branchId: branch, caseRef: 'DEMO-XM-001' }); log('xm', r);
const xm = r.j.label;
log('xm-assign', await api('TRUONG_VP', 'PUT', `/verification/cases/${xm}/handler`, { handlerUserId: thv }));
log('xm-date', await api('THV', 'PUT', `/verification/cases/${xm}/contract-date`, { signedOn: new Date().toISOString().slice(0, 10) }));
r = await api('THV', 'POST', `/verification/cases/${xm}/rounds`, { partyName: 'DEMO Nguyễn Văn B (người phải thi hành)' }); log('xm-round1', r);
log('xm-done1', await api('THV', 'POST', `/verification/rounds/${r.j.label}/completion`, { result: 'DEMO: Đã xác minh tại UBND phường, đương sự có một tài khoản ngân hàng đứng tên.' }));
r = await api('THV', 'POST', `/verification/cases/${xm}/rounds`, { partyName: 'DEMO Công ty TNHH Xây dựng Mẫu' }); log('xm-round2', r);
// THA
r = await api('THU_KY', 'POST', '/enforcement-cases', { officeId: office, branchId: branch, caseRef: 'DEMO-THA-001', agreementRef: 'DEMO-HD-001', decisionRef: 'DEMO Bản án số 12/2026/DS-ST' }); log('tha', r);
const th = r.j.label;
log('tha-assign', await api('TRUONG_VP', 'PUT', `/enforcement-cases/${th}/handler`, { handlerUserId: thv }));
const p1 = await api('THV', 'POST', `/enforcement-cases/${th}/parties`, { displayName: 'DEMO Nguyễn Văn C', kind: 'PERSON', role: 'CREDITOR' }); log('party1', p1);
const p2 = await api('THV', 'POST', `/enforcement-cases/${th}/parties`, { displayName: 'DEMO Công ty CP Mẫu', kind: 'ORGANIZATION', role: 'DEBTOR' }); log('party2', p2);
const ob = await api('THV', 'POST', `/enforcement-cases/${th}/obligations`, { description: 'DEMO: Trả khoản nợ theo bản án và bàn giao tài liệu liên quan', obligorPartyId: p2.j.label }); log('oblig', ob);
log('tha-evt', await api('THV', 'POST', `/enforcement-cases/obligations/${ob.j.label}/events`, { kind: 'PARTIAL_RESULT', note: 'DEMO: Người phải thi hành đã thực hiện một phần nghĩa vụ.', idempotencyKey: 'demo-evt-1' }));
await b.close();
